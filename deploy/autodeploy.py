#!/usr/bin/env python3
"""Pull only main commits that passed the repository's release workflow."""
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

REPO = 'danizima/facadepro'
APP = Path('/opt/facadepro')
STATE = Path('/var/lib/facadepro-deploy')
UPDATER = Path('/usr/local/lib/facadepro/update-timeweb.py')
WORKFLOW = '.github/workflows/release.yml'

def api(path):
    request = urllib.request.Request('https://api.github.com/repos/' + REPO + '/' + path,
        headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'facadepro-deploy/1.0'})
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)

def eligible(runs, sha):
    matching = [r for r in runs if r.get('head_sha') == sha and r.get('head_branch') == 'main'
        and r.get('event') == 'push' and r.get('path') == WORKFLOW
        and r.get('repository', {}).get('full_name') == REPO]
    if not matching:
        return False
    latest = max(matching, key=lambda r: r.get('run_number', 0))
    return latest.get('status') == 'completed' and latest.get('conclusion') == 'success'

def write_status(value):
    temporary = STATE / 'status.tmp'
    temporary.write_text(json.dumps(value, ensure_ascii=False) + '\n')
    os.replace(temporary, STATE / 'status.json')

def main():
    if os.geteuid() != 0:
        raise RuntimeError('Запустите от root.')
    os.umask(0o077)
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = open(STATE / 'lock', 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    sha = api('git/ref/heads/main')['object']['sha']
    if not re.fullmatch('[a-f0-9]{40}', sha):
        raise RuntimeError('Некорректный SHA выпуска.')
    old = json.loads((STATE / 'status.json').read_text()) if (STATE / 'status.json').exists() else {}
    if old.get('failed') == sha:
        print('Этот выпуск уже завершился ошибкой. Жду исправленный коммит.'); return
    current = subprocess.check_output(['git', '-C', str(APP), 'rev-parse', 'HEAD'], text=True).strip()
    if current == sha and old.get('deployed') == sha:
        print('Установлен актуальный выпуск.'); return
    runs = api('actions/workflows/release.yml/runs?branch=main&event=push&head_sha=' + sha + '&per_page=10')['workflow_runs']
    if not eligible(runs, sha):
        write_status({**old, 'waiting': sha}); print('Жду успешные проверки выпуска ' + sha[:8]); return
    # Confirm that the checked commit is still the published head.
    if api('git/ref/heads/main')['object']['sha'] != sha:
        print('Появился новый коммит. Проверю его при следующем запуске.'); return
    result = subprocess.run(['python3', str(UPDATER), sha])
    if result.returncode:
        write_status({'failed': sha, 'previous': current})
        raise RuntimeError('Обновление не прошло. Повтор этого коммита отключён; проверьте журнал и состояние сайта.')
    write_status({'deployed': sha, 'previous': current})
    print('Установлен и проверен выпуск ' + sha)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Автообновление: ' + str(error), file=sys.stderr)
        sys.exit(1)
