import {
  caedralApiGet,
  caedralApiPost,
  hasValidCaedralApiCredential,
} from "./caedral-api.js";
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
    const response = await caedralApiGet("/v1/models");
    if (!response.ok) return [];

    const json = (await response.json()) as {
      data?: Array<{ id?: string; pricing_tier?: string }>;
    };

    return (json.data ?? [])
      .filter((row) => row.pricing_tier !== "specialized")
      .map((row) => row.id?.trim())
      .filter((id): id is string => Boolean(id));
  } catch {
    return [];
  }
}

export function formatInsufficientBalanceMessage(): string {
  return [
    "Your Caedral prepaid balance is insufficient for ticket AI right now.",
    "",
    "Top up at https://caedral.com/dashboard/billing — embed, rerank, and chat for tickets bill from the same balance as your API key.",
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
  response: Response,
  requestedModel: string,
): Promise<CaedralChatError> {
  const bodyText = await response.text().catch(() => "");
  let message = bodyText.slice(0, 400);

  try {
    const json = JSON.parse(bodyText) as {
      error?: { message?: string };
    };
    if (json.error?.message) {
      message = json.error.message;
    }
  } catch {
    // use raw body
  }

  if (isUnknownModelResponse(response.status, bodyText)) {
    const availableModels = await fetchCaedralChatModelIds();
    return new CaedralChatError(
      formatInvalidModelMessage(requestedModel, availableModels),
      response.status,
      availableModels,
    );
  }

  if (response.status === 402) {
    return new CaedralChatError(formatInsufficientBalanceMessage(), 402);
  }

  return new CaedralChatError(
    message || `Caedral chat failed (${response.status})`,
    response.status,
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
  const body: Record<string, unknown> = {
    model,
    messages: input.messages,
    stream: false,
    ...(input.maxTokens != null ? { max_tokens: input.maxTokens } : {}),
    ...(input.temperature != null ? { temperature: input.temperature } : {}),
  };

  let lastError: CaedralChatError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await caedralApiPost("/v1/chat/completions", body);

      if (response.ok) {
        const json = (await response.json()) as {
          choices?: Array<{
            finish_reason?: string;
            message?: { content?: string | null };
          }>;
        };
        const choice = json.choices?.[0];
        return {
          content: choice?.message?.content ?? null,
          finishReason: choice?.finish_reason ?? null,
        };
      }

      const chatError = await parseChatError(response, model);
      if (isNoRetryStatus(chatError.status) || !isTransientStatus(chatError.status)) {
        throw chatError;
      }

      lastError = chatError;
      console.warn(
        `[knowledge/caedral-chat] transient ${chatError.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
      );
    } catch (error) {
      if (error instanceof CaedralChatError) {
        if (isNoRetryStatus(error.status)) throw error;
        lastError = error;
      } else {
        lastError = new CaedralChatError(
          error instanceof Error ? error.message : "Network error",
          503,
        );
      }
    }

    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  throw lastError ?? new CaedralChatError("Caedral chat request failed", 503);
}
