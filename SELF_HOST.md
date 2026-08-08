# Self-hosting the Caedral Discord Bot

Production checklist for operators running the open-source bot outside the Caedral monorepo.

## Quick start

```bash
cp .env.example .env
# Required: CAEDRAL_API_KEY, DISCORD_*, CAEDRAL_ASSISTANT_MODEL (optional)

docker compose up -d --build
docker compose logs -f discord-bot
```

Documentation: [caedral.com/docs/discord-bot](https://caedral.com/docs/discord-bot)

## What runs where

| Component | Location | Notes |
|-----------|----------|-------|
| Bot process | Your VPS | Docker or Node 20+ |
| Ticket + RAG Postgres | Bundled in compose | `discord_tickets` + `knowledge_chunks` tables |
| Registration / AI | `https://api.caedral.com` | Fixed — not configurable on self-hosted |
| Control plane | [caedral.com/dashboard/bots](https://caedral.com/dashboard/bots) | Uptime, disable, prompt, chat model, rename |

## Knowledge base (RAG)

On first start (empty `knowledge_chunks` table), the bot automatically ingests the bundled **FAQ** from `KNOWLEDGE_BASE.md` using Caedral Embed API. No separate OpenRouter or Firecrawl keys.

Re-ingest manually:

```bash
docker compose exec discord-bot npm run knowledge:ingest
```

Or locally: `npm run knowledge:ingest`

Set `KNOWLEDGE_AUTO_INGEST=0` to skip auto-ingest on boot.

## Changelog delivery

Registered bots receive Caedral site changelog broadcasts on heartbeat and post to your `#updates` and log channels automatically. Configure `DISCORD_UPDATES_CHANNEL_ID` and optionally `DISCORD_CHANGELOG_LOG_CHANNEL_ID`.

## Required secrets

- `CAEDRAL_API_KEY` — from dashboard; bills embed, rerank, and chat
- `POSTGRES_PASSWORD` — change from default in production
- `DISCORD_BOT_TOKEN` — Discord Developer Portal

## Model selection

```env
CAEDRAL_ASSISTANT_MODEL=caedral-base
```

Valid chat models: `caedral-base`, `caedral-titan`, `caedral-olympus`, `caedral-primordial`.

You can override the model remotely in [Dashboard → Discord Bots](https://caedral.com/dashboard/bots) (**Chat model**). Changes apply on the next heartbeat (~60s). Leave empty in the dashboard to use the bot `.env` value.

Invalid models or insufficient balance surface a clear message in the ticket.

## Health check

The container exposes `GET http://127.0.0.1:5010/health` (no auth). Docker Compose and the image `HEALTHCHECK` use this endpoint.

## Platform cron jobs (Caedral infra)

Run on the **Caedral site** host (not on self-hosted bot VPS):

### Heartbeat retention

Deletes `bot_heartbeats` older than 90 days (configurable):

```bash
curl -X POST https://caedral.com/api/cron/bot-heartbeats-cleanup \
  -H "Authorization: Bearer $CRON_SECRET"
```

Env: `BOT_HEARTBEAT_RETENTION_DAYS=90` (optional)

Suggested schedule: daily at 04:00 UTC.

### Database migration (platform)

After pulling latest Caedral site code, apply:

```bash
cd site && npm run db:migrate
```

Migration `0022_bot_changelog_broadcasts.sql` adds changelog fan-out tables for Discord bots.

## Publishing

This repository is the **standalone open-source distribution** of the Caedral Discord bot (MIT). It includes the `@caedral/knowledge` package in `knowledge/` for ticket RAG.

Docker builds require this layout (`discord-bot/` + `knowledge/` at the repo root). See [SELF_HOST.md](./SELF_HOST.md) for production operations.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Bot won't start | `CAEDRAL_API_KEY` set? Valid? Balance > $0.01 for paid models |
| Not in dashboard | First heartbeat within 60s; same API key owner as logged-in user |
| AI errors in tickets | `CAEDRAL_ASSISTANT_MODEL` valid; prepaid balance |
| Container unhealthy | `docker logs` — Discord token, DB connection, registration |

Support: support@caedral.com
