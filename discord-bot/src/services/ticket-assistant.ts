import "../config/env.js";
import type { Message, TextChannel } from "discord.js";
import {
  generateAssistantReply,
  type AssistantMessage,
} from "@caedral/knowledge";
import {
  BRAND_SAND,
  buildBrandedMessage,
  sendBranded,
} from "../branding/ui.js";
import { env } from "../config/env.js";
import {
  getEffectiveAssistantModel,
  getInstanceSystemPrompt,
} from "./instance-auth.js";
import {
  appendAssistantHistory,
  getAssistantHistory,
  getTicketByChannel,
  muteTicketAssistant,
} from "../db/client.js";
import {
  TICKET_CATEGORIES,
  type TicketCategoryKey,
} from "../tickets/constants.js";
import {
  keepTyping,
  resolveMessageText,
  trimHistory,
} from "./ticket-message-utils.js";

const FLOW = "[ticket-flow]";

const AUTOMATED_LABEL = "**Caedral Assistant**";

/**
 * Returns the effective custom system prompt for this bot instance.
 * Priority: env var CAEDRAL_BOT_SYSTEM_PROMPT > DB-stored prompt > undefined
 */
function getEffectiveSystemPrompt(): string | undefined {
  if (env.systemPrompt) return env.systemPrompt;
  return getInstanceSystemPrompt() ?? undefined;
}

const AI_FAILURE_FALLBACK =
  "I could not reach the Caedral knowledge service right now. Please describe your issue in detail — a team member will follow up shortly.";

const CATEGORY_RETRIEVAL_QUERIES: Record<TicketCategoryKey, string> = {
  bug_report: "Caedral API errors troubleshooting debugging status",
  billing: "Caedral billing pricing subscription payment balance tokens",
  general: "Caedral getting started models API documentation support",
  feature: "Caedral product features roadmap feedback requests",
};

function truncateForDiscord(content: string, maxLength = 3600): string {
  if (content.length <= maxLength) {
    return content;
  }
  return `${content.slice(0, maxLength - 1)}…`;
}

function buildAutomatedReplyContainer(content: string) {
  return buildBrandedMessage(
    BRAND_SAND,
    [AUTOMATED_LABEL, "", truncateForDiscord(content)].join("\n"),
  );
}

async function sendAutomatedReply(
  channel: TextChannel,
  content: string,
): Promise<void> {
  console.log(
    `${FLOW} Sending Discord reply to #${channel.name} (${content.length} chars)`,
  );
  await sendBranded(channel, buildAutomatedReplyContainer(content));
  await appendAssistantHistory(channel.id, "assistant", content);
  console.log(`${FLOW} Reply posted and history saved for channel ${channel.id}`);
}

function categoryInitialInstructions(categoryLabel: string): string {
  return [
    `The user just opened a "${categoryLabel}" ticket.`,
    "Respond naturally as a general-purpose AI assistant — not as a scripted support agent.",
    "If their topic is Caedral-related, use knowledge base excerpts for accurate facts.",
    "If you need more detail, ask briefly. Keep it concise (2–4 short paragraphs max).",
  ].join(" ");
}

function isGenericFailureReply(content: string): boolean {
  return content.includes("having trouble generating a response");
}

function isModelConfigurationError(content: string): boolean {
  return (
    content.includes("CAEDRAL_ASSISTANT_MODEL") ||
    content.includes("Available chat models:") ||
    content.includes("Dashboard → Discord Bots")
  );
}

function isInsufficientBalanceError(content: string): boolean {
  return (
    content.includes("insufficient prepaid balance") ||
    content.includes("dashboard/billing")
  );
}

function shouldUseReplyContent(content: string): boolean {
  if (isModelConfigurationError(content)) return true;
  if (isInsufficientBalanceError(content)) return true;
  return !isGenericFailureReply(content);
}

function isTicketChannelName(name: string): boolean {
  return name.startsWith("ticket-");
}

export async function sendInitialTicketAssistantReply(
  channel: TextChannel,
  categoryKey: TicketCategoryKey,
  memberDisplayName: string,
): Promise<void> {
  const categoryLabel = TICKET_CATEGORIES[categoryKey];
  const openingUserMessage = `I just opened a ${categoryLabel} support ticket. My name is ${memberDisplayName}.`;

  try {
    await channel.sendTyping();

    const model = getEffectiveAssistantModel();
    console.log(
      `${FLOW} Initial reply: calling Caedral model=${model} category=${categoryKey}`,
    );

    const reply = await generateAssistantReply({
      surface: "discord",
      messages: [
        {
          role: "user",
          content: openingUserMessage,
        },
      ],
      retrievalQuery: CATEGORY_RETRIEVAL_QUERIES[categoryKey],
      extraInstructions: [getEffectiveSystemPrompt(), categoryInitialInstructions(categoryLabel)].filter(Boolean).join("\n\n"),
      model,
      maxTokens: 700,
      temperature: 0.4,
    });

    const content = shouldUseReplyContent(reply.content)
      ? reply.content
      : AI_FAILURE_FALLBACK;

    console.log(
      `${FLOW} Initial Caedral response: model=${model} knowledgeChunks=${reply.knowledgeChunksUsed} chars=${content.length}`,
    );

    await appendAssistantHistory(channel.id, "user", openingUserMessage);
    await sendAutomatedReply(channel, content);
  } catch (error) {
    console.error(`${FLOW} Initial ticket reply failed:`, error);
    try {
      await sendAutomatedReply(channel, AI_FAILURE_FALLBACK);
    } catch (sendError) {
      console.error(`${FLOW} Failed to post fallback reply:`, sendError);
    }
  }
}

