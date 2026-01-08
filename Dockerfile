# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

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

