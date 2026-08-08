import { KNOWLEDGE_CONFIG } from "./config.js";
import {
  caedralChatCompletionNonStream,
  CaedralChatError,
} from "./caedral-chat.js";
import {
  buildCaedralSystemPrompt,
  type CaedralAiSurface,
} from "./prompts.js";
import { checkContentSafety, extractLastUserText } from "./content-safety.js";
import { retrieveContext } from "./retrieve.js";
import { getAssistantReplyModel } from "./config.js";

export type AssistantMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type PrepareAssistantInput = {
  surface: CaedralAiSurface;
  messages: AssistantMessage[];
  /** Caedral model id (e.g. caedral-base, caedral-titan). */
  model?: string;
  /** @deprecated Use `model` — Caedral public model id. */
  openRouterModel?: string;
  /** Override the query used for knowledge retrieval */
  retrievalQuery?: string;
  /** Extra instructions appended to the system prompt */
  extraInstructions?: string;
};

export type PreparedAssistantContext = {
  messages: AssistantMessage[];
  knowledgeChunksUsed: number;
};

export type GenerateAssistantReplyInput = PrepareAssistantInput & {
  maxTokens?: number;
  temperature?: number;
};

export type GenerateAssistantReplyResult = {
  content: string;
  knowledgeChunksUsed: number;
  /** @deprecated Web search removed — always false. */
  webSearchUsed: boolean;
};

function resolveModel(input: PrepareAssistantInput): string {
  return (input.model ?? input.openRouterModel ?? getAssistantReplyModel()).trim();
}

function stripSystemMessages(messages: AssistantMessage[]): AssistantMessage[] {
  return messages.filter((message) => message.role !== "system");
}

function getLatestUserMessage(messages: AssistantMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && message.content.trim()) {
      return message.content.trim();
    }
  }
  return null;
}

async function safeRetrieveContext(query: string): Promise<string[]> {
  try {
    let chunks = await retrieveContext(query);

    const isFounderQuery = /\b(fundador|founder|founded|quem (é|e) o fundador)\b/i.test(
      query,
    );
    const hasFounderChunk = chunks.some((chunk) =>
      /Leonardo Turque/i.test(chunk),
    );

    if (isFounderQuery && !hasFounderChunk) {
      const founderChunks = await retrieveContext(
        "Caedral founder Leonardo Turque company history",
      );
      const merged = [...founderChunks];
      for (const chunk of chunks) {
        if (!merged.includes(chunk)) {
          merged.push(chunk);
        }
      }
      chunks = merged.slice(0, KNOWLEDGE_CONFIG.defaultTopK);
    }

    return chunks;
  } catch (error) {
    console.error("[knowledge/assistant] Knowledge retrieval failed:", error);
    return [];
  }
}

/**
 * Enrich chat/ticket messages with Caedral system prompt and knowledge base context.
 */
export async function prepareAssistantMessages(
  input: PrepareAssistantInput,
): Promise<PreparedAssistantContext> {
  const conversation = stripSystemMessages(input.messages);
  const latestUserQuery = getLatestUserMessage(conversation);
  const queryForRetrieval = input.retrievalQuery?.trim() || latestUserQuery;

  if (!queryForRetrieval) {
    return {
      messages: input.messages,
      knowledgeChunksUsed: 0,
    };
  }

  try {
    const knowledgeContext = await safeRetrieveContext(queryForRetrieval);

    const systemPrompt = buildCaedralSystemPrompt({
      surface: input.surface,
      retrievedContext: knowledgeContext,
      extraInstructions: input.extraInstructions?.trim() || undefined,
    });

    return {
      messages: [{ role: "system", content: systemPrompt }, ...conversation],
      knowledgeChunksUsed: knowledgeContext.length,
    };
  } catch (error) {
    console.error("[knowledge/assistant] prepareAssistantMessages failed:", error);
    return {
      messages: input.messages,
      knowledgeChunksUsed: 0,
    };
  }
}

/**
 * Generate a complete non-streaming assistant reply via Caedral POST /v1/chat/completions.
 */
export async function generateAssistantReply(
  input: GenerateAssistantReplyInput,
): Promise<GenerateAssistantReplyResult> {
  const model = resolveModel(input);

  const userText = extractLastUserText(input.messages);
  if (userText) {
    const safety = await checkContentSafety(userText);
    if (!safety.allowed) {
      return {
        content:
          "I can't help with that request because it doesn't comply with Caedral's content policy.",
        webSearchUsed: false,
        knowledgeChunksUsed: 0,
      };
    }
  }

  try {
    const prepared = await prepareAssistantMessages(input);

    const completion = await caedralChatCompletionNonStream({
      model,
      messages: prepared.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      maxTokens: input.maxTokens ?? 1024,
      temperature: input.temperature ?? 0.4,
    });

    const content =
      completion.content?.trim() ||
      "I'm having trouble generating a response right now. A human support agent will follow up shortly.";

    return {
      content,
      webSearchUsed: false,
      knowledgeChunksUsed: prepared.knowledgeChunksUsed,
    };
  } catch (error) {
    if (error instanceof CaedralChatError) {
      console.error("[knowledge/assistant] Caedral chat error:", error.message);
      return {
        content: error.message,
        webSearchUsed: false,
        knowledgeChunksUsed: 0,
      };
    }

    console.error("[knowledge/assistant] generateAssistantReply failed:", error);
    return {
      content:
        "I'm having trouble generating a response right now. A human support agent will follow up shortly.",
      webSearchUsed: false,
      knowledgeChunksUsed: 0,
    };
  }
}

/** @deprecated Web search removed from the assistant pipeline. */
export const WEB_SEARCH_TOOL = {
  type: "function" as const,
  function: {
    name: "web_search",
    description: "Removed — assistant uses Caedral API and knowledge base only.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};
