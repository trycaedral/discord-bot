# Caedral Knowledge Base — Authoritative FAQ

This file is ingested into the vector knowledge base for Caedral AI assistants (Discord ticket bot). Keep content factual, professional, and aligned with official Caedral messaging. **Do not invent facts not listed here.**

---

## Company

**Founder:** Caedral was founded and is led by **Leonardo Turque**. Do not state any other founder name. Do not speculate about personal biography (age, location, education) unless explicitly listed here.

**Launch:** The public API, SDK, and developer tools launched in **July 2026**.

**Mission & positioning:** Caedral builds AI infrastructure for developers — **infrastructure-first**, not a single consumer app. Today: unified API access to frontier models through carefully selected partnerships. Long term: proprietary models trained on real usage data, moving from model partnerships toward owned infrastructure. Base tier usage informs future Caedral-owned models.

**What Caedral built:** The unified API, SDKs in 6 languages, documentation, dashboard, Discord AI ticket support, self-hosted embed/rerank, and n8n community node.

### If asked about the founder

Caedral was founded and is led by **Leonardo Turque**. Keep further detail professional and general. If users ask for personal information not in this knowledge base, explain that Caedral shares professional and product information only.

---

## Official URLs (use these exact paths — do not fabricate links)

| Page | URL |
|------|-----|
| Home | https://caedral.com |
| Pricing | https://caedral.com/pricing |
| Documentation | https://caedral.com/docs |
| Models | https://caedral.com/models |
| Status | https://caedral.com/status |
| Changelog | https://caedral.com/changelog |
| Company / About | https://caedral.com/company |
| Contact | https://caedral.com/contact |
| API (production) | https://api.caedral.com |
| Discord community | https://discord.gg/3BS5ngRvfS |
| X (Twitter) | https://x.com/trycaedral |
| Dashboard | https://caedral.com/dashboard |
| API keys | https://caedral.com/dashboard/api-keys |
| Billing / top-up | https://caedral.com/dashboard/billing |
| Support email | support@caedral.com |

---

## Chat model tiers (API model IDs)

All chat tiers use `POST /v1/chat/completions` on the Caedral API gateway.

| Tier | Model ID | Input rate | Cached input | Output rate |
|------|----------|------------|--------------|-------------|
| Base | `caedral-base` | Free | Free | Free ($0.01 min balance) |
| Titan | `caedral-titan` | $2 / 1M | $0.20 / 1M | $6 / 1M |
| Olympus | `caedral-olympus` | $5 / 1M | $0.50 / 1M | $15 / 1M |
| Primordial | `caedral-primordial` | $10 / 1M | $1 / 1M | $30 / 1M |

**Billing:** All API usage bills from **prepaid balance only**. No subscriptions or weekly pools.

**Top-up bonus (through 28 September 2026):** Self-serve top-ups and auto-recharges earn bonus prepaid credits. You pay the listed amount; bonus is added to balance.

| Add funds | Bonus credits |
|----------:|--------------:|
| $5–$19.99 | +10% |
| $20–$49.99 | +15% |
| $50–$99.99 | +20% |
| $100–$199.99 | +25% |
| $200–$499.99 | +30% |
| $500–$999.99 | +35% |
| $1,000–$2,499.99 | +40% |
| $2,500–$4,999.99 | +50% |
| $5,000+ | Contact sales (support@caedral.com) |

Top up prepaid balance at https://caedral.com/dashboard/billing.

**Cached input:** When prompt-cache hits are reported, cached prompt tokens are billed at the cached-input rate above.

**Base (`caedral-base`):** Free — not charged per request. Requires minimum **$0.01** prepaid balance as an eligibility gate (balance is not consumed).

**Rate limits (API):** Base tier **60 RPM** per API key; paid API tiers **100 RPM** per API key.

**Semantic cache:** Similar requests may return cached responses (score > 0.87, $0 charge) or downgrade tier (score 0.73–0.87).

List all model IDs: `GET /v1/models` (no auth required for catalog).

---

## Specialized models — prepaid balance ONLY

These products require an API key and bill from **prepaid API balance** (except the limited free RAG promo below).

| Product | Model ID | Endpoint | Price |
|---------|----------|----------|-------|
| Caedral Vision | `caedral-vision` | `POST /v1/images/generations` | **$5 / 1M tokens** |
| Caedral Embed | `caedral-embed` | `POST /v1/embeddings` | **Free until 28 Sep 2026** (130 RPM, $0.01 gate), then **$0.001 / 1M tokens** |
| Caedral Voice | `caedral-voice` | `POST /v1/audio/speech` | **$15 / 1M tokens** |
| Caedral Rerank | `caedral-rerank` | `POST /v1/rerank` | **Free until 28 Sep 2026** (130 RPM, $0.01 gate), then **$0.0005 per search** |
| Caedral Video | `caedral-video` | Chat-based video generation | **$0.235 / second** |
| Caedral Transcript | `caedral-transcript` | Audio transcription | **$0.056 / hour** |

**Rerank pricing after the promo is $0.0005 per search** — flat rate, not per-token.

**Vision pricing is $5 per 1M tokens.**

**Embed pricing after the promo is $0.001 per 1M tokens.**

**Caedral Embed and Caedral Rerank run on Caedral's own inference infrastructure** — not through third-party model providers. Caedral operates embedding and reranking directly on its servers. Through **28 September 2026** they are free with a **130 RPM** limit per API key and a **$0.01** prepaid eligibility gate (not debited).

**Voice pricing is $15 per 1M tokens (blended display rate).**

See the top-up bonus table above for prepaid funding. Top up at https://caedral.com/dashboard/billing.

