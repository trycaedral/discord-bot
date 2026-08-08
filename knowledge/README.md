# @caedral/knowledge

RAG retrieval and Caedral API chat completions for the Discord bot and Caedral assistants.

## Requirements

- Node.js 20+
- `CAEDRAL_API_KEY` (or internal `CAEDRAL_BOT_INSTANCE_ID` for monorepo deployments)
- `DATABASE_URL` with `knowledge_chunks` table (JSONB embeddings — pgvector optional)

## Self-hosted Discord bot

The bot uses the **same** `DATABASE_URL` for tickets and knowledge:

1. Migration `003_knowledge_chunks.sql` (bot) or `001_knowledge_chunks.sql` (knowledge package)
2. First boot auto-ingests `KNOWLEDGE_BASE.md` FAQ via Caedral Embed API
3. Ticket replies use vector search + Caedral Rerank + Caedral Chat

```bash
cd discord-bot && npm run knowledge:ingest
```

## Environment

| Variable | Purpose |
|----------|---------|
| `CAEDRAL_API_KEY` | Embeddings, rerank, chat via api.caedral.com |
| `CAEDRAL_ASSISTANT_MODEL` | Chat model id (default `caedral-base`) |
| `DATABASE_URL` | Ticket + knowledge chunk storage |
| `KNOWLEDGE_AUTO_INGEST` | Set `0` to skip FAQ ingest on empty DB |

Gateway URL is locked to `https://api.caedral.com` when only an API key is configured (self-hosted).

## License

MIT — see [LICENSE](./LICENSE).
