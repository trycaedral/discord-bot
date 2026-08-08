/**
 * Simulates handleTicketAssistantMessage for owner-as-opener follow-ups.
 * Run: cd discord-bot && npx tsx scripts/simulate-owner-ticket-flow.ts
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

require(resolve(repoRoot, "load-env.cjs")).loadRootEnv();

const ownerId = process.env.OWNER_DISCORD_ID!;
const databaseUrl = process.env.DATABASE_URL!;

const sql = postgres(databaseUrl, { max: 2 });

const { handleTicketAssistantMessage } = await import(
  "../src/services/ticket-assistant.js"
);

type MockMessage = Parameters<typeof handleTicketAssistantMessage>[0];

function mockMessage(input: {
  authorId: string;
  channelId: string;
  channelName: string;
  content: string;
  bot?: boolean;
}): MockMessage {
  const channel = {
    id: input.channelId,
    name: input.channelName,
    isTextBased: () => true,
    isDMBased: () => false,
    sendTyping: async () => {},
    send: async (payload: unknown) => {
      console.log("[simulate] channel.send called:", JSON.stringify(payload).slice(0, 200));
      return { id: "mock-msg" };
    },
  };

  return {
    author: { id: input.authorId, bot: input.bot ?? false },
    guild: { id: "mock-guild" },
    channel,
    content: input.content,
    partial: false,
    cleanContent: input.content,
    fetch: async () => mockMessage(input),
  } as unknown as MockMessage;
}

async function main() {
  const channelId = `sim-owner-${randomUUID()}`;
  const ticketId = randomUUID();

  console.log("=== Owner-as-opener follow-up simulation ===");
  console.log("ownerId:", ownerId);
  console.log("channelId:", channelId);

  await sql`
    INSERT INTO discord_tickets (id, channel_id, opener_discord_id, category, status, assistant_muted)
    VALUES (${ticketId}, ${channelId}, ${ownerId}, ${"General Question"}, ${"open"}, ${false})
  `;

  await sql`
    UPDATE discord_tickets
    SET assistant_history = assistant_history || ${sql.json([
      {
        role: "user",
        content: "I just opened a General Question support ticket.",
        at: new Date().toISOString(),
      },
      {
        role: "assistant",
        content: "Hello! How can I help?",
        at: new Date().toISOString(),
      },
    ])}
    WHERE channel_id = ${channelId}
  `;

  const messages = [
    "First follow-up: what models does Caedral support?",
    "Second follow-up: how do I check my API balance?",
    "Third follow-up: thanks, that helps!",
  ];

  for (let i = 0; i < messages.length; i++) {
    console.log(`\n--- User message ${i + 1}: "${messages[i]}" ---\n`);
    await handleTicketAssistantMessage(
      mockMessage({
        authorId: ownerId,
        channelId,
        channelName: "ticket-sim-owner-test",
        content: messages[i],
      }),
    );

    const row = await sql<{ assistant_muted: boolean }[]>`
      SELECT assistant_muted FROM discord_tickets WHERE id = ${ticketId}
    `;
    if (row[0]?.assistant_muted) {
      throw new Error(
        `BUG: assistant muted after owner opener message ${i + 1}`,
      );
    }
  }

  const history = await sql<{ assistant_history: unknown }[]>`
    SELECT assistant_history FROM discord_tickets WHERE id = ${ticketId}
  `;
  const entries = (history[0]?.assistant_history as Array<{ role: string }>) ?? [];
  const assistantReplies = entries.filter((e) => e.role === "assistant").length;

  console.log(`\nHistory entries: ${entries.length}, assistant replies: ${assistantReplies}`);

  if (assistantReplies < 4) {
    throw new Error(`Expected at least 4 assistant entries (1 seed + 3 follow-ups), got ${assistantReplies}`);
  }

  await sql`DELETE FROM discord_tickets WHERE id = ${ticketId}`;
  await sql.end({ timeout: 5 });
  console.log("\nOwner-as-opener simulation PASSED.");
}

main().catch(async (error) => {
  console.error(error);
  await sql.end({ timeout: 2 }).catch(() => {});
  process.exit(1);
});
