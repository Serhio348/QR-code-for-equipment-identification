#!/bin/sh
set -e

# Get PORT from environment variable, default to 80
PORT=${PORT:-80}

echo "PORT environment variable: $PORT"
echo "Contents of /usr/share/nginx/html:"
ls -la /usr/share/nginx/html/ | head -10
echo "Starting nginx on port $PORT"

# Create nginx config with PORT substitution
# Use sed to replace PORT placeholder
sed "s/\${PORT}/$PORT/g" /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Verify config file was created
if [ ! -f /etc/nginx/conf.d/default.conf ]; then
    echo "ERROR: Failed to create nginx config file"
    exit 1
fi

# Show generated config (first few lines)
echo "Generated nginx config (first 5 lines):"
head -5 /etc/nginx/conf.d/default.conf

# Verify nginx is listening on the correct port
echo "Checking if nginx will listen on port $PORT..."
netstat -tlnp 2>/dev/null || echo "netstat not available, skipping port check"

# Test nginx configuration
echo "Testing nginx configuration..."
nginx -t

# Show full nginx config for debugging
echo "Full nginx config:"
cat /etc/nginx/conf.d/default.conf

# Start nginx
echo "Starting nginx on port $PORT..."
exec nginx -g 'daemon off;'

