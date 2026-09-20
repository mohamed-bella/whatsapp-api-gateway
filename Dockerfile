# ==========================================
# Stage 1: Build Stage
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies including openssl for Prisma
RUN apk add --no-cache python3 make g++ openssl

# Force development environment in builder stage so npm installs typescript/tsc
ENV NODE_ENV=development

# Copy package manifests
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies including devDependencies (typescript)
RUN npm ci --include=dev

# Copy Prisma schema & generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code and build TypeScript
COPY src ./src
RUN npm run build

# ==========================================
# Stage 2: Production Runtime Stage
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV AUTH_DIR=/data/baileys-auth

# Install dumb-init for proper signal handling (SIGTERM, SIGINT) and openssl for Prisma
RUN apk add --no-cache dumb-init openssl

# Create non-root system group and user
RUN addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nodejs

# Create persistent data directory with correct permissions
RUN mkdir -p /data/baileys-auth && \
    chown -R nodejs:nodejs /data

# Copy package manifests and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy Prisma schema and generated artifacts
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Copy compiled JavaScript output
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy entrypoint script
COPY --chown=nodejs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Persistent storage volume for Baileys auth keys
VOLUME ["/data"]

# Switch to non-root user
USER nodejs

# Expose HTTP port
EXPOSE 3000

# Docker Healthcheck using native Alpine wget
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/health > /dev/null || exit 1

# Use dumb-init to properly forward signals to node process
ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
