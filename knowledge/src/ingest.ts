import {
  closeSql,
  countKnowledgeChunks,
  deleteStaleChunks,
  runKnowledgeMigrations,
  upsertKnowledgeChunks,
  type KnowledgeChunkInput,
} from "./db.js";
import { collectFaqKnowledgeSources } from "./sources.js";

export type IngestResult = {
  documents: number;
  chunks: number;
  upserted: number;
  removedStale: number;
  totalInDb: number;
};

export async function ingestKnowledgeBase(
  extraChunks: KnowledgeChunkInput[] = [],
): Promise<IngestResult> {
  await runKnowledgeMigrations();

  const chunks = [...collectFaqKnowledgeSources(), ...extraChunks];
  const { hashContent } = await import("./embeddings.js");
  const activeHashes = new Set(
    chunks.map((c) => hashContent(c.source, c.chunkIndex, c.content)),
  );
  const sources = new Set(chunks.map((c) => c.source));

  let upserted = 0;
  const batchSize = 16;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    upserted += await upsertKnowledgeChunks(batch);
  }

  const removedStale = await deleteStaleChunks(activeHashes);
  const totalInDb = await countKnowledgeChunks();

  return {
    documents: sources.size,
    chunks: chunks.length,
    upserted,
    removedStale,
    totalInDb,
  };
}

export async function ingestKnowledgeBaseAndClose(
  extraChunks: KnowledgeChunkInput[] = [],
): Promise<IngestResult> {
  try {
    return await ingestKnowledgeBase(extraChunks);
  } finally {
    await closeSql();
  }
}
