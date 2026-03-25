# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# drizzle-kit needs tsx + drizzle-kit at runtime for schema push
RUN npm install drizzle-kit tsx

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=builder /app/server ./server
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Create uploads directory and set ownership
RUN mkdir -p uploads/images uploads/qr-codes uploads/pdfs && \
    chmod +x docker-entrypoint.sh && \
    chown -R appuser:appgroup /app

EXPOSE 5000

ENV NODE_ENV=production

# Switch to non-root user
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-5000}/api/health || exit 1

CMD ["./docker-entrypoint.sh"]
