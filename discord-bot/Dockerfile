# --- Stage 1: Install dependencies + Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy and build the knowledge package (local dependency)
COPY knowledge/package.json knowledge/tsconfig.json knowledge/tsconfig.build.json /app/knowledge/
COPY knowledge/src /app/knowledge/src
WORKDIR /app/knowledge
RUN npm install && npm run build

# Install bot dependencies
WORKDIR /app/discord-bot
COPY discord-bot/package.json discord-bot/package-lock.json* ./
RUN npm install

# Copy bot source and compile
COPY discord-bot/tsconfig.json ./
COPY discord-bot/src ./src
RUN npx tsc

# --- Stage 2: Production runtime ---
FROM node:20-alpine AS runner

RUN apk add --no-cache wget

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

# Copy compiled knowledge (runtime dependency for RAG)
COPY --from=builder --chown=appuser:appgroup /app/knowledge /app/knowledge
COPY --chown=appuser:appgroup knowledge/KNOWLEDGE_BASE.md /app/knowledge/KNOWLEDGE_BASE.md
COPY --chown=appuser:appgroup knowledge/migrations /app/knowledge/migrations

# Copy bot dist, dependencies, SQL migrations, and brand assets (all read from disk at runtime)
COPY --from=builder --chown=appuser:appgroup /app/discord-bot/dist /app/discord-bot/dist
COPY --from=builder --chown=appuser:appgroup /app/discord-bot/node_modules /app/discord-bot/node_modules
COPY --from=builder --chown=appuser:appgroup /app/discord-bot/package.json /app/discord-bot/
COPY --chown=appuser:appgroup discord-bot/migrations /app/discord-bot/migrations
COPY --chown=appuser:appgroup discord-bot/assets /app/discord-bot/assets
COPY --chown=appuser:appgroup discord-bot/docker-entrypoint.sh /app/discord-bot/docker-entrypoint.sh

WORKDIR /app/discord-bot

RUN chmod +x docker-entrypoint.sh

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:5010/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
