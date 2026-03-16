#!/bin/sh
set -e

LISTEN_PORT="${PORT:-80}"
sed -i "s/listen 80 default_server/listen $LISTEN_PORT default_server/g" /etc/nginx/conf.d/default.conf
sed -i "s/listen \[::\]:80 default_server/listen [::]:$LISTEN_PORT default_server/g" /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
