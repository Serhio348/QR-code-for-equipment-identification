# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build arguments for VITE environment variables
# Railway passes environment variables as build args automatically
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_SERVICE_ROLE_KEY
ARG VITE_EQUIPMENT_API_URL
ARG VITE_AI_CONSULTANT_API_URL
ARG VITE_BELIOT_API_BASE_URL
ARG VITE_BELIOT_API_KEY
ARG VITE_BELIOT_LOGIN

# Validate required environment variables
RUN echo "🔍 Validating build arguments..." && \
    if [ -z "$VITE_SUPABASE_URL" ]; then \
        echo "❌ ERROR: VITE_SUPABASE_URL is required but not set!" && \
        exit 1; \
    fi && \
    if [ -z "$VITE_SUPABASE_ANON_KEY" ]; then \
        echo "❌ ERROR: VITE_SUPABASE_ANON_KEY is required but not set!" && \
        exit 1; \
    fi && \
    echo "✅ Required variables are set"

# Create .env file from build args for Vite to use during build
# Railway automatically passes all environment variables as build args
RUN echo "📝 Creating .env file from build args..." && \
    echo "VITE_SUPABASE_URL=${VITE_SUPABASE_URL}" > .env && \
    echo "VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}" >> .env && \
    [ -n "$VITE_SUPABASE_SERVICE_ROLE_KEY" ] && echo "VITE_SUPABASE_SERVICE_ROLE_KEY=${VITE_SUPABASE_SERVICE_ROLE_KEY}" >> .env || true && \
    [ -n "$VITE_EQUIPMENT_API_URL" ] && echo "VITE_EQUIPMENT_API_URL=${VITE_EQUIPMENT_API_URL}" >> .env || true && \
    [ -n "$VITE_AI_CONSULTANT_API_URL" ] && echo "VITE_AI_CONSULTANT_API_URL=${VITE_AI_CONSULTANT_API_URL}" >> .env || true && \
    [ -n "$VITE_BELIOT_API_BASE_URL" ] && echo "VITE_BELIOT_API_BASE_URL=${VITE_BELIOT_API_BASE_URL}" >> .env || true && \
    [ -n "$VITE_BELIOT_API_KEY" ] && echo "VITE_BELIOT_API_KEY=${VITE_BELIOT_API_KEY}" >> .env || true && \
    [ -n "$VITE_BELIOT_LOGIN" ] && echo "VITE_BELIOT_LOGIN=${VITE_BELIOT_LOGIN}" >> .env || true && \
    echo "✅ .env file created" && \
    cat .env && \
    echo "Checking VITE_SUPABASE_URL: $(head -1 .env | cut -d'=' -f2 | cut -c1-30)..."

# Build the application
RUN echo "🔨 Starting Vite build..." && \
    npm run build && \
    echo "✅ Build completed successfully" && \
    ls -la dist/ && \
    echo "📦 dist/ directory contents:" && \
    find dist -type f | head -20

# Production stage
FROM node:20-alpine

# Install nginx and envsubst for serving static files
RUN apk add --no-cache nginx gettext && \
    mkdir -p /etc/nginx/conf.d && \
    mkdir -p /etc/nginx/templates

# Set working directory for cron jobs
WORKDIR /app

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy source code and dependencies for cron job execution
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules ./node_modules

# Verify dist files exist
RUN echo "📋 Verifying copied files in /usr/share/nginx/html/:" && \
    ls -la /usr/share/nginx/html/ && \
    FILE_COUNT=$(find /usr/share/nginx/html -type f | wc -l) && \
    echo "Total files copied: $FILE_COUNT" && \
    if [ "$FILE_COUNT" -lt 5 ]; then \
        echo "❌ ERROR: Expected more files in dist directory!" && \
        echo "Something went wrong during build or copy" && \
        exit 1; \
    fi && \
    echo "✅ Dist directory looks good"

# Copy nginx configuration template
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Expose port (Railway will set PORT env var)
EXPOSE 80

# Create nginx config and start nginx directly (bypassing entrypoint for debugging)
CMD /bin/sh -c "mkdir -p /etc/nginx/conf.d /var/log/nginx /run/nginx && \
    sed 's/\${PORT}/80/g' /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && \
    echo '=== Starting nginx ===' && \
    nginx -g 'daemon off;'"

