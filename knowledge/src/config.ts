import { createRequire } from "node:module";
import { resolve } from "node:path";

function loadMonorepoEnv(): void {
  const require = createRequire(import.meta.url);

  // Static string literals only — dynamic require() breaks Next.js/Turbopack bundling.
  try {
    (require("../../../load-env.cjs") as { loadRootEnv: () => void }).loadRootEnv();
    return;
  } catch {
    // not at knowledge/dist or knowledge/src
  }

  try {
    (require("../../load-env.cjs") as { loadRootEnv: () => void }).loadRootEnv();
    return;
  } catch {
    // not at knowledge/package root
  }

  const { config } = require("dotenv") as typeof import("dotenv");
  config({ path: resolve(process.cwd(), ".env") });
}

loadMonorepoEnv();

export function getOpenRouterApiKey(): string {
  return (process.env.OPENROUTER_API_KEY ?? "").trim();
}

/** Production Caedral API — self-hosted bots cannot override this. */
export const CAEDRAL_PRODUCTION_GATEWAY = "https://api.caedral.com";

export function getCaedralInternalApiKey(): string {
  return (
    process.env.CAEDRAL_API_KEY ??
    process.env.CAEDRAL_INTERNAL_API_KEY ??
    process.env.CAEDRAL_KNOWLEDGE_API_KEY ??
    ""
  ).trim();
}

/** Internal Discord bot credential — instance UUID, unlimited gateway access. */
export function getCaedralBotInstanceId(): string {
  return (process.env.CAEDRAL_BOT_INSTANCE_ID ?? "").trim();
}

export function getCaedralInternalApiUrl(): string {
  const instanceId = getCaedralBotInstanceId();
  const apiKey = getCaedralInternalApiKey();
  const allowUnregistered =
    (process.env.CAEDRAL_BOT_ALLOW_UNREGISTERED ?? "").trim() === "1";

  // Self-hosted (API key, no internal instance): locked to production gateway.
  if (apiKey && !instanceId) {
    return CAEDRAL_PRODUCTION_GATEWAY;
  }

  const override = (
    process.env.CAEDRAL_INTERNAL_API_URL ??
    process.env.GATEWAY_URL ??
    ""
  )
    .trim()
    .replace(/\/$/, "");

  if (override) return override;
  if (allowUnregistered) return "http://localhost:5001";
  return CAEDRAL_PRODUCTION_GATEWAY;
}

/** Default Caedral chat model for ticket assistant and scripts. */
export const DEFAULT_CAEDRAL_ASSISTANT_MODEL = "caedral-base";

export function getAssistantReplyModel(): string {
  return (
    process.env.CAEDRAL_ASSISTANT_MODEL ??
    process.env.CAEDRAL_ASSISTANT_REPLY_MODEL ??
    DEFAULT_CAEDRAL_ASSISTANT_MODEL
  ).trim();
}

export const KNOWLEDGE_CONFIG = {
  /** Caedral API model ID for knowledge-base embeddings. */
  embeddingModelId:
    process.env.CAEDRAL_KNOWLEDGE_EMBED_MODEL ?? "caedral-embed-e1-small-v1",
  embeddingDimensions: Number(
    process.env.CAEDRAL_KNOWLEDGE_EMBED_DIMENSIONS ?? "384",
  ),
  /** Caedral API model ID for retrieval reranking (dogfooding caedral-rerank). */
  rerankModelId: process.env.CAEDRAL_KNOWLEDGE_RERANK_MODEL ?? "caedral-rerank",
  chunkSize: 900,
  chunkOverlap: 150,
  /** Final chunks included in the assistant system prompt after reranking. */
  defaultTopK: 5,
  /** Candidate chunks from vector search before reranking. */
  candidateTopK: Number(process.env.KNOWLEDGE_CANDIDATE_TOP_K ?? 20),
  openRouterReferer:
    process.env.OPENROUTER_HTTP_REFERER ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://caedral.com",
  openRouterTitle: process.env.OPENROUTER_APP_TITLE ?? "Caedral",
  databaseUrl: process.env.DATABASE_URL ?? "",
  assistantToolModel:
    process.env.CAEDRAL_ASSISTANT_TOOL_MODEL ?? DEFAULT_CAEDRAL_ASSISTANT_MODEL,
  get assistantReplyModel() {
    return getAssistantReplyModel();
  },
} as const;

export function requireDatabaseUrl(): string {
  if (!KNOWLEDGE_CONFIG.databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  return KNOWLEDGE_CONFIG.databaseUrl;
}

export function requireOpenRouterKey(): string {
  const key = getOpenRouterApiKey();
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  return key;
}
