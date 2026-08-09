import { env } from "../config/env.js";
import { getInstanceId } from "./instance-auth.js";

export type TranscriptMessage = {
  id: string;
  authorId: string;
  authorTag: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  content: string;
  createdAt: string;
  attachments: string[];
  isBot: boolean;
};

function getApiUrl(path: string): string {
  return `${env.gatewayUrl.replace(/\/$/, "")}${path}`;
}

function instanceAuthHeaders(): Record<string, string> {
  const credential = env.instanceCredential();
  if (!credential) {
    throw new Error("No Caedral bot credential configured");
  }

  return {
    Authorization: `Bearer ${credential}`,
    "Content-Type": "application/json",
  };
}

export async function submitTicketTranscript(
  ticketId: string,
  transcript: TranscriptMessage[],
  meta: { category: string; openerDiscordId: string; closedAt: string },
): Promise<string | null> {
  const instanceId = getInstanceId();
  if (!instanceId) {
    console.warn(
      "[ticket-transcripts] No instanceId cached yet — skipping transcript upload.",
    );
    return null;
  }

  try {
    const res = await fetch(
      getApiUrl(`/v1/bot-instances/${instanceId}/tickets/${ticketId}/transcripts`),
      {
        method: "POST",
        headers: instanceAuthHeaders(),
        body: JSON.stringify({
          transcript,
          category: meta.category,
          openerDiscordId: meta.openerDiscordId,
          closedAt: meta.closedAt,
        }),
      },
    );

    if (!res.ok) {
      console.warn(`[ticket-transcripts] Upload failed: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { url: string };
    return data.url;
  } catch (error) {
    console.warn(
      "[ticket-transcripts] Upload error:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}