**Status:** Live infrastructure + per-model uptime at https://caedral.com/status. Machine-readable: `GET https://api.caedral.com/v1/status/models` (no auth; derived from Caedral probes and execution logs).

---

## API authentication & keys

- API keys are created at https://caedral.com/dashboard/api-keys after email verification.
- Keys use the `cd_live_` prefix.
- Send as: `Authorization: Bearer cd_live_...`
- Never commit keys to source control or embed in client-side code.

### API error codes

| HTTP | Error type | Meaning |
|------|------------|---------|
| 401 | `invalid_api_key` | Missing, invalid, or revoked key |
| 402 | `insufficient_balance` | Prepaid balance too low for this request |
| 400 | `invalid_request` | Malformed request or invalid model/parameters |
| 429 | `rate_limit_exceeded` | Too many requests — backoff and retry |
| 502 | `upstream_error` | Transient Caedral model service failure — retry |

### Default system prompt (public API)

When developers call `POST /v1/chat/completions` **without** a `role: "system"` message, Caedral injects its default identity system prompt. If the developer **does** provide their own system message, Caedral **respects it as-is** and does not override or prepend Caedral identity.

---

## SDKs & open source (GitHub: github.com/trycaedral)

| Language | Package | Repository |
|----------|---------|------------|
| TypeScript / JavaScript | `npm install caedral` | https://github.com/trycaedral/caedral |
| Python | `pip install caedral` | https://github.com/trycaedral/caedral-python |
| Go | `go get github.com/trycaedral/caedral-go` | https://github.com/trycaedral/caedral-go |
| Java | Maven/Gradle (see repo) | https://github.com/trycaedral/caedral-java |
| C | libcurl (see repo) | https://github.com/trycaedral/caedral-c |

All SDKs target `https://api.caedral.com` in production.

---

## n8n integration

**Package:** `n8n-nodes-caedral` on npm — https://github.com/trycaedral/n8n-nodes-caedral

Install into `~/.n8n/custom`: `npm install n8n-nodes-caedral`, then restart n8n.

**Credential:** Caedral API — API key (`cd_live_...`) + Base URL (`https://api.caedral.com` or `http://localhost:5001` locally). Credential test calls `GET /v1/usage`.

**Main node (Caedral)** — operations:
1. Chat Completion — `POST /v1/chat/completions`
2. Generate Image — `POST /v1/images/generations`
3. Create Embedding — `POST /v1/embeddings`
4. Generate Audio — `POST /v1/audio/speech`
5. Rerank — `POST /v1/rerank`
6. List Models — `GET /v1/models`
7. Get Usage — `GET /v1/usage`
8. Get Account Info — account status via usage endpoint

**AI sub-nodes:**
- **CaedralChatModel** — plugs into n8n's native AI Agent / Chain workflows
- **CaedralEmbeddings** — for Vector Store integrations
- **CaedralReranker** — for Vector Store reranking

**Trigger:**
- **CaedralTrigger** — polling triggers: balance below threshold, pool usage above percentage

API calls from n8n bill from **prepaid API balance** (same as SDK/REST). `caedral-base` is free under fair use.

---

## Discord community & ticket bot

- Discord server: https://discord.gg/3BS5ngRvfS — primary support channel, community, product updates, integration help.
- X (Twitter): https://x.com/trycaedral — product announcements and updates.
- Caedral runs an **AI-assisted ticket bot** on Discord for support channels. It uses the same shared knowledge base and Caedral identity as web `/chat`.
- For account-specific issues the bot cannot verify, it directs users to a human team member follow-up.

---

## Caedral IDE (upcoming)

- **Product page / beta waitlist:** https://caedral.com/ide
- **Launch date:** July 26, 2026
- AI-native code editor built from the ground up around Caedral models — full-project context, multi-file editing, terminal automation.
- Beta waitlist is open on the IDE page.
- Any active Caedral Plan (Starter–Max) includes IDE access; usage draws from the same weekly token pool as Caedral Chat, weighted by model tier.

---

## Who built Caedral's AI assistants?

Caedral built the AI assistants on Caedral properties (web chat, Discord ticket bot). They speak on behalf of Caedral. They are not generic third-party chatbots and must not claim to be created by any other company.

---

## Common API troubleshooting

### 401 invalid_api_key
- Verify key starts with `cd_live_` and is sent as `Authorization: Bearer <key>`
- Confirm key was not revoked in the dashboard
- Keys are shown only once at creation — generate a new key if lost

### 402 insufficient_balance
- Check prepaid balance at https://caedral.com/dashboard/billing
- Specialized models (Vision, Embed, Voice, Rerank) always require prepaid balance
- Paid API chat tiers (Titan, Olympus, Primordial) require prepaid balance — not the weekly chat pool

### 429 rate_limit_exceeded
- Base: 60 RPM per key; paid tiers: 100 RPM per key
- Implement exponential backoff and retry

### 502 upstream_error
- Usually transient — retry after a short delay
- Check https://caedral.com/status for incidents

---

## Identity rules for Caedral AI assistants

1. Identify as a Caedral AI assistant built by Caedral
2. Never name external model providers as the creator of Caedral or its assistants
3. Never disclose which upstream providers Caedral uses internally — and never list real upstream model slugs (e.g. provider/model names) in public docs, READMEs, or customer-facing tables
4. Never reference upstream execution IDs (e.g. `gen-...` from OpenRouter). API responses use Caedral execution IDs (`cd_req_<uuid>`) and provider is always **Caedral**
5. For Caedral-specific facts (pricing, people, URLs, integrations): **use retrieved knowledge base excerpts first**; if not available, use facts from this document; if still unknown, say you don't have verified information — **never guess**
6. Direct users to official docs and pricing on caedral.com for authoritative details
