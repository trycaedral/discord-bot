# Caedral Discord Bot

Discord bot for the Caedral community (v1.0): announcements, changelog, status, user lookups, and tickets. **Node.js**, **TypeScript**, **discord.js 14** with Components V2 layouts.

## Prerequisites

- Node.js 20+
- PostgreSQL (dedicated bot database — tickets only; not the Caedral platform DB)
- A Discord application with a bot user
- A Caedral API key from [dashboard/api-keys](https://caedral.com/dashboard/api-keys) (`cd_live_…`)

## Self-hosted (Docker)

The bot ships with its own Postgres for ticket storage. Platform registration uses your Caedral API key (heartbeat every 60s).

```bash
cp .env.example .env
# Edit .env — set CAEDRAL_API_KEY, DISCORD_BOT_TOKEN, channel IDs, etc.

docker compose up -d --build
```

| Variable | Purpose |
|----------|---------|
| `CAEDRAL_API_KEY` | Registers the bot with Caedral; bills AI usage from your prepaid balance |
| `CAEDRAL_ASSISTANT_MODEL` | Caedral chat model for tickets (default `caedral-base`) |
| `DATABASE_URL` | Set automatically by compose to the bundled Postgres |

Self-hosted bots always connect to `https://api.caedral.com` — the gateway URL is not configurable.

Documentation: [caedral.com/docs/discord-bot](https://caedral.com/docs/discord-bot) · Operator guide: [SELF_HOST.md](./SELF_HOST.md)

After the first heartbeat, your instance appears linked to your API key owner account at [dashboard/bots](https://caedral.com/dashboard/bots).

For local development without platform registration, set `CAEDRAL_BOT_ALLOW_UNREGISTERED=1`.

## Changelog delivery

When Caedral publishes on [caedral.com/changelog](https://caedral.com/changelog), a broadcast is queued for every registered bot. On the next heartbeat (~60s), your bot posts to:

- `DISCORD_UPDATES_CHANNEL_ID` — product updates channel
- `DISCORD_CHANGELOG_LOG_CHANNEL_ID` (optional) or `DISCORD_TICKET_LOG_CHANNEL_ID` — log/archive channel

No inbound connection from Caedral to your VPS is required.

## Monorepo note

The Caedral **platform** monorepo (`trycaedral/platform` or local `Caedral/`) no longer includes this bot. Use this repository or [github.com/trycaedral/discord-bot](https://github.com/trycaedral/discord-bot) for bot development and deployment.

## Discord Developer Portal setup

### 1. Create the application

1. Open [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → name it (e.g. `Caedral`).
2. Open **Bot** → **Add Bot**.
3. Copy the **Bot Token** → `DISCORD_BOT_TOKEN`.
4. Copy **Application ID** → `DISCORD_CLIENT_ID`.

### 2. Privileged intents

Under **Bot → Privileged Gateway Intents**, enable:

| Intent | Required | Reason |
|--------|----------|--------|
| **Message Content Intent** | Yes | Ticket transcript logging |
| Server Members Intent | No | Not required for current features |
| Presence Intent | No | Not used |

### 3. Bot permissions

When inviting the bot, grant these **Bot Permissions**:

| Permission | Reason |
|------------|--------|
| View Channels | Read/post in configured channels |
| Send Messages | Commands, tickets, announcements |
| Embed Links | Link buttons in Components V2 |
| Read Message History | Ticket transcripts |
| Manage Channels | Create/delete private ticket channels |
| Use Slash Commands | Slash command interactions |

**Permission integer (decimal):** `117776` (View Channels, Send Messages, Embed Links, Read Message History, Attach Files, Manage Channels)

### 4. OAuth2 invite URL

Use **OAuth2 → URL Generator**:

- **Scopes:** `bot`, `applications.commands`
- **Bot Permissions:** select the permissions above (or paste the integer)

**Invite URL format:**

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=117776&scope=bot%20applications.commands
```

Replace `YOUR_CLIENT_ID` with your application ID.

### 5. Discord server IDs

Enable **Developer Mode** in Discord (Settings → Advanced → Developer Mode), then right-click to **Copy ID**:

| Variable | What to copy |
|----------|--------------|
| `DISCORD_GUILD_ID` | Your server |
| `DISCORD_ANNOUNCEMENTS_CHANNEL_ID` | `#announcements` |
| `DISCORD_UPDATES_CHANNEL_ID` | `#updates` |
| `DISCORD_SUPPORT_CHANNEL_ID` | `#support` (ticket panel) |
| `DISCORD_TICKET_CATEGORY_ID` | Category for new ticket channels |
| `DISCORD_TICKET_LOG_CHANNEL_ID` | `#ticket-logs` (transcript archive) |
| `OWNER_DISCORD_ID` | Your user ID |
| `DISCORD_SUPPORT_ROLE_ID` | *(optional)* Support role for closing tickets |

## Environment variables

Self-hosted: copy `.env.example` → `.env`.

Monorepo dev: copy root `.env.example.local` — the bot loads the repo root `.env` automatically when present.

| Variable | Required | Notes |
|----------|----------|-------|
| `CAEDRAL_API_KEY` | Self-hosted | `cd_live_…` from dashboard |
| `CAEDRAL_BOT_INSTANCE_ID` | Internal only | UUID provisioned via `BOT_PROVISION_SECRET` |
| `DATABASE_URL` | Yes | Bot-local Postgres (tickets) |
| Gateway | Fixed | Self-hosted: always `https://api.caedral.com` |

## Install & run

```bash
# repo root
npm install
npm run deploy-commands   # optional manual re-register (also runs automatically on bot startup)
npm run db:migrate        # create discord_tickets table
npm run build
npm start
```

Development with auto-reload:

```bash
npm run dev
```

## Commands

### Owner-only (`OWNER_DISCORD_ID`)

All owner commands reply ephemerally with *"You don't have permission to use this command"* if the caller is not the owner.

| Command | Description |
|---------|-------------|
| `/announce` | Post a branded announcement to `#announcements`. Options: `title`, `description`, optional `link`. |
| `/changelog-publish` | Publish a changelog to `#updates` and POST to the site changelog API (when `CHANGELOG_API_SECRET` is set). Options: `title`, `body`, optional `version`. |
| `/status` | Ephemeral live status: site, API gateway, and database (includes internal details). |
| `/user-lookup <email>` | Ephemeral account lookup: prepaid balance, account status, admin flag. |
| `/setup-tickets` | Posts the persistent **Open Ticket** panel in `#support`. Run once after setup. |

### Public (all members)

| Command | Description |
|---------|-------------|
| `/docs` | Link to `{SITE_URL}/docs` with branded Components V2 layout. |
| `/pricing` | Summary of prepaid API pricing with link to the pricing page. |
| `/status-public` | Public-facing operational status (website + API only, no database internals). |

## Ticket system

1. Run `/setup-tickets` in your server (owner only) to post the panel in `#support`.
2. Members click **Open Ticket** → select category: Bug Report, Billing Question, General Question, or Feature Request.
3. A **private text channel** is created under the ticket category, visible to the opener, the bot, the owner, and optionally the Support role.
4. A welcome message is posted with a **Close Ticket** button, followed immediately by an **automated AI response** from the Caedral assistant (category-aware, local FAQ knowledge base + Caedral chat).
5. When the opener replies, the bot continues the conversation using stored thread history — until you (owner) send a message in the ticket, which mutes the bot for that ticket.
6. Owner or Support role closes the ticket → transcript saved to `discord_tickets` table and posted to `#ticket-logs` → channel deleted.

### AI assistant (tickets)

Ticket channels use `@caedral/knowledge` for local FAQ RAG + **Caedral API** chat completions:

- **Knowledge** — bundled FAQ auto-ingested into local Postgres on first boot (`KNOWLEDGE_BASE.md`)
- **Model** — set `CAEDRAL_ASSISTANT_MODEL` in `.env`, or choose remotely in [Dashboard → Discord Bots](https://caedral.com/dashboard/bots)
- **Billing** — same `CAEDRAL_API_KEY` as registration; debits prepaid balance
- **Initial reply** — sent automatically after ticket creation, tailored to the selected category
- **Follow-ups** — bot responds to the ticket opener with conversation context (`assistant_history` in DB)
- **Owner mute** — when `OWNER_DISCORD_ID` posts in the ticket, `assistant_muted` is set and the bot stops auto-replying
- **Invalid model** — error message lists available models from `GET /v1/models`

Requires `CAEDRAL_API_KEY` and `DATABASE_URL`.

Test without Discord:

```bash
npm run test:ticket-assistant
```

## Branding

Messages use Components V2 containers with Caedral palette:

- **Sand:** `#D4C5A9`
- **Graphite:** `#1A1A1A`

The Caedral symbol is used as a thumbnail via `DISCORD_BRAND_ICON_URL` (defaults to `{SITE_URL}/brand/caedral-symbol-dark.svg`).

## Database

Migration `migrations/001_discord_tickets.sql` creates `discord_tickets` — ticket metadata plus full transcript on close. Migrations run automatically on bot startup.

Self-hosted bots use a **dedicated Postgres** (see `docker-compose.yml`). This database stores tickets only — not Caedral user accounts.

User lookups (`/user-lookup`) require the Caedral platform database and are disabled on self-hosted bots unless `CAEDRAL_PLATFORM_USER_LOOKUP=1` is set with a platform DB connection.

## Changelog API (future)

`/changelog-publish` posts to Discord immediately. The site API call requires `CHANGELOG_API_SECRET` and `CHANGELOG_API_URL` (default `{SITE_URL}/api/changelog`). Until that endpoint exists on the site, the command still works for Discord-only publishing and reports the API as not configured.

## Site integration (admin changelog)

When an admin publishes from `/admin/changelog` on caedral.com, a **broadcast** is written to the platform database. Every registered bot receives pending entries on its next heartbeat and posts to `#updates` and the configured log channel.

Self-hosted bots do **not** expose a public HTTP endpoint to Caedral. Delivery is pull-based via `POST /v1/bot-instances/heartbeat`.

Optional: `POST /internal/changelog` on the bot's local HTTP server (requires `DISCORD_BOT_INTERNAL_SECRET`) for manual testing only.
