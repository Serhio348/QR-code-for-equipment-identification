#!/bin/sh

echo "=== ENTRYPOINT START ===" >&2
echo "Script started successfully" >&2

set -e

# Railway proxies to port 80 inside the container
# So we always listen on port 80, regardless of PORT env var
NGINX_PORT=80

echo "🚀 Starting container initialization..."
echo "PORT environment variable: ${PORT:-not set}"
echo "Railway proxies to port 80, nginx will listen on port $NGINX_PORT"

# Check if nginx user already exists (created during nginx installation)
if id -u nginx > /dev/null 2>&1; then
    echo "✅ nginx user already exists"
else
    echo "Creating nginx user..."
    adduser -D -H -u 101 -s /sbin/nologin nginx || true
fi

echo "📂 Contents of /usr/share/nginx/html:"
ls -la /usr/share/nginx/html/ | head -10

# Create nginx config directories if they don't exist
mkdir -p /etc/nginx/conf.d
mkdir -p /var/log/nginx
mkdir -p /var/lib/nginx/tmp
mkdir -p /run/nginx

# Set proper permissions
chown -R nginx:nginx /var/log/nginx /var/lib/nginx /run/nginx 2>/dev/null || true

# Create main nginx.conf with http block that includes our server config
cat > /etc/nginx/nginx.conf <<EOF
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /run/nginx/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '\$remote_addr - \$remote_user [\$time_local] "\$request" '
                    '\$status \$body_bytes_sent "\$http_referer" '
                    '"\$http_user_agent" "\$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Include server configurations
    include /etc/nginx/conf.d/*.conf;
}
EOF

# Create nginx config with fixed port 80
echo "📝 Creating nginx server config..."
sed "s/\${PORT}/$NGINX_PORT/g" /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Verify config file was created
if [ ! -f /etc/nginx/conf.d/default.conf ]; then
    echo "❌ ERROR: Failed to create nginx config file"
    exit 1
fi

echo "✅ Nginx config created successfully"

# Show generated config (first few lines)
echo "📋 Generated nginx config (first 5 lines):"
head -5 /etc/nginx/conf.d/default.conf

# Test nginx configuration
echo "🔍 Testing nginx configuration..."
nginx -t 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Nginx configuration test failed!"
    echo "Full nginx config:"
    cat /etc/nginx/conf.d/default.conf
    exit 1
fi

echo "✅ Nginx configuration test passed"

# Start nginx
echo "🎯 Starting nginx on port $NGINX_PORT..."
exec nginx -g 'daemon off;'

