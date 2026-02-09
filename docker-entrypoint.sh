#!/bin/sh

echo "=== ENTRYPOINT START ===" >&2
echo "Script started successfully" >&2

# Don't exit on errors yet - we want to see what fails
set +e

# Use PORT from environment, default to 8080 if not set
NGINX_PORT=${PORT:-8080}

echo "🚀 Starting container initialization..."
echo "PORT environment variable: ${PORT:-not set}"
echo "Nginx will listen on port: $NGINX_PORT"
echo "Current directory: $(pwd)"
echo "User: $(whoami)"

# Check if nginx is installed
if ! command -v nginx > /dev/null 2>&1; then
    echo "❌ ERROR: nginx command not found!"
    exit 1
fi
echo "✅ nginx found: $(which nginx)"

# Check if nginx user already exists (created during nginx installation)
if id -u nginx > /dev/null 2>&1; then
    echo "✅ nginx user already exists"
else
    echo "Creating nginx user..."
    adduser -D -H -u 101 -s /sbin/nologin nginx 2>&1
    if [ $? -ne 0 ]; then
        echo "⚠️ Warning: Could not create nginx user (might already exist)"
    fi
fi

echo "📂 Contents of /usr/share/nginx/html:"
ls -la /usr/share/nginx/html/ 2>&1 | head -10

# Create nginx config directories if they don't exist
echo "Creating nginx directories..."
mkdir -p /etc/nginx/conf.d 2>&1
mkdir -p /var/log/nginx 2>&1
mkdir -p /var/lib/nginx/tmp 2>&1
mkdir -p /run/nginx 2>&1

# Set proper permissions - don't fail if this doesn't work
echo "Setting permissions..."
chown -R nginx:nginx /var/log/nginx /var/lib/nginx /run/nginx 2>&1 || echo "⚠️ Warning: Could not set all permissions"

# Check if mime.types exists
if [ ! -f /etc/nginx/mime.types ]; then
    echo "❌ ERROR: /etc/nginx/mime.types not found!"
    echo "Available files in /etc/nginx:"
    ls -la /etc/nginx/ 2>&1
    exit 1
fi
echo "✅ mime.types found"

# Create main nginx.conf with http block that includes our server config
echo "Creating main nginx.conf..."
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

if [ $? -ne 0 ]; then
    echo "❌ ERROR: Failed to create /etc/nginx/nginx.conf"
    exit 1
fi
echo "✅ Main nginx.conf created"

# Create nginx config with dynamic port
echo "📝 Creating nginx server config..."
if [ ! -f /etc/nginx/templates/default.conf.template ]; then
    echo "❌ ERROR: Template file not found: /etc/nginx/templates/default.conf.template"
    exit 1
fi

sed "s/\${PORT}/$NGINX_PORT/g" /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
if [ $? -ne 0 ]; then
    echo "❌ ERROR: Failed to create server config"
    exit 1
fi

# Verify config file was created
if [ ! -f /etc/nginx/conf.d/default.conf ]; then
    echo "❌ ERROR: Server config file was not created"
    exit 1
fi

echo "✅ Server config created successfully"

# Show generated config (first few lines)
echo "📋 Generated server config (first 10 lines):"
head -10 /etc/nginx/conf.d/default.conf 2>&1

# Test nginx configuration
echo "🔍 Testing nginx configuration..."
nginx -t 2>&1
TEST_RESULT=$?

if [ $TEST_RESULT -ne 0 ]; then
    echo "❌ Nginx configuration test failed!"
    echo "Full server config:"
    cat /etc/nginx/conf.d/default.conf 2>&1
    echo ""
    echo "Full main config:"
    cat /etc/nginx/nginx.conf 2>&1
    exit 1
fi

echo "✅ Nginx configuration test passed"

# Enable error exit from here
set -e

# Start nginx
echo "🎯 Starting nginx on port $NGINX_PORT..."
echo "Command: nginx -g 'daemon off;'"
exec nginx -g 'daemon off;'

