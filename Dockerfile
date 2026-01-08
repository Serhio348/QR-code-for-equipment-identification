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
# These will be available during build time
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_SERVICE_ROLE_KEY
ARG VITE_EQUIPMENT_API_URL
ARG VITE_BELIOT_API_BASE_URL
ARG VITE_BELIOT_API_KEY
ARG VITE_BELIOT_LOGIN

# Set environment variables for build
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_SERVICE_ROLE_KEY=$VITE_SUPABASE_SERVICE_ROLE_KEY
ENV VITE_EQUIPMENT_API_URL=$VITE_EQUIPMENT_API_URL
ENV VITE_BELIOT_API_BASE_URL=$VITE_BELIOT_API_BASE_URL
ENV VITE_BELIOT_API_KEY=$VITE_BELIOT_API_KEY
ENV VITE_BELIOT_LOGIN=$VITE_BELIOT_LOGIN

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

