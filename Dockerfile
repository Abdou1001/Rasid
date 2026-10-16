# ==============================================================================
# Rasid Backend - Production Dockerfile
# Base: Node.js 22 LTS on Alpine Linux
# ==============================================================================

FROM node:22-alpine AS base

# Install libc6-compat for compatibility with native C/C++ modules (e.g. sharp) on musl
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Set production environment flags
ENV NODE_ENV=production
ENV PORT=5000

# Copy dependency manifests first to leverage Docker layer caching
COPY package.json package-lock.json ./

# Install only production dependencies strictly using package-lock.json
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source code (filtered via .dockerignore)
COPY . .

# Adjust permissions and switch to standard non-root 'node' user for security
RUN chown -R node:node /app
USER node

# Expose the application port
EXPOSE 5000

# Start the application directly with Node so PID 1 handles SIGTERM gracefully
CMD ["node", "src/server.js"]
