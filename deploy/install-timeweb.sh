#!/usr/bin/env bash
# Installer for the existing facadepro.ru server. Run as root in its console.
# Never deletes Docker volumes, replaces existing credentials or changes DNS.
set -Eeuo pipefail
umask 077

DOMAIN=facadepro.ru
EXPECTED_IPV4=193.124.47.248
EXPECTED_IPV6=2a03:6f00:a::2:c69a
REPOSITORY=https://github.com/danizima/facadepro.git
APP_DIR=/opt/facadepro
NGINX_SITE=/etc/nginx/sites-available/facadepro
CREDENTIALS=/root/facadepro-admin.txt
MARKER='# Managed by facadepro installer'
STAGE=preflight

say() { printf '\n%s\n' "$*"; }
fail() { printf '\nОСТАНОВКА: %s\n' "$*" >&2; exit 1; }
trap 'printf "\nУстановка прервана, этап: %s, строка: %s. Данные не удалялись.\n" "$STAGE" "$LINENO" >&2' ERR
dc() { docker compose --project-name facadepro --project-directory "$APP_DIR" -f "$APP_DIR/compose.yaml" "$@"; }

[[ ${EUID} -eq 0 ]] || fail 'Запустите установщик от root.'
[[ $# -eq 0 || ${1:-} == --check ]] || fail 'Допустим только необязательный параметр --check.'
[[ -r /etc/os-release ]] || fail 'Не удалось определить ОС.'
. /etc/os-release
[[ ${ID:-} == ubuntu && ${VERSION_ID:-} == 24.04 ]] || fail 'Этот установщик рассчитан на Ubuntu 24.04.'
command -v ip >/dev/null || fail 'Для проверки сервера нужна команда ip.'
ip -4 -o address show | awk '{print $4}' | cut -d/ -f1 | grep -Fxq "$EXPECTED_IPV4" || fail "Это не сервер $EXPECTED_IPV4."
exec 9>/run/lock/facadepro-install.lock
flock -n 9 || fail 'Другой экземпляр установщика уже работает.'

# Refuse port conflicts and unowned domain configuration before making changes.
for port in 80 443; do
    listeners=$(ss -H -ltnp "sport = :$port")
    if [[ -n $listeners ]] && printf '%s\n' "$listeners" | grep -v '"nginx"' >/dev/null; then
        fail "Порт $port занят другим сервисом. Его настройки сохранены; пришлите сообщение об этой остановке."
    fi
done
listeners=$(ss -H -ltnp 'sport = :8080')
if [[ -n $listeners ]]; then
    command -v docker >/dev/null || fail 'Порт 8080 занят другим приложением.'
    own_container=$(docker ps -q --filter label=com.docker.compose.project=facadepro --filter label=com.docker.compose.service=app)
    [[ -n $own_container ]] || fail 'Порт 8080 занят другим приложением.'
fi

if [[ -e $NGINX_SITE || -L $NGINX_SITE ]]; then
    [[ -f $NGINX_SITE && ! -L $NGINX_SITE ]] || fail 'Неожиданный тип файла конфигурации Nginx.'
    grep -Fxq "$MARKER" "$NGINX_SITE" || fail 'Для facadepro уже есть конфигурация Nginx. Автоматическая замена запрещена.'
fi
if command -v nginx >/dev/null; then
    nginx_dump=$(nginx -T 2>&1) || fail 'Существующая конфигурация Nginx содержит ошибку.'
    conflicts=$(printf '%s\n' "$nginx_dump" | awk '
        /^# configuration file / {file=$4; sub(/:$/, "", file)}
        /^[[:space:]]*server_name[[:space:]]/ && /facadepro[.]ru/ {
            if (file != "/etc/nginx/sites-enabled/facadepro" && file != "/etc/nginx/sites-available/facadepro") print file
        }')
    [[ -z $conflicts ]] || fail 'Домен уже настроен в другом файле Nginx. Автоматическая замена запрещена.'
fi
if [[ -e $APP_DIR ]]; then
    [[ -d $APP_DIR/.git ]] || fail '/opt/facadepro уже существует и не является Git-репозиторием.'
    [[ $(git -C "$APP_DIR" remote get-url origin) == "$REPOSITORY" ]] || fail 'В /opt/facadepro находится другой репозиторий.'
    [[ -z $(git -C "$APP_DIR" status --porcelain) ]] || fail 'В проекте есть локальные изменения; они сохранены.'
    [[ $(git -C "$APP_DIR" branch --show-current) == main ]] || fail 'В проекте выбрана другая ветка.'
fi
if [[ -e $APP_DIR/.env ]]; then
    grep -Eq '^PUBLIC_URL=https://facadepro[.]ru/?$' "$APP_DIR/.env" || fail 'PUBLIC_URL в существующем .env отличается. Файл сохранён.'
fi

say 'Предварительная проверка пройдена. Сервер и существующие конфигурации проверены.'
if [[ ${1:-} == --check ]]; then exit 0; fi

STAGE=packages
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git nginx nano python3 snapd
if ! command -v docker >/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl --fail --silent --show-error --retry 3 https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version >/dev/null || fail 'Docker установлен, но нет Compose v2. Существующая установка Docker сохранена.'
systemctl enable --now docker nginx

STAGE=source
if [[ ! -d $APP_DIR ]]; then
    git clone --branch main "$REPOSITORY" "$APP_DIR"
else
    say 'Используется существующий проект. Исходники автоматически не заменяются.'
fi
if [[ ! -e $APP_DIR/.env ]]; then
    install -m 0600 "$APP_DIR/.env.example" "$APP_DIR/.env"
fi
chmod 600 "$APP_DIR/.env"
dc config --quiet

STAGE=build
dc up -d --build
ready=0
for attempt in {1..60}; do
    if curl --fail --silent --max-time 3 http://127.0.0.1:8080/healthz | grep -Fq '"ok":true'; then ready=1; break; fi
    sleep 2
done
[[ $ready -eq 1 ]] || fail 'Приложение не прошло проверку. Журнал: cd /opt/facadepro && docker compose logs --tail=80 app'

STAGE=nginx
if [[ ! -f $NGINX_SITE ]]; then
    cat > "$NGINX_SITE" <<'NGINX'
# Managed by facadepro installer
server {
    listen 80;
    listen [::]:80;
    server_name facadepro.ru;
    client_max_body_size 27m;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 100s;
        proxy_send_timeout 100s;
    }
}
NGINX
    chmod 644 "$NGINX_SITE"
fi
if [[ ! -e /etc/nginx/sites-enabled/facadepro && ! -L /etc/nginx/sites-enabled/facadepro ]]; then
    ln -s "$NGINX_SITE" /etc/nginx/sites-enabled/facadepro
fi
nginx -t
systemctl reload nginx

STAGE=dns
python3 - "$DOMAIN" "$EXPECTED_IPV4" "$EXPECTED_IPV6" <<'PY'
import socket, sys, ipaddress
domain, ipv4, ipv6 = sys.argv[1:]
try:
    addresses = {ipaddress.ip_address(r[4][0]) for r in socket.getaddrinfo(domain, 443, type=socket.SOCK_STREAM)}
except socket.gaierror:
    raise SystemExit('DNS домена пока недоступен. Повторите установщик после обновления DNS.')
expected = {ipaddress.ip_address(ipv4), ipaddress.ip_address(ipv6)}
if not addresses or not addresses.issubset(expected) or ipaddress.ip_address(ipv4) not in addresses:
    raise SystemExit('DNS домена ещё указывает на другой сервер. Записи автоматически не изменялись.')
print('DNS домена указывает на этот сервер.')
PY

STAGE=https
if ! command -v certbot >/dev/null; then
    systemctl enable --now snapd.socket
    snap install --classic certbot
    [[ -e /usr/local/bin/certbot ]] || ln -s /snap/bin/certbot /usr/local/bin/certbot
fi
# Certbot asks the owner for email and agreement with certificate terms.
# No unattended agreement or password entry is performed by this installer.
certbot --nginx --redirect --keep-until-expiring -d "$DOMAIN"
certbot renew --dry-run
curl --fail --silent --show-error --max-time 20 "https://$DOMAIN/healthz" | grep -Fq '"ok":true' || fail 'Проверка HTTPS не пройдена.'
curl --fail --silent --show-error --max-time 20 "https://$DOMAIN/projects/museum.html" -o /dev/null

STAGE=admin
admin_count=$(dc exec -T app node --input-type=module -e "import {db} from './backend/store.mjs'; console.log(db.prepare('SELECT COUNT(*) AS n FROM admins').get().n); db.close();")
[[ $admin_count =~ ^[0-9]+$ ]] || fail 'Не удалось проверить пользователей панели.'
if [[ $admin_count -eq 0 ]]; then
    [[ ! -e $CREDENTIALS ]] || fail 'Сохранённый файл доступа уже существует. Проверьте подключение прежнего тома с данными.'
    dc exec -T app node scripts/create-admin.mjs admin > "$CREDENTIALS"
    chmod 600 "$CREDENTIALS"
    say 'Создан администратор. Сохраните эти данные у себя; не отправляйте пароль в чат:'
    cat "$CREDENTIALS"
else
    say 'В панели уже есть пользователи. Их пароли сохранены.'
fi
STAGE=done
say 'ГОТОВО: https://facadepro.ru'
say 'Панель: https://facadepro.ru/admin/'
say 'Заявки и вложения сохраняются в постоянном Docker-томе. Том не удалялся.'
say 'Почта: заполните SMTP-параметры в /opt/facadepro/.env и выполните: cd /opt/facadepro && docker compose up -d'
say 'Резервное копирование Timeweb подключается отдельно. Установщик не заказывает платные услуги.'
