# Standalone build — run from repo root: docker compose up -d --build
# Monorepo dev: use Dockerfile.monorepo with context at Caedral root.

FROM node:20-alpine AS builder

WORKDIR /app

COPY knowledge/package.json knowledge/tsconfig.json knowledge/tsconfig.build.json /app/knowledge/
COPY knowledge/src /app/knowledge/src
WORKDIR /app/knowledge
RUN npm install && npm run build

WORKDIR /app/bot
COPY package.json package-lock.json* ./
RUN ln -s /app/knowledge ./knowledge
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:20-alpine AS runner

RUN apk add --no-cache wget

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

COPY --from=builder --chown=appuser:appgroup /app/knowledge /app/knowledge
COPY --chown=appuser:appgroup knowledge/KNOWLEDGE_BASE.md /app/knowledge/KNOWLEDGE_BASE.md
COPY --chown=appuser:appgroup knowledge/migrations /app/knowledge/migrations

COPY --from=builder --chown=appuser:appgroup /app/bot/dist /app/bot/dist
COPY --from=builder --chown=appuser:appgroup /app/bot/node_modules /app/bot/node_modules
COPY --from=builder --chown=appuser:appgroup /app/bot/package.json /app/bot/
COPY --chown=appuser:appgroup migrations /app/bot/migrations
COPY --chown=appuser:appgroup assets /app/bot/assets
COPY --chown=appuser:appgroup docker-entrypoint.sh /app/bot/docker-entrypoint.sh

RUN ln -sf /app/knowledge /app/bot/knowledge

WORKDIR /app/bot

RUN chmod +x docker-entrypoint.sh

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:5010/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
