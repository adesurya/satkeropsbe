# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production
LABEL maintainer="admin@polri.go.id"

# Security: non-root user
RUN addgroup -g 1001 -S nodeapp && \
    adduser  -u 1001 -S nodeapp -G nodeapp

WORKDIR /app

# Copy deps from builder
COPY --from=builder --chown=nodeapp:nodeapp /app/node_modules ./node_modules

# Copy source
COPY --chown=nodeapp:nodeapp . .

# Create logs directory
RUN mkdir -p logs && chown nodeapp:nodeapp logs

# Drop to non-root
USER nodeapp

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/v1/health || exit 1

CMD ["node", "src/app.js"]
