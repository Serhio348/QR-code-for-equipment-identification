# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Bump to force Railway cache invalidation
ARG CACHEBUST=8

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build arguments for VITE environment variables
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
        echo "❌ ERROR: VITE_SUPABASE_URL is required!" && exit 1; \
    fi && \
    if [ -z "$VITE_SUPABASE_ANON_KEY" ]; then \
        echo "❌ ERROR: VITE_SUPABASE_ANON_KEY is required!" && exit 1; \
    fi && \
    echo "✅ Required variables are set"

# Create .env file from build args
RUN echo "📝 Creating .env file..." && \
    echo "VITE_SUPABASE_URL=${VITE_SUPABASE_URL}" > .env && \
    echo "VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}" >> .env && \
    [ -n "$VITE_SUPABASE_SERVICE_ROLE_KEY" ] && echo "VITE_SUPABASE_SERVICE_ROLE_KEY=${VITE_SUPABASE_SERVICE_ROLE_KEY}" >> .env || true && \
    [ -n "$VITE_EQUIPMENT_API_URL" ] && echo "VITE_EQUIPMENT_API_URL=${VITE_EQUIPMENT_API_URL}" >> .env || true && \
    [ -n "$VITE_AI_CONSULTANT_API_URL" ] && echo "VITE_AI_CONSULTANT_API_URL=${VITE_AI_CONSULTANT_API_URL}" >> .env || true && \
    [ -n "$VITE_BELIOT_API_BASE_URL" ] && echo "VITE_BELIOT_API_BASE_URL=${VITE_BELIOT_API_BASE_URL}" >> .env || true && \
    [ -n "$VITE_BELIOT_API_KEY" ] && echo "VITE_BELIOT_API_KEY=${VITE_BELIOT_API_KEY}" >> .env || true && \
    [ -n "$VITE_BELIOT_LOGIN" ] && echo "VITE_BELIOT_LOGIN=${VITE_BELIOT_LOGIN}" >> .env || true && \
    echo "✅ .env file created"

# Build the application
RUN echo "🔨 Building..." && \
    npm run build && \
    echo "✅ Build completed" && \
    ls -la dist/

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration (listens on port 80 — matches Railway target port)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
