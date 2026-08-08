import type { Client } from "discord.js";
import { BRAND_SAND, buildBrandedMessage, sendBranded } from "../branding/ui.js";
import { env } from "../config/env.js";

export type ChangelogDiscordPayload = {
  id?: string;
  title: string;
  description: string;
  category?: string;
  version?: string;
};

export function buildChangelogContainer(entry: ChangelogDiscordPayload) {
  const label = entry.category ?? entry.version;
  const heading = label ? `${label} — ${entry.title}` : entry.title;

  return buildBrandedMessage(
    BRAND_SAND,
    [`## What's new`, "", `**${heading}**`, "", entry.description].join("\n"),
  );
}

export async function postChangelogToDiscord(
  client: Client,
  entry: ChangelogDiscordPayload,
): Promise<{ ok: boolean; error?: string }> {
  const container = buildChangelogContainer(entry);
  const channelIds = [
    env.updatesChannelId,
    env.changelogLogChannelId || env.ticketLogChannelId,
  ].filter((id, index, arr) => id && arr.indexOf(id) === index);

  try {
    for (const channelId of channelIds) {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isSendable()) {
        return {
          ok: false,
          error: `Channel ${channelId} is not sendable.`,
        };
      }
      await sendBranded(channel, container);
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
