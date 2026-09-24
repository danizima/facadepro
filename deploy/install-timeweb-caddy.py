#!/usr/bin/env python3
"""Install facadepro.ru alongside the existing Timeweb gateway and Docker Caddy.

Run as root on 193.124.47.248. No gateway restarts, DNS edits or volume deletion.
The active Caddy configuration is checked, backed up and gracefully reloaded.
"""
import fcntl
import ipaddress
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import socket
import subprocess
import sys
import time

APP = Path('/opt/facadepro')
REPO = 'https://github.com/danizima/facadepro.git'
DOMAIN = 'facadepro.ru'
IPV4 = '193.124.47.248'
IPV6 = '2a03:6f00:a::2:c69a'
CADDY = 'timeweb-token-gateway-caddy-1'
GATEWAY = 'timeweb-token-gateway-timeweb-gateway-1'
ALIAS = 'facadepro-website'
BLOCK = ('\n# BEGIN FACADEPRO MANAGED SITE\n'
         'facadepro.ru {\n'
         '    reverse_proxy facadepro-website:8080\n'
         '}\n# END FACADEPRO MANAGED SITE\n')
STAGE = 'проверка'


class SetupError(Exception):
    pass


def check(condition, message):
    if not condition:
        raise SetupError(message)


def say(message):
    print('\n' + message, flush=True)


def run(*args, stdin=None, live=False, timeout=60):
    result = subprocess.run(args, input=stdin, text=True, capture_output=not live,
                            timeout=timeout, check=False)
    if result.returncode:
        # Captured Caddy JSON and container metadata can include secrets.
        # Never dump those contents into console diagnostics.
        raise SetupError('Не выполнена команда: ' + ' '.join(args[:6]))
    return result.stdout or ''


def inspect(name):
    return json.loads(run('docker', 'inspect', name))[0]


def dc(*args, **kwargs):
    # Default discovery also loads our persistent compose.override.yaml.
    return run('docker', 'compose', '--project-name', 'facadepro',
               '--project-directory', str(APP), *args, **kwargs)


def layout(caddy, gateway):
    check(caddy['State']['Running'] and gateway['State']['Running'],
          'Caddy или шлюз Timeweb сейчас не запущен.')
    args = caddy.get('Args', [])
    check('--resume' not in args and '--config' in args,
          'Caddy использует нестандартный способ загрузки конфигурации.')
    conf = args[args.index('--config') + 1]
    check(conf.startswith('/') and '\n' not in conf,
          'Ожидался абсолютный путь конфигурации Caddy.')
    if '--adapter' in args:
        check(args[args.index('--adapter') + 1] == 'caddyfile',
              'Caddy использует другой формат конфигурации.')
    mounts = [m for m in caddy.get('Mounts', []) if m['Type'] in ('bind', 'volume')
              and (conf == m['Destination'] or conf.startswith(m['Destination'].rstrip('/') + '/'))]
    check(bool(mounts), 'Файл Caddy не находится на постоянном диске. Нужна проверка конфигурации.')
    mount = max(mounts, key=lambda m: len(m['Destination']))
    relative = conf[len(mount['Destination']):].lstrip('/')
    host_file = Path(mount['Source']) / relative if relative else Path(mount['Source'])
    check('..' not in PurePosixPath(relative).parts, 'Неожиданный путь конфигурации.')
    common = set(caddy['NetworkSettings']['Networks']) & set(gateway['NetworkSettings']['Networks'])
    common -= {'host', 'bridge', 'none'}
    check(len(common) == 1, 'Не удалось однозначно определить общую Docker-сеть Caddy и шлюза.')
    return conf, host_file, next(iter(common))


def config_hosts(value):
    hosts = set()
    if isinstance(value, dict):
        for key, child in value.items():
            if key == 'host' and isinstance(child, list):
                hosts.update(v.lower() for v in child if isinstance(v, str))
            else:
                hosts.update(config_hosts(child))
    elif isinstance(value, list):
        for child in value:
            hosts.update(config_hosts(child))
    return hosts


def candidate_file(original, adapted):
    if DOMAIN in config_hosts(adapted):
        check(original.count(BLOCK) == 1,
              'facadepro.ru уже есть в чужой или изменённой конфигурации Caddy. Она сохранена.')
        return original
    check('BEGIN FACADEPRO MANAGED SITE' not in original,
          'Обнаружен неполный блок сайта. Требуется проверка Caddyfile.')
    return original.rstrip() + '\n' + BLOCK


def write_same_inode(path, contents, expected=None):
    # A Docker bind mount of one file must retain its inode; no rename/mv here.
    with path.open('r+', encoding='utf-8', newline='') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        previous = stream.read()
        check(expected is None or previous == expected,
              'Конфигурация была изменена параллельно; автоматическая запись отменена.')
        stream.seek(0)
        stream.write(contents)
        stream.truncate()
        stream.flush()
        os.fsync(stream.fileno())


