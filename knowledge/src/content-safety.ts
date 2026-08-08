import { getOpenRouterApiKey, KNOWLEDGE_CONFIG } from "./config.js";

export const CONTENT_SAFETY_MODEL = "nvidia/nemotron-3.5-content-safety:free";
export const CONTENT_SAFETY_TIMEOUT_MS = 2500;

export type ContentSafetyResult =
  | { allowed: true; skipped?: boolean; reason?: string }
  | { allowed: false; reason: string };

type ChatMessageLike = { role: string; content?: unknown };

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Extract the last user text message for moderation. */
export function extractLastUserText(
  messages: ChatMessageLike[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.role !== "user") continue;
    const content = message.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const text = content
        .filter(
          (part): part is { type: string; text?: string } =>
            typeof part === "object" && part !== null,
        )
        .map((part) => (part.type === "text" ? part.text ?? "" : ""))
        .join("")
        .trim();
      if (text) return text;
    }
  }
  return null;
}

/** Parse Nemotron content-safety output — block only on explicit unsafe. */
export function parseSafetyClassification(text: string): ContentSafetyResult {
  const normalized = text.trim().toLowerCase();

  const userSafetyMatch = normalized.match(/user safety:\s*(safe|unsafe)/i);
  if (userSafetyMatch) {
    if (userSafetyMatch[1]!.toLowerCase() === "unsafe") {
      return {
        allowed: false,
        reason: "Content violates Caedral's acceptable use policy.",
      };
    }
    return { allowed: true, reason: "classified_safe" };
  }

  // Ambiguous output — bias toward allow
  if (/\bunsafe\b/.test(normalized) && !/\bsafe\b/.test(normalized)) {
    return {
      allowed: false,
      reason: "Content violates Caedral's acceptable use policy.",
    };
  }

  return { allowed: true, reason: "ambiguous_allowed" };
}

/**
 * Run content safety check before inference.
 * On timeout, error, or unavailability — always allow (fail open).
 */
export async function checkContentSafety(
  userText: string,
): Promise<ContentSafetyResult> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    console.warn("[content-safety] OPENROUTER_API_KEY unset — skipping check");
    return { allowed: true, skipped: true, reason: "no_api_key" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CONTENT_SAFETY_TIMEOUT_MS,
  );

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": KNOWLEDGE_CONFIG.openRouterReferer,
        "X-Title": KNOWLEDGE_CONFIG.openRouterTitle,
      },
      body: JSON.stringify({
        model: CONTENT_SAFETY_MODEL,
        messages: [{ role: "user", content: userText }],
        max_tokens: 64,
        temperature: 0.01,
        chat_template_kwargs: {
          request_categories: "/no_categories",
          enable_thinking: false,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(
        `[content-safety] upstream ${response.status} — allowing request`,
      );
      return { allowed: true, skipped: true, reason: `upstream_${response.status}` };
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    return parseSafetyClassification(content);
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : error instanceof Error
          ? error.message
          : "unknown";
    console.warn(`[content-safety] check failed (${reason}) — allowing request`);
    return { allowed: true, skipped: true, reason };
  } finally {
    clearTimeout(timeout);
  }
}
