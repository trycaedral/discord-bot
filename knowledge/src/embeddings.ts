import { createHash } from "node:crypto";
import { caedralEmbedTexts } from "./caedral-api.js";
import { KNOWLEDGE_CONFIG } from "./config.js";

/** Mock vector dimension when no real API key is configured (dev only). */
const MOCK_EMBEDDING_DIMENSIONS = 384;

export function hashContent(source: string, chunkIndex: number, content: string) {
  return createHash("sha256")
    .update(`${source}:${chunkIndex}:${content}`)
    .digest("hex");
}

export function mockEmbedText(text: string): number[] {
  const dim = MOCK_EMBEDDING_DIMENSIONS;
  const vec = new Array<number>(dim).fill(0);
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);

  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash * 31 + word.charCodeAt(i)) >>> 0;
    }
    const index = hash % dim;
    vec[index]! += 1;
  }

  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vec.map((value) => value / norm);
}

/**
 * Embed texts via Caedral E1 Small (caedral-embed-e1-small-v1, 384D).
 * Mock vectors in dev when KNOWLEDGE_USE_MOCK_EMBEDDINGS=1 or no internal API key.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (process.env.KNOWLEDGE_USE_MOCK_EMBEDDINGS === "1") {
    return texts.map(mockEmbedText);
  }

  try {
    return await caedralEmbedTexts(texts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !process.env.CAEDRAL_BOT_INSTANCE_ID &&
      !process.env.CAEDRAL_API_KEY &&
      !process.env.CAEDRAL_INTERNAL_API_KEY &&
      !process.env.CAEDRAL_KNOWLEDGE_API_KEY
    ) {
      console.warn(
        `[knowledge] No Caedral API credential configured — using mock embeddings (${KNOWLEDGE_CONFIG.embeddingModelId}).`,
      );
      return texts.map(mockEmbedText);
    }
    throw new Error(`Caedral embed failed: ${message}`);
  }
}

export async function embedQuery(query: string): Promise<number[]> {
  const [embedding] = await embedTexts([query]);
  return embedding!;
}

export function vectorToSql(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
