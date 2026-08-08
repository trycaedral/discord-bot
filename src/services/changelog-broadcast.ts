import type { Client } from "discord.js";
import { env } from "../config/env.js";
import {
  postChangelogToDiscord,
  type ChangelogDiscordPayload,
} from "./changelog-discord.js";

export type PendingChangelogBroadcast = {
  broadcastId: string;
  changelogEntryId?: string;
  title: string;
  description: string;
  category?: string | null;
  version?: string | null;
};

function getApiUrl(path: string): string {
  return `${env.gatewayUrl.replace(/\/$/, "")}${path}`;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.instanceCredential()}`,
    "Content-Type": "application/json",
  };
}

export async function deliverPendingChangelogs(
  client: Client,
  pending: PendingChangelogBroadcast[],
): Promise<void> {
  if (!env.isRegistered() || pending.length === 0) return;

  for (const item of pending) {
    const payload: ChangelogDiscordPayload = {
      id: item.changelogEntryId ?? item.broadcastId,
      title: item.title,
      description: item.description,
      category: item.category ?? undefined,
      version: item.version ?? undefined,
    };

    let ok = false;
    let error: string | undefined;

    try {
      const result = await postChangelogToDiscord(client, payload);
      ok = result.ok;
      error = result.error;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    try {
      await fetch(getApiUrl("/v1/bot-instances/changelog-ack"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          broadcastId: item.broadcastId,
          ok,
          error: error ?? null,
        }),
      });
    } catch (ackErr) {
      console.warn(
        "[changelog-broadcast] Ack failed:",
        ackErr instanceof Error ? ackErr.message : ackErr,
      );
    }

    if (ok) {
      console.log(
        `[changelog-broadcast] Delivered "${item.title}" to Discord channels`,
      );
    } else {
      console.warn(`[changelog-broadcast] Delivery failed: ${error}`);
    }
  }
}
