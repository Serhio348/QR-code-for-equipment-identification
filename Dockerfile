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
ARG VITE_BELIOT_API_BASE_URL
ARG VITE_BELIOT_API_KEY
ARG VITE_BELIOT_LOGIN

# Create .env file from build args for Vite to use during build
# Railway automatically passes all environment variables as build args
RUN echo "Creating .env file from build args..." && \
    echo "VITE_SUPABASE_URL=${VITE_SUPABASE_URL}" > .env && \
    echo "VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}" >> .env && \
    [ -n "$VITE_SUPABASE_SERVICE_ROLE_KEY" ] && echo "VITE_SUPABASE_SERVICE_ROLE_KEY=${VITE_SUPABASE_SERVICE_ROLE_KEY}" >> .env || true && \
    [ -n "$VITE_EQUIPMENT_API_URL" ] && echo "VITE_EQUIPMENT_API_URL=${VITE_EQUIPMENT_API_URL}" >> .env || true && \
    [ -n "$VITE_BELIOT_API_BASE_URL" ] && echo "VITE_BELIOT_API_BASE_URL=${VITE_BELIOT_API_BASE_URL}" >> .env || true && \
    [ -n "$VITE_BELIOT_API_KEY" ] && echo "VITE_BELIOT_API_KEY=${VITE_BELIOT_API_KEY}" >> .env || true && \
    [ -n "$VITE_BELIOT_LOGIN" ] && echo "VITE_BELIOT_LOGIN=${VITE_BELIOT_LOGIN}" >> .env || true && \
    echo "✅ .env file created" && \
    echo "Checking VITE_SUPABASE_URL: $(head -1 .env | cut -d'=' -f2 | cut -c1-30)..." || echo "⚠️ VITE_SUPABASE_URL not set"

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Install envsubst for environment variable substitution
RUN apk add --no-cache gettext

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Verify dist files exist
RUN ls -la /usr/share/nginx/html/ || echo "WARNING: dist directory is empty"

# Copy nginx configuration template
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port (Railway will set PORT env var)
# Railway proxies to port 80, but we listen on PORT env var
EXPOSE 80
EXPOSE 8080

# Use entrypoint script
ENTRYPOINT ["/docker-entrypoint.sh"]