/**
 * Mute the assistant when the server owner replies in someone else's open ticket.
 * Does nothing when the owner opened the ticket themselves (they should get AI follow-ups).
 */
export async function handleOwnerMessageInTicket(message: Message): Promise<boolean> {
  if (message.author.id !== env.ownerDiscordId) {
    return false;
  }

  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    console.log(`${FLOW} Owner message skip: not a guild text channel`);
    return false;
  }

  const ticket = await getTicketByChannel(message.channel.id);
  if (!ticket || ticket.status !== "open") {
    console.log(
      `${FLOW} Owner message skip: no open ticket for channel ${message.channel.id}`,
    );
    return false;
  }

  if (ticket.assistantMuted) {
    console.log(`${FLOW} Owner message skip: assistant already muted for ticket ${ticket.id}`);
    return false;
  }

  if (ticket.openerDiscordId === env.ownerDiscordId) {
    console.log(
      `${FLOW} Owner is ticket opener (${ticket.id}) — assistant stays active`,
    );
    return false;
  }

  await muteTicketAssistant(ticket.id);
  console.log(
    `${FLOW} Assistant muted for ticket ${ticket.id} after owner replied (opener=${ticket.openerDiscordId})`,
  );
  return true;
}

export async function handleTicketAssistantMessage(
  message: Message,
): Promise<void> {
  if (message.author.bot || !message.guild || !message.channel.isTextBased()) {
    console.log(
      `${FLOW} Skip: bot=${message.author.bot} guild=${Boolean(message.guild)} textBased=${message.channel.isTextBased()}`,
    );
    return;
  }

  if (message.channel.isDMBased()) {
    console.log(`${FLOW} Skip: DM channel`);
    return;
  }

  const channelName =
    "name" in message.channel ? message.channel.name : undefined;
  const looksLikeTicket = channelName ? isTicketChannelName(channelName) : false;

  console.log(
    `${FLOW} Channel check: name=${channelName ?? "unknown"} looksLikeTicket=${looksLikeTicket}`,
  );

  if (message.author.id === env.ownerDiscordId) {
    const muted = await handleOwnerMessageInTicket(message);
    if (muted) {
      console.log(
        `${FLOW} Owner muted assistant in #${channelName} — no auto-reply`,
      );
      return;
    }
    console.log(
      `${FLOW} Owner message in #${channelName} — continuing to follow-up flow (owner is opener or no mute)`,
    );
  }

  const ticket = await getTicketByChannel(message.channel.id);
  if (!ticket || ticket.status !== "open") {
    if (looksLikeTicket) {
      console.warn(
        `${FLOW} Skip: message in #${channelName} but no open ticket record (channel ${message.channel.id})`,
      );
    } else {
      console.log(`${FLOW} Skip: not a ticket channel or ticket closed/missing`);
    }
    return;
  }

  console.log(
    `${FLOW} Ticket found: id=${ticket.id} opener=${ticket.openerDiscordId} muted=${ticket.assistantMuted}`,
  );

  if (ticket.assistantMuted) {
    console.log(`${FLOW} Skip: assistant muted for ticket ${ticket.id}`);
    return;
  }

  if (message.author.id !== ticket.openerDiscordId) {
    console.log(
      `${FLOW} Skip: author ${message.author.id} is not ticket opener ${ticket.openerDiscordId}`,
    );
    return;
  }

  console.log(`${FLOW} Opener match — resolving message text`);
  const content = await resolveMessageText(message);
  if (!content) {
    console.warn(
      `${FLOW} Skip: empty message in #${channelName} from ${message.author.id}`,
    );
    return;
  }

  console.log(`${FLOW} Message text resolved (${content.length} chars) — starting AI generation`);
  const channel = message.channel as TextChannel;

  try {
    await appendAssistantHistory(channel.id, "user", content);
    console.log(`${FLOW} User message appended to history`);

    const typing = await keepTyping(channel);
    try {
      const history: AssistantMessage[] = trimHistory(
        await getAssistantHistory(channel.id),
      );
      const model = getEffectiveAssistantModel();
      console.log(
        `${FLOW} Calling Caedral model: model=${model} historyMessages=${history.length}`,
      );

      const reply = await generateAssistantReply({
        surface: "discord",
        messages: history,
        extraInstructions: getEffectiveSystemPrompt(),
        model,
        maxTokens: 900,
        temperature: 0.4,
      });

      const replyContent = shouldUseReplyContent(reply.content)
        ? reply.content
        : AI_FAILURE_FALLBACK;

      console.log(
        `${FLOW} Caedral response: model=${model} knowledgeChunks=${reply.knowledgeChunksUsed} chars=${replyContent.length}`,
      );

      await sendAutomatedReply(channel, replyContent);
    } finally {
      typing.stop();
    }
  } catch (error) {
    console.error(`${FLOW} Follow-up reply failed:`, error);
    try {
      await sendAutomatedReply(channel, AI_FAILURE_FALLBACK);
    } catch (sendError) {
      console.error(`${FLOW} Failed to post fallback reply:`, sendError);
    }
  }
}
