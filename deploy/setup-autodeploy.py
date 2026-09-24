#!/usr/bin/env python3
"""One-time installation for the existing facadepro VPS; no SSH keys required."""
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

def main():
    if os.geteuid() != 0 or len(sys.argv) != 2 or not re.fullmatch('[a-f0-9]{40}', sys.argv[1]):
        raise RuntimeError('Запустите от root и укажите полный SHA выпуска.')
    if not Path('/opt/facadepro/.git').is_dir() or not Path('/opt/facadepro/.env').is_file():
        raise RuntimeError('Не найдена существующая установка ФАСАД.PRO.')
    os.umask(0o077)
    target = Path('/usr/local/lib/facadepro')
    target.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Fetch every file before altering the running timer.
    files = {}
    for name in ('autodeploy.py', 'update-timeweb.py'):
        url = 'https://raw.githubusercontent.com/danizima/facadepro/' + sys.argv[1] + '/deploy/' + name
        with urllib.request.urlopen(url, timeout=30) as response:
            value = response.read(100000)
        compile(value, name, 'exec')
        files[name] = value
    active = subprocess.run(['systemctl', 'is-active', '--quiet', 'facadepro-deploy.service'])
    if active.returncode == 0:
        raise RuntimeError('Сейчас идёт обновление. Дождитесь завершения и повторите установку таймера.')
    subprocess.run(['systemctl', 'stop', 'facadepro-deploy.timer'], check=False, capture_output=True)
    for name, value in files.items():
        path = target / name
        path.write_bytes(value); path.chmod(0o700)
    service = '''[Unit]
Description=Install checked Facadepro releases
Wants=network-online.target
After=network-online.target docker.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /usr/local/lib/facadepro/autodeploy.py
TimeoutStartSec=0
UMask=0077
StandardOutput=journal
StandardError=journal
'''
    timer = '''[Unit]
Description=Check Facadepro releases every five minutes
[Timer]
OnBootSec=2min
OnUnitInactiveSec=5min
RandomizedDelaySec=30
Persistent=true
Unit=facadepro-deploy.service
[Install]
WantedBy=timers.target
'''
    for name, value in [('facadepro-deploy.service', service), ('facadepro-deploy.timer', timer)]:
        path = Path('/etc/systemd/system') / name
        path.write_text(value); path.chmod(0o644)
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'enable', '--now', 'facadepro-deploy.timer'], check=True)
    subprocess.run(['systemctl', 'start', '--no-block', 'facadepro-deploy.service'], check=True)
    print('Автообновление включено. Выпуски устанавливаются только после успешных проверок GitHub.')
    print('Первый выпуск устанавливается в фоне; это сообщение ещё не подтверждает его запуск.')
    print('Посмотреть результат: journalctl -u facadepro-deploy.service -n 60 --no-pager')
    print('Отключить: systemctl disable --now facadepro-deploy.timer')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('ОСТАНОВКА: ' + str(error), file=sys.stderr)
        sys.exit(1)
