# Caedral Discord Bot

Self-hosted [Caedral](https://caedral.com) Discord bot: support tickets with AI assistant, slash commands, platform registration, and remote control from the Caedral dashboard.

**License:** [MIT](./LICENSE)

## Features

- Support tickets with AI assistant (local FAQ RAG + Caedral chat/embed/rerank)
- Slash commands: docs, pricing, status, announcements (owner)
- Heartbeat registration every 60s with your Caedral API key
- Remote control: enable/disable, rename, chat model, system prompt via [Dashboard → Discord Bots](https://caedral.com/dashboard/bots)
- Bundled Postgres for tickets and knowledge chunks (Docker Compose)
- **Changelog fan-out** — site publishes queue broadcasts; bots deliver to `#updates` + log channel on heartbeat

## Quick start

```bash
git clone https://github.com/trycaedral/discord-bot.git
cd discord-bot

cp discord-bot/.env.example discord-bot/.env
# Edit discord-bot/.env — CAEDRAL_API_KEY, DISCORD_BOT_TOKEN, channel IDs, etc.

docker compose -f discord-bot/docker-compose.yml up -d --build
```

Documentation: [caedral.com/docs/discord-bot](https://caedral.com/docs/discord-bot)

Operator guide: [discord-bot/SELF_HOST.md](./discord-bot/SELF_HOST.md)

## Repository layout

| Path | Purpose |
|------|---------|
| `discord-bot/` | Bot application, Docker image, migrations |
| `knowledge/` | `@caedral/knowledge` — RAG + Caedral API chat (MIT) |

Docker build context is the **repository root** (both folders required).

## Requirements

- Node.js 20+ (local dev) or Docker
- [Caedral API key](https://caedral.com/dashboard/api-keys) (`cd_live_…`)
- Discord application with bot token and channel IDs

Self-hosted bots always connect to `https://api.caedral.com` for registration and AI billing.

## Development

```bash
cd knowledge && npm install && npm run build
cd ../discord-bot && npm install && npm run build
cp .env.example .env
npm run db:migrate
npm start
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Support

- Docs: https://caedral.com/docs/discord-bot
- Email: support@caedral.com
