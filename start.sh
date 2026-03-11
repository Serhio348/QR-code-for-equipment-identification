#!/bin/sh
set -e

LISTEN_PORT="${PORT:-80}"
echo "==> Starting nginx on port $LISTEN_PORT (PORT env: '${PORT}')"

sed -i "s/listen 80 default_server/listen $LISTEN_PORT default_server/g" /etc/nginx/conf.d/default.conf

echo "==> nginx.conf listen lines after substitution:"
grep "listen" /etc/nginx/conf.d/default.conf || true

echo "==> Checking dist files:"
ls /usr/share/nginx/html/ || true

echo "==> Starting nginx..."
exec nginx -g 'daemon off;'
