import {
  getCaedralBotInstanceId,
  getCaedralInternalApiKey,
  getCaedralInternalApiUrl,
  KNOWLEDGE_CONFIG,
} from "./config.js";

export function caedralApiHeaders(): Record<string, string> {
  const instanceId = getCaedralBotInstanceId();
  const credential = instanceId || getCaedralInternalApiKey();
  return {
    Authorization: `Bearer ${credential}`,
    "Content-Type": "application/json",
  };
}

export function hasValidCaedralApiCredential(): boolean {
  const instanceId = getCaedralBotInstanceId();
  if (instanceId && /^[0-9a-f-]{36}$/i.test(instanceId)) return true;

  const key = getCaedralInternalApiKey();
  return key.length > 0 && key.startsWith("cd_live_");
}

async function caedralApiRequest(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const url = `${getCaedralInternalApiUrl()}${path}`;
  return fetch(url, {
    method,
    headers: caedralApiHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export async function caedralApiPost(
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return caedralApiRequest("POST", path, body);
}

export async function caedralApiGet(path: string): Promise<Response> {
  return caedralApiRequest("GET", path);
}

export type RerankResult = {
  index: number;
  relevanceScore: number;
};

/** Embed texts via Caedral API `POST /v1/embeddings` (caedral-embed). */
export async function caedralEmbedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await caedralApiPost("/v1/embeddings", {
    model: KNOWLEDGE_CONFIG.embeddingModelId,
    dimensions: KNOWLEDGE_CONFIG.embeddingDimensions,
    input: texts,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Caedral embeddings failed (${response.status}): ${body.slice(0, 300)}`,
    );
  }

  const json = (await response.json()) as {
    data?: Array<{ embedding?: number[]; index?: number }>;
  };

  const rows = json.data ?? [];
  if (rows.length !== texts.length) {
    throw new Error(
      `Expected ${texts.length} embeddings, received ${rows.length}`,
    );
  }

  return rows
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((row) => {
      const embedding = row.embedding;
      if (!embedding?.length) {
        throw new Error("Missing embedding vector in Caedral API response");
      }
      if (embedding.length !== KNOWLEDGE_CONFIG.embeddingDimensions) {
        throw new Error(
          `Expected ${KNOWLEDGE_CONFIG.embeddingDimensions} dimensions, received ${embedding.length}`,
        );
      }
      return embedding;
    });
}

/** Rerank documents via Caedral API `POST /v1/rerank` (caedral-rerank). */
export async function caedralRerankDocuments(input: {
  query: string;
  documents: string[];
  topN?: number;
}): Promise<RerankResult[]> {
  if (input.documents.length === 0) return [];

  const response = await caedralApiPost("/v1/rerank", {
    model: KNOWLEDGE_CONFIG.rerankModelId,
    query: input.query,
    documents: input.documents,
    ...(input.topN != null ? { top_n: input.topN } : {}),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Caedral rerank failed (${response.status}): ${body.slice(0, 300)}`,
    );
  }

  const json = (await response.json()) as {
    results?: Array<{ index?: number; relevance_score?: number }>;
  };

  return (json.results ?? [])
    .map((row) => ({
      index: row.index ?? 0,
      relevanceScore: row.relevance_score ?? 0,
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export function shouldUseCaedralApiForKnowledge(): boolean {
  return (
    process.env.KNOWLEDGE_USE_MOCK_EMBEDDINGS !== "1" &&
    hasValidCaedralApiCredential()
  );
}
