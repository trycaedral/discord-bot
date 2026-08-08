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
  try {
    const channel = await client.channels.fetch(env.updatesChannelId);
    if (!channel?.isSendable()) {
      return { ok: false, error: "Updates channel is not sendable." };
    }

    await sendBranded(channel, buildChangelogContainer(entry));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
