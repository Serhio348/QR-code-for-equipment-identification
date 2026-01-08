#!/bin/sh
set -e

# Get PORT from environment variable, default to 80
PORT=${PORT:-80}

echo "Starting nginx on port $PORT"

# Replace PORT in nginx config template
envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Verify config file was created
if [ ! -f /etc/nginx/conf.d/default.conf ]; then
    echo "ERROR: Failed to create nginx config file"
    exit 1
fi

# Test nginx configuration
nginx -t

# Start nginx
echo "Starting nginx..."
exec nginx -g 'daemon off;'

