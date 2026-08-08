import { getOpenRouterApiKey, KNOWLEDGE_CONFIG } from "./config.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type ChatToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export type ChatCompletionResult = {
  content: string | null;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  finishReason: string | null;
};

function resolveOpenRouterApiKey(): string {
  return getOpenRouterApiKey();
}

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

function isNoRetryStatus(status: number): boolean {
  return status === 401 || status === 402;
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastNetworkError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (response.ok || isNoRetryStatus(response.status)) {
        return response;
      }

      if (!isTransientStatus(response.status)) {
        return response;
      }

      lastResponse = response;
      console.warn(
        `[knowledge/openrouter] transient upstream ${response.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
      );
    } catch (error) {
      lastNetworkError = error;
      console.warn(
        `[knowledge/openrouter] network error (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`,
        error instanceof Error ? error.message : error,
      );
    }

    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  if (lastResponse) return lastResponse;

  throw lastNetworkError instanceof Error
    ? lastNetworkError
    : new Error("Failed to reach the Caedral model service.");
}

export async function openRouterChatCompletionNonStream(input: {
  model: string;
  messages: ChatCompletionMessage[];
  tools?: ChatToolDefinition[];
  toolChoice?: "auto" | "none";
  maxTokens?: number;
  temperature?: number;
}): Promise<ChatCompletionResult | null> {
  if (!resolveOpenRouterApiKey()) {
    console.warn(
      "[knowledge/openrouter] OPENROUTER_API_KEY not set — skipping model call",
    );
    return null;
  }

  try {
    const body: Record<string, unknown> = {
      model: input.model,
      messages: input.messages,
      stream: false,
      ...(input.maxTokens != null ? { max_tokens: input.maxTokens } : {}),
      ...(input.temperature != null ? { temperature: input.temperature } : {}),
    };

    if (input.tools?.length) {
      body.tools = input.tools;
      body.tool_choice = input.toolChoice ?? "auto";
    }

    const response = await fetchWithRetry(body, {
      Authorization: `Bearer ${resolveOpenRouterApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": KNOWLEDGE_CONFIG.openRouterReferer,
      "X-Title": KNOWLEDGE_CONFIG.openRouterTitle,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(
        "[knowledge/openrouter] API error",
        response.status,
        text.slice(0, 200),
      );
      return null;
    }

    const json = (await response.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const choice = json.choices?.[0];
    const message = choice?.message;

    return {
      content: message?.content ?? null,
      toolCalls:
        message?.tool_calls?.map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        })) ?? [],
      finishReason: choice?.finish_reason ?? null,
    };
  } catch (error) {
    console.error("[knowledge/openrouter] Request failed:", error);
    return null;
  }
}
