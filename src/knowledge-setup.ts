import {
  countKnowledgeChunks,
  ingestKnowledgeBase,
} from "@caedral/knowledge";

/**
 * Ensures knowledge_chunks exist in the bot-local DATABASE_URL.
 * On first boot (empty table), ingests bundled FAQ from KNOWLEDGE_BASE.md.
 * Embeddings are generated via Caedral API (CAEDRAL_API_KEY).
 */
export async function ensureKnowledgeBase(): Promise<void> {
  if (process.env.KNOWLEDGE_AUTO_INGEST === "0") {
    console.log("[knowledge-setup] KNOWLEDGE_AUTO_INGEST=0 — skipping ingest check");
    return;
  }

  const existing = await countKnowledgeChunks();
  if (existing > 0) {
    console.log(`[knowledge-setup] Knowledge base ready (${existing} chunks)`);
    return;
  }

  console.log("[knowledge-setup] Empty knowledge base — ingesting bundled FAQ…");
  try {
    const result = await ingestKnowledgeBase();
    console.log(
      `[knowledge-setup] Ingested ${result.upserted} chunks (${result.totalInDb} total in DB)`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("(402)") || /insufficient/i.test(message)) {
      console.error(
        "[knowledge-setup] Ingest failed: insufficient Caedral balance for embeddings. " +
          "Top up at https://caedral.com/dashboard/billing then run: npm run knowledge:ingest",
      );
    } else {
      console.error(`[knowledge-setup] Ingest failed: ${message}`);
    }
    console.warn(
      "[knowledge-setup] Bot will start without FAQ chunks — ticket RAG may be empty until ingest succeeds.",
    );
  }
}
