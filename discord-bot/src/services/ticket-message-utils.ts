import type { Message } from "discord.js";

const MAX_HISTORY_MESSAGES = 12;

/** Extract user-visible text from a Discord message (handles partial/empty content). */
export async function resolveMessageText(message: Message): Promise<string> {
  let content = message.content?.trim() ?? "";

  if (!content) {
    try {
      const full = message.partial ? await message.fetch() : message;
      content = full.content?.trim() ?? "";
      if (content) {
        console.log(
          `[ticket-flow] Resolved message text via fetch (partial=${message.partial})`,
        );
      }
    } catch (error) {
      console.warn("[ticket-flow] Failed to fetch message for content:", error);
    }
  }

  if (!content && message.cleanContent?.trim()) {
    content = message.cleanContent.trim();
    console.log("[ticket-flow] Resolved message text via cleanContent");
  }

  return content;
}

export function trimHistory<T extends { role: string; content: string }>(
  messages: T[],
): T[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) {
    return messages;
  }
  return messages.slice(-MAX_HISTORY_MESSAGES);
}

export async function keepTyping(channel: {
  sendTyping: () => Promise<unknown>;
}): Promise<{ stop: () => void }> {
  let active = true;

  const tick = async () => {
    while (active) {
      try {
        await channel.sendTyping();
      } catch {
        // channel may be deleted or bot lost access
      }
      await new Promise((resolve) => setTimeout(resolve, 8000));
    }
  };

  void tick();

  return {
    stop: () => {
      active = false;
    },
  };
}