def main():
    global STAGE
    check(os.geteuid() == 0, 'Запустите установщик от root.')
    check(len(sys.argv) == 1 or sys.argv[1:] == ['--check'], 'Допустимый параметр: --check.')
    os.umask(0o077)
    for program in ('docker', 'ip', 'git', 'curl'):
        check(shutil.which(program), 'Не найдена программа ' + program + '. Установка остановлена.')
    addresses = json.loads(run('ip', '-j', '-4', 'address', 'show'))
    check(any(a.get('local') == IPV4 for i in addresses for a in i.get('addr_info', [])),
          'Этот установщик предназначен для сервера ' + IPV4 + '.')
    lock = open('/run/lock/facadepro-install.lock', 'w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SetupError('Другой установщик уже работает.')
    run('docker', 'compose', 'version')
    caddy, gateway = inspect(CADDY), inspect(GATEWAY)
    config, host_file, network = layout(caddy, gateway)
    check(host_file.is_file(), 'Не найден файл Caddy на сервере.')
    original = host_file.read_text(encoding='utf-8')
    workdir = str(PurePosixPath(config).parent)

    def caddy_cmd(*args, stdin=None):
        return run('docker', 'exec', '-i', '-w', workdir, CADDY, 'caddy', *args,
                   stdin=stdin, timeout=90)

    def active_config():
        return json.loads(run('docker', 'exec', CADDY, 'wget', '-qO-',
                              'http://127.0.0.1:2019/config/'))

    baseline = json.loads(caddy_cmd('adapt', '--config', config, '--adapter', 'caddyfile'))
    check(active_config() == baseline,
          'Активные настройки Caddy отличаются от файла или изменены через API. Они сохранены.')
    candidate = candidate_file(original, baseline)
    proposed = json.loads(caddy_cmd('adapt', '--config', '-', '--adapter', 'caddyfile',
                                    '--validate', stdin=candidate))
    check(config_hosts(baseline).issubset(config_hosts(proposed)),
          'Новая конфигурация не сохраняет прежние домены.')

    # Reject a conflicting alias before joining the gateway network.
    net = json.loads(run('docker', 'network', 'inspect', network))[0]
    for container_id in net.get('Containers', {}):
        info = inspect(container_id)
        aliases = info['NetworkSettings']['Networks'].get(network, {}).get('Aliases') or []
        if ALIAS in aliases:
            labels = info['Config'].get('Labels') or {}
            check(labels.get('com.docker.compose.project') == 'facadepro' and
                  labels.get('com.docker.compose.service') == 'app',
                  'Имя сайта во внутренней сети уже занято другим контейнером.')

    listener = socket.socket()
    try:
        listener.bind(('127.0.0.1', 8080))
    except OSError:
        own = run('docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=facadepro',
                  '--filter', 'label=com.docker.compose.service=app').strip()
        check(bool(own), 'Порт 8080 занят другим приложением.')
        bindings = inspect(own)['NetworkSettings']['Ports'].get('8080/tcp') or []
        check(any(b['HostIp'] == '127.0.0.1' and b['HostPort'] == '8080' for b in bindings),
              'Порт 8080 не принадлежит ожидаемому контейнеру сайта.')
    finally:
        listener.close()

    expected = {ipaddress.ip_address(IPV4), ipaddress.ip_address(IPV6)}
    actual = {ipaddress.ip_address(r[4][0]) for r in socket.getaddrinfo(DOMAIN, 443, type=socket.SOCK_STREAM)}
    check(actual and actual.issubset(expected) and ipaddress.ip_address(IPV4) in actual,
          'DNS домена пока указывает на другой сервер. Записи не изменялись.')
    override = {'services': {'app': {'networks': {'default': {}, 'gateway': {'aliases': [ALIAS]}}}},
                'networks': {'gateway': {'external': True, 'name': network}}}
    override_file = APP / 'compose.override.yaml'
    if APP.exists():
        check((APP / '.git').is_dir(), '/opt/facadepro уже занят другим проектом.')
        check(run('git', '-C', str(APP), 'remote', 'get-url', 'origin').strip() == REPO,
              'В /opt/facadepro другой репозиторий.')
        check(not run('git', '-C', str(APP), 'status', '--porcelain').strip(),
              'В проекте есть локальные изменения. Они сохранены.')
    if override_file.exists():
        check(json.loads(override_file.read_text()) == override,
              'В проекте есть другая конфигурация сети. Она сохранена.')
    env = APP / '.env'
    if env.exists():
        entries = dict(line.split('=', 1) for line in env.read_text().splitlines()
                       if '=' in line and not line.startswith('#'))
        check(entries.get('PUBLIC_URL', '').rstrip('/') == 'https://' + DOMAIN,
              'PUBLIC_URL в существующем .env отличается. Настройки сохранены.')

    say('Проверки пройдены. Caddy, шлюз Timeweb, DNS и свободный порт сайта проверены.')
    if sys.argv[1:] == ['--check']:
        return
    STAGE = 'скачивание и сборка сайта'
    if not APP.exists():
        run('git', 'clone', '--branch', 'main', REPO, str(APP), live=True, timeout=300)
    else:
        say('Используется существующий проект; исходники автоматически не заменяются.')
    if not env.exists():
        shutil.copyfile(APP / '.env.example', env)
    env.chmod(0o600)
    exclude = APP / '.git/info/exclude'
    exclusions = exclude.read_text() if exclude.exists() else ''
    if '/compose.override.yaml' not in exclusions.splitlines():
        with exclude.open('a') as stream:
            stream.write('\n/compose.override.yaml\n')
    if not override_file.exists():
        override_file.write_text(json.dumps(override, indent=2) + '\n')
    dc('config', '--quiet')
    dc('up', '-d', '--build', live=True, timeout=1200)
    for attempt in range(60):
        try:
            check(json.loads(run('curl', '-fsS', '--max-time', '3',
                                 'http://127.0.0.1:8080/healthz')).get('ok') is True,
                  'Неверный ответ приложения.')
            break
        except (SetupError, ValueError):
            time.sleep(2)
    else:
        raise SetupError('Сайт не запустился. Журнал: cd /opt/facadepro && docker compose logs --tail=80 app')
    upstream = run('docker', 'exec', CADDY, 'wget', '-qO-', 'http://' + ALIAS + ':8080/healthz')
    check(json.loads(upstream).get('ok') is True, 'Caddy пока не видит контейнер сайта.')

    STAGE = 'сохранение конфигурации и подключение домена'
    check(active_config() == baseline, 'Настройки Caddy изменились во время сборки. Запись отменена.')
    if candidate != original:
        backup = Path('/root/facadepro-backups') / time.strftime('%Y%m%d-%H%M%S')
        backup.mkdir(parents=True, mode=0o700)
        (backup / 'Caddyfile.before').write_text(original)
        (backup / 'config.before.json').write_text(json.dumps(baseline))
        say('Резервная копия конфигурации: ' + str(backup))
        write_same_inode(host_file, candidate, expected=original)
        try:
            # Read through the existing Docker bind mount before the reload.
            mounted = json.loads(caddy_cmd('adapt', '--config', config, '--adapter', 'caddyfile', '--validate'))
            check(mounted == proposed, 'Caddy не видит новую конфигурацию.')
            caddy_cmd('reload', '--config', config, '--adapter', 'caddyfile')
            check(active_config() == proposed, 'Caddy не подтвердил новую конфигурацию.')
        except Exception:
            # Restore only if nobody edited the file/config after this installer.
            current = active_config()
            check(current in (baseline, proposed),
                  'Параллельно изменены настройки Caddy. Сохранена резервная копия, автоматический откат отменён.')
            write_same_inode(host_file, original, expected=candidate)
            caddy_cmd('reload', '--config', config, '--adapter', 'caddyfile')
            raise SetupError('Новая конфигурация не принята. Прежняя конфигурация восстановлена.')

    STAGE = 'проверка HTTPS'
    say('Домен подключён. Ожидаю HTTPS-сертификат от Caddy…')
    for attempt in range(60):
        try:
            health = run('curl', '-fsS', '--max-time', '5', '--resolve', DOMAIN + ':443:127.0.0.1',
                         'https://' + DOMAIN + '/healthz')
            check(json.loads(health).get('ok') is True, 'Сайт пока недоступен по HTTPS.')
            break
        except (SetupError, ValueError):
            if attempt and attempt % 10 == 0:
                say('Caddy ещё получает сертификат; остальные домены продолжают обслуживаться.')
            time.sleep(3)
    else:
        raise SetupError('Сайт запущен, но выпуск HTTPS-сертификата ещё не подтверждён. Пришлите эту строку.')
    run('curl', '-fsS', '--max-time', '15', '--resolve', DOMAIN + ':443:127.0.0.1',
        'https://' + DOMAIN + '/projects/museum.html', '-o', '/dev/null')

    STAGE = 'создание администратора'
    count = dc('exec', '-T', 'app', 'node', '--input-type=module', '-e',
               "import {db} from './backend/store.mjs'; console.log(db.prepare('SELECT COUNT(*) AS n FROM admins').get().n); db.close();").strip()
    check(count.isdigit(), 'Не удалось проверить пользователей панели.')
    if int(count) == 0:
        credentials = Path('/root/facadepro-admin.txt')
        check(not credentials.exists(), 'Файл доступа уже есть. Проверьте подключение прежнего тома данных.')
        result = dc('exec', '-T', 'app', 'node', 'scripts/create-admin.mjs', 'admin')
        with credentials.open('x') as stream:
            stream.write(result)
        say('Сохраните пароль у себя. Не отправляйте его в чат:\n' + result)
    else:
        say('Пользователи панели уже существуют. Их пароли сохранены.')
    say('ГОТОВО: https://facadepro.ru\nПанель: https://facadepro.ru/admin/')
    say('Caddy и шлюз Timeweb не перезапускались. Данные сайта хранятся в постоянном Docker-томе.')
    say('Для почты заполните SMTP в /opt/facadepro/.env и выполните: cd /opt/facadepro && docker compose up -d')


if __name__ == '__main__':
    try:
        main()
    except (SetupError, OSError, ValueError, KeyError, IndexError, subprocess.TimeoutExpired) as error:
        print('\nОСТАНОВКА, этап «' + STAGE + '»: ' + str(error), file=sys.stderr)
        sys.exit(1)
