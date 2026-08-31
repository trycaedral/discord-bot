import { CaedralAPIError } from "caedral";
import {
  getCaedralClient,
  notreRequestOptions,
} from "./caedral-client.js";
import { hasValidCaedralApiCredential } from "./caedral-api.js";
import { getAssistantReplyModel } from "./config.js";

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionResult = {
  content: string | null;
  finishReason: string | null;
};

export class CaedralChatError extends Error {
  readonly status: number;
  readonly availableModels: string[];

  constructor(message: string, status: number, availableModels: string[] = []) {
    super(message);
    this.name = "CaedralChatError";
    this.status = status;
    this.availableModels = availableModels;
  }
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function isNoRetryStatus(status: number): boolean {
  return status === 401 || status === 402 || status === 400;
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isUnknownModelResponse(status: number, bodyText: string): boolean {
  if (status !== 400 && status !== 404) return false;
  const lower = bodyText.toLowerCase();
  return (
    lower.includes("unknown model") ||
    lower.includes("invalid model") ||
    lower.includes("use get /v1/models")
  );
}

export async function fetchCaedralChatModelIds(): Promise<string[]> {
  try {
    const client = getCaedralClient();
    const response = await client.models.list();
    return (response.data ?? [])
      .filter((row: { pricing_tier?: string }) => row.pricing_tier !== "specialized")
      .map((row: { id?: string }) => row.id?.trim())
      .filter((id: string | undefined): id is string => Boolean(id));
  } catch {
    return [];
  }
}

export function formatInsufficientBalanceMessage(): string {
  return [
    "Your Caedral included quota is exhausted for ticket AI right now.",
    "",
    "Enable on-demand or upgrade the plan at https://caedral.com/dashboard/billing.",
    "",
    "A human support agent will follow up shortly.",
  ].join("\n");
}

export function formatInvalidModelMessage(
  requestedModel: string,
  availableModels: string[],
): string {
  const chatModels =
    availableModels.length > 0
      ? availableModels
      : [
          "caedral-base",
          "caedral-titan",
          "caedral-olympus",
          "caedral-primordial",
        ];

  return [
    `The configured model "${requestedModel}" is not available on your Caedral account.`,
    "",
    "Available chat models:",
    ...chatModels.map((id) => `- ${id}`),
    "",
    "Set CAEDRAL_ASSISTANT_MODEL in your bot environment, or choose a model in Dashboard → Discord Bots.",
  ].join("\n");
}

async function parseChatError(
  err: unknown,
  requestedModel: string,
): Promise<CaedralChatError> {
  if (err instanceof CaedralAPIError) {
    const apiErr = err;
    const bodyText =
      typeof apiErr.rawBody === "string"
        ? apiErr.rawBody
        : apiErr.message;
    if (isUnknownModelResponse(apiErr.statusCode, bodyText)) {
      const availableModels = await fetchCaedralChatModelIds();
      return new CaedralChatError(
        formatInvalidModelMessage(requestedModel, availableModels),
        apiErr.statusCode,
        availableModels,
      );
    }
    if (apiErr.statusCode === 402) {
      return new CaedralChatError(formatInsufficientBalanceMessage(), 402);
    }
    return new CaedralChatError(
      apiErr.message || `Caedral chat failed (${apiErr.statusCode})`,
      apiErr.statusCode,
    );
  }

  return new CaedralChatError(
    err instanceof Error ? err.message : "Network error",
    503,
  );
}

export async function caedralChatCompletionNonStream(input: {
  model?: string;
  messages: ChatCompletionMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<ChatCompletionResult> {
  if (!hasValidCaedralApiCredential()) {
    throw new CaedralChatError(
      "No Caedral API credential configured (CAEDRAL_API_KEY or CAEDRAL_BOT_INSTANCE_ID).",
      401,
    );
  }

  const model = (input.model ?? getAssistantReplyModel()).trim();
  const client = getCaedralClient();
  const notre = notreRequestOptions();

  let lastError: CaedralChatError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages: input.messages,
        stream: false,
        ...(input.maxTokens != null ? { max_tokens: input.maxTokens } : {}),
        ...(input.temperature != null ? { temperature: input.temperature } : {}),
        ...(notre ? { notre } : {}),
      });

      const choice = completion.choices?.[0];
      return {
        content: choice?.message?.content ?? null,
        finishReason: choice?.finish_reason ?? null,
      };
    } catch (error) {
      const chatError = await parseChatError(error, model);
      if (isNoRetryStatus(chatError.status) || !isTransientStatus(chatError.status)) {
        throw chatError;
      }
      lastError = chatError;
      console.warn(
        `[knowledge/caedral-chat] transient ${chatError.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
      );
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError ?? new CaedralChatError("Caedral chat request failed", 503);
}
