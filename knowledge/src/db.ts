import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { requireDatabaseUrl } from "./config.js";
import { embedTexts, hashContent } from "./embeddings.js";

export type KnowledgeChunkInput = {
  source: string;
  category: string;
  content: string;
  chunkIndex: number;
};

export type StoredKnowledgeChunk = {
  id: string;
  content: string;
  source: string;
  category: string;
  chunkIndex: number;
  embedding: number[];
  similarity?: number;
};

let sqlInstance: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (!sqlInstance) {
    sqlInstance = postgres(requireDatabaseUrl(), { max: 5, prepare: false });
  }
  return sqlInstance;
}

export async function closeSql() {
  if (sqlInstance) {
    await sqlInstance.end({ timeout: 5 });
    sqlInstance = null;
  }
}

export async function runKnowledgeMigrations() {
  const sql = getSql();
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../migrations/001_knowledge_chunks.sql"),
    resolve(here, "../../migrations/001_knowledge_chunks.sql"),
    resolve(here, "../../../site/drizzle/0006_knowledge_pgvector.sql"),
  ];

  const migrationPath = candidates.find((path) => existsSync(path));
  if (!migrationPath) {
    throw new Error(
      "Knowledge migration not found. Expected knowledge/migrations/001_knowledge_chunks.sql",
    );
  }

  const migration = readFileSync(migrationPath, "utf8");
  await sql.unsafe(migration);
}

export async function upsertKnowledgeChunks(
  chunks: KnowledgeChunkInput[],
): Promise<number> {
  if (chunks.length === 0) return 0;

  const sql = getSql();
  const embeddings = await embedTexts(chunks.map((c) => c.content));
  let upserted = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const embedding = embeddings[i]!;
    const contentHash = hashContent(chunk.source, chunk.chunkIndex, chunk.content);
    const id = contentHash.slice(0, 32);

    await sql`
      INSERT INTO knowledge_chunks (
        id, content, embedding_json, source, category, chunk_index, content_hash, updated_at
      )
      VALUES (
        ${id},
        ${chunk.content},
        ${sql.json(embedding)},
        ${chunk.source},
        ${chunk.category},
        ${chunk.chunkIndex},
        ${contentHash},
        NOW()
      )
      ON CONFLICT (source, content_hash)
      DO UPDATE SET
        content = EXCLUDED.content,
        embedding_json = EXCLUDED.embedding_json,
        category = EXCLUDED.category,
        chunk_index = EXCLUDED.chunk_index,
        updated_at = NOW()
    `;
    upserted += 1;
  }

  return upserted;
}

export async function countKnowledgeChunks(): Promise<number> {
  const sql = getSql();
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM knowledge_chunks
  `;
  return Number(rows[0]?.count ?? 0);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function searchKnowledgeChunks(
  queryEmbedding: number[],
  topK: number,
): Promise<StoredKnowledgeChunk[]> {
  const sql = getSql();

  const rows = await sql<
    Array<{
      id: string;
      content: string;
      source: string;
      category: string;
      chunkIndex: number;
      embedding_json: number[];
    }>
  >`
    SELECT
      id,
      content,
      source,
      category,
      chunk_index AS "chunkIndex",
      embedding_json
    FROM knowledge_chunks
  `;

  const ranked = rows
    .map((row) => ({
      id: row.id,
      content: row.content,
      source: row.source,
      category: row.category,
      chunkIndex: row.chunkIndex,
      embedding: row.embedding_json,
      similarity: cosineSimilarity(queryEmbedding, row.embedding_json),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return ranked;
}

export async function deleteStaleChunks(activeHashes: Set<string>) {
  const sql = getSql();
  const existing = await sql<{ content_hash: string }[]>`
    SELECT content_hash FROM knowledge_chunks
  `;

  const stale = existing
    .map((row) => row.content_hash)
    .filter((hash) => !activeHashes.has(hash));

  if (stale.length === 0) return 0;

  await sql`
    DELETE FROM knowledge_chunks
    WHERE content_hash = ANY(${stale})
  `;

  return stale.length;
}
