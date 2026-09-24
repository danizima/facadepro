#!/usr/bin/env python3
"""Upgrade an existing facadepro installation to a pinned release commit."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request

APP = Path('/opt/facadepro')
REPO = 'https://github.com/danizima/facadepro.git'
DOMAIN = 'facadepro.ru'
VERSION = '6.0.0'

def command(*args, live=False, timeout=60):
    p = subprocess.run(args, text=True, capture_output=not live, timeout=timeout)
    if p.returncode:
        raise RuntimeError('Не выполнена команда: ' + ' '.join(args[:5]))
    return (p.stdout or '').strip()

def compose(*args, **kwargs):
    return command('docker', 'compose', '--project-name', 'facadepro',
                   '--project-directory', str(APP), *args, **kwargs)

def require(value, message):
    if not value:
        raise RuntimeError(message)

def inspect(container):
    return json.loads(command('docker', 'inspect', container))[0]

def health(version=None):
    for attempt in range(40):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=3) as r:
                result = json.load(r)
            if result.get('ok') is True and (not version or result.get('version') == version):
                return
        except (OSError, ValueError):
            pass
        time.sleep(1)
    raise RuntimeError('Приложение не подтвердило готовность.')

def main():
    require(os.geteuid() == 0, 'Запустите обновление от root.')
    require(len(sys.argv) == 2 and re.fullmatch(r'[a-f0-9]{40}', sys.argv[1]),
            'Укажите полный SHA опубликованного выпуска после имени скрипта.')
    target = sys.argv[1]
    os.umask(0o077)
    lock = open('/run/lock/facadepro-install.lock', 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    require((APP / '.git').is_dir() and (APP / '.env').is_file(),
            'Не найдена существующая установка в /opt/facadepro.')
    require(command('git', '-C', str(APP), 'remote', 'get-url', 'origin') == REPO,
            'В каталоге другой репозиторий.')
    require(command('git', '-C', str(APP), 'symbolic-ref', '--short', 'HEAD') == 'main',
            'Установка использует другую ветку. Обновление отменено.')
    require(not command('git', '-C', str(APP), 'status', '--porcelain'),
            'Есть локальные изменения. Они сохранены; обновление отменено.')
    compose('config', '--quiet')
    old_commit = command('git', '-C', str(APP), 'rev-parse', 'HEAD')
    cid = compose('ps', '-q', 'app')
    require(bool(cid) and '\n' not in cid, 'Ожидался один запущенный контейнер сайта.')
    before = inspect(cid)
    require(before['State']['Running'], 'Сайт сейчас не запущен.')
    labels = before['Config'].get('Labels') or {}
    require(labels.get('com.docker.compose.project') == 'facadepro',
            'Контейнер не принадлежит этому проекту.')
    mounts = [m for m in before['Mounts'] if m['Destination'] == '/data' and m['Type'] == 'volume']
    require(len(mounts) == 1, 'Не удалось определить постоянный том сайта.')
    volume = mounts[0]
    data = Path(volume['Source'])
    require((data / 'facadepro.sqlite').is_file() and (data / 'secret').is_file(),
            'В томе не найдены существующие данные сайта.')
    old_image, image_tag = before['Image'], before['Config']['Image']
    require(image_tag in ('facadepro-app', 'facadepro-app:latest'),
            'Используется нестандартный образ приложения. Обновление отменено.')
    command('git', '-C', str(APP), 'fetch', 'origin', 'main', timeout=180)
    command('git', '-C', str(APP), 'merge-base', '--is-ancestor', old_commit, target)
    command('git', '-C', str(APP), 'merge-base', '--is-ancestor', target, 'origin/main')
    manifest = json.loads(command('git', '-C', str(APP), 'show', target + ':package.json'))
    require(manifest['name'] == 'facadepro-website' and manifest['version'] == VERSION,
            'Этот установщик рассчитан на выпуск ' + VERSION + '.')
    if old_commit == target:
        health(VERSION)
        print('Версия ' + VERSION + ' уже установлена.')
        return
    backup = Path('/root/facadepro-backups') / (time.strftime('%Y%m%d-%H%M%S') + '-v6-update')
    backup.mkdir(parents=True, mode=0o700)
    (backup / 'previous-commit.txt').write_text(old_commit + '\n')
    (backup / 'previous-image.txt').write_text(old_image + '\n')
    shutil.copyfile(APP / '.env', backup / 'env.before')
    for name in ('compose.yaml', 'compose.override.yaml'):
        if (APP / name).is_file():
            shutil.copyfile(APP / name, backup / name)
    changed = stopped = False
    try:
        print('Собираю новую версию. Текущий сайт продолжает работать.', flush=True)
        command('git', '-C', str(APP), 'merge', '--ff-only', target)
        changed = True
        compose('build', 'app', live=True, timeout=1200)
        print('Создаю резервную копию. Сайт будет ненадолго остановлен.', flush=True)
        stopped = True
        compose('stop', '--timeout', '45', 'app', timeout=90)
        require(not inspect(cid)['State']['Running'], 'Не подтверждена остановка приложения для копирования.')
        with tarfile.open(backup / 'data.tar.gz', 'w:gz', compresslevel=3) as stream:
            for item in data.iterdir():
                # Rendered pages are reproducible. Keep database/WAL, uploads,
                # media and the encryption key; never back up a live SQLite copy.
                if not item.name.startswith('render-'):
                    stream.add(item, arcname=item.name)
        print('Копия сохранена: ' + str(backup), flush=True)
        compose('up', '-d', '--no-build', 'app', live=True, timeout=180)
        new = inspect(compose('ps', '-q', 'app'))
        require(any(m.get('Name') == volume['Name'] and m['Destination'] == '/data'
                    for m in new['Mounts']), 'Новая версия подключила другой том.')
        health(VERSION)
        require(json.loads(command('curl', '-fsS', '--max-time', '15', '--resolve',
                                   DOMAIN + ':443:127.0.0.1', 'https://' + DOMAIN + '/healthz'))['version'] == VERSION,
                'Версия сайта по HTTPS не совпадает.')
        for url in ('/', '/projects/museum.html', '/admin/'):
            command('curl', '-fsS', '--max-time', '15', '--resolve', DOMAIN + ':443:127.0.0.1',
                    'https://' + DOMAIN + url, '-o', '/dev/null')
        print('\nГОТОВО: ФАСАД.PRO ' + VERSION + ' — https://' + DOMAIN)
        print('Заявки, фотографии, настройки и учётные записи сохранены.')
        print('Настройка почты и Telegram: панель /admin/ → Уведомления.')
        print('Резервная копия: ' + str(backup))
    except Exception as error:
        print('\nОбновление остановлено: ' + str(error), file=sys.stderr)
        try:
            if changed:
                require(command('git', '-C', str(APP), 'rev-parse', 'HEAD') == target,
                        'Исходники изменены параллельно. Автоматический откат отменён.')
                command('git', '-C', str(APP), 'reset', '--keep', old_commit)
                command('docker', 'image', 'tag', old_image, image_tag)
            if stopped:
                # Additive migrations permit rollback without losing new leads.
                compose('up', '-d', '--no-build', 'app', live=True, timeout=180)
                health()
            print('Прежняя версия приложения восстановлена. Данные не откатывались.', file=sys.stderr)
        except Exception as rollback:
            print('Автоматический откат не подтверждён: ' + str(rollback), file=sys.stderr)
        print('Резервные материалы: ' + str(backup), file=sys.stderr)
        raise SystemExit(1)

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        print('ОСТАНОВКА: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
