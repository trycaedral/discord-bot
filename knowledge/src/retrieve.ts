import { caedralRerankDocuments, shouldUseCaedralApiForKnowledge } from "./caedral-api.js";
import { KNOWLEDGE_CONFIG } from "./config.js";
import { embedQuery } from "./embeddings.js";
import { getSql, searchKnowledgeChunks, type StoredKnowledgeChunk } from "./db.js";

export type RetrievedChunk = {
  content: string;
  source: string;
  category: string;
  similarity: number;
};

function retrievalQueryVariants(query: string): string[] {
  const variants = [query];
  const q = query.toLowerCase();

  if (/\b(fundador|founder|founded)\b/.test(q)) {
    variants.push("Caedral founder Leonardo Turque");
  }
  if (/rerank/.test(q)) {
    variants.push("Caedral Rerank $0.0005 per search specialized model pricing");
  }
  if (/embed/.test(q)) {
    variants.push("Caedral Embed free until 28 September 2026 then $0.001 per 1M tokens embeddings pricing self-hosted");
    variants.push("Caedral Embed $0.001 per 1M tokens embeddings pricing self-hosted");
  }
  if (/bonus|top.?up|recarga|prepaid|pricing|billing/.test(q)) {
    variants.push(
      "Caedral top-up bonus through 28 September 2026 tiered bonus credits prepaid balance Agency Pack +15%",
    );
  }
  if (/vision/.test(q)) {
    variants.push("Caedral Vision $5 per 1M tokens image generation pricing");
  }
  if (/voice|audio/.test(q)) {
    variants.push("Caedral Voice $0.84 $3.36 per 1M tokens audio pricing");
  }

  return [...new Set(variants)];
}

async function mergeRetrievalResults(
  query: string,
  topK: number,
): Promise<StoredKnowledgeChunk[]> {
  const variants = retrievalQueryVariants(query);
  const seen = new Set<string>();
  const merged: StoredKnowledgeChunk[] = [];

  for (const variant of variants) {
    const embedding = await embedQuery(variant);
    const candidateCount = Math.max(topK, KNOWLEDGE_CONFIG.candidateTopK);
    const candidates = await searchKnowledgeChunks(embedding, candidateCount);

    for (const chunk of candidates) {
      const key = `${chunk.source}:${chunk.chunkIndex}:${chunk.content.slice(0, 80)}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(chunk);
      }
    }
  }

  merged.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
  return merged.slice(0, Math.max(topK, KNOWLEDGE_CONFIG.candidateTopK));
}

async function rerankCandidates(
  query: string,
  candidates: StoredKnowledgeChunk[],
  topK: number,
): Promise<StoredKnowledgeChunk[]> {
  if (candidates.length <= 1 || !shouldUseCaedralApiForKnowledge()) {
    return candidates.slice(0, topK);
  }

  try {
    const reranked = await caedralRerankDocuments({
      query,
      documents: candidates.map((chunk) => chunk.content),
      topN: topK,
    });

    const byIndex = new Map(candidates.map((chunk, index) => [index, chunk]));
    const results: StoredKnowledgeChunk[] = [];

    for (const row of reranked) {
      const chunk = byIndex.get(row.index);
      if (chunk) {
        results.push({
          ...chunk,
          similarity: row.relevanceScore,
        });
      }
    }

    return results.length > 0 ? results : candidates.slice(0, topK);
  } catch (error) {
    console.error("[knowledge/retrieve] Rerank failed, using vector order:", error);
    return candidates.slice(0, topK);
  }
}

export async function retrieveContext(
  query: string,
  topK: number = KNOWLEDGE_CONFIG.defaultTopK,
): Promise<string[]> {
  const chunks = await retrieveContextDetailed(query, topK);
  return chunks.map((chunk) => chunk.content);
}

export async function retrieveContextDetailed(
  query: string,
  topK: number = KNOWLEDGE_CONFIG.defaultTopK,
): Promise<RetrievedChunk[]> {
  const candidates = await mergeRetrievalResults(query, topK);
  const ranked = await rerankCandidates(query, candidates, topK);

  return ranked.map((row) => ({
    content: row.content,
    source: row.source,
    category: row.category,
    similarity: Number(row.similarity ?? 0),
  }));
}

export async function retrieveContextAndClose(
  query: string,
  topK?: number,
): Promise<string[]> {
  try {
    return await retrieveContext(query, topK);
  } finally {
    const { closeSql } = await import("./db.js");
    await closeSql();
  }
}

/** Ensure DB connection is warm — optional helper for long-lived servers */
export async function pingKnowledgeDb(): Promise<boolean> {
  const sql = getSql();
  await sql`SELECT 1`;
  return true;
}
