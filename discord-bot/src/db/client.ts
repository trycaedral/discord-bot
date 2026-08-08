import postgres from "postgres";
import { env } from "../config/env.js";

export const sql = postgres(env.databaseUrl, {
  max: 5,
  idle_timeout: 20,
});

export async function checkDatabase(): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await sql`SELECT 1 AS ok`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type UserLookupRow = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isAdmin: boolean;
  accountStatus: string;
  createdAt: Date;
  /** Prepaid API balance in USD cents (source of truth post API-only pivot). */
  balanceCents: number;
};

export async function lookupUserByEmail(
  email: string,
): Promise<UserLookupRow | null> {
  // subscriptions table dropped in site/drizzle/0014_api_only_pivot.sql —
  // billing is prepaid balance_cents on "user" only.
  const rows = await sql<UserLookupRow[]>`
    SELECT
      u.id,
      u.email,
      u.name,
      u.email_verified AS "emailVerified",
      u.is_admin AS "isAdmin",
      u.account_status AS "accountStatus",
      u.created_at AS "createdAt",
      u.balance_cents AS "balanceCents"
    FROM "user" u
    WHERE LOWER(u.email) = LOWER(${email})
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export type TicketRecord = {
  id: string;
  channelId: string;
  openerDiscordId: string;
  category: string;
  status: string;
  assistantMuted: boolean;
  assistantHistory: AssistantHistoryEntry[];
  createdAt: Date;
  closedAt: Date | null;
};

export type AssistantHistoryEntry = {
  role: "user" | "assistant";
  content: string;
  at: string;
};

export async function createTicketRecord(input: {
  id: string;
  channelId: string;
  openerDiscordId: string;
  category: string;
}): Promise<void> {
  await sql`
    INSERT INTO discord_tickets (id, channel_id, opener_discord_id, category, status)
    VALUES (${input.id}, ${input.channelId}, ${input.openerDiscordId}, ${input.category}, 'open')
  `;
}

export async function getTicketByChannel(
  channelId: string,
): Promise<TicketRecord | null> {
  const rows = await sql<TicketRecord[]>`
    SELECT
      id,
      channel_id AS "channelId",
      opener_discord_id AS "openerDiscordId",
      category,
      status,
      assistant_muted AS "assistantMuted",
      assistant_history AS "assistantHistory",
      created_at AS "createdAt",
      closed_at AS "closedAt"
    FROM discord_tickets
    WHERE channel_id = ${channelId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    assistantHistory: Array.isArray(row.assistantHistory)
      ? row.assistantHistory
      : [],
  };
}

export async function muteTicketAssistant(ticketId: string): Promise<void> {
  await sql`
    UPDATE discord_tickets
    SET assistant_muted = true
    WHERE id = ${ticketId}
  `;
}

export async function appendAssistantHistory(
  channelId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  const entry: AssistantHistoryEntry = {
    role,
    content,
    at: new Date().toISOString(),
  };

  const updated = await sql<{ id: string }[]>`
    UPDATE discord_tickets
    SET assistant_history = COALESCE(assistant_history, '[]'::jsonb) || ${sql.json([entry])}::jsonb
    WHERE channel_id = ${channelId}
    RETURNING id
  `;

  if (updated.length === 0) {
    throw new Error(`No open ticket record for channel ${channelId}`);
  }
}

export async function getAssistantHistory(
  channelId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const ticket = await getTicketByChannel(channelId);
  if (!ticket) return [];

  return ticket.assistantHistory.map((entry) => ({
    role: entry.role,
    content: entry.content,
  }));
}

export async function closeTicketRecord(
  ticketId: string,
  transcript: string,
): Promise<void> {
  await sql`
    UPDATE discord_tickets
    SET status = 'closed', closed_at = NOW(), transcript = ${transcript}
    WHERE id = ${ticketId}
  `;
}
