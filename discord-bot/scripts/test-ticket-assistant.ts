/**
 * End-to-end ticket AI simulation (same path as sendInitialTicketAssistantReply).
 *
 * Usage:
 *   cd discord-bot && npm run test:ticket-assistant
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const botRoot = resolve(__dirname, "..");
try {
  require(resolve(botRoot, "load-env.cjs")).loadRootEnv();
} catch {
  require(resolve(botRoot, "../../load-env.cjs")).loadRootEnv();
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for ticket assistant tests");
}

const sql = postgres(databaseUrl, { max: 2 });

const { generateAssistantReply, getAssistantReplyModel } = await import(
  "@caedral/knowledge"
);

const TICKET_CATEGORIES = {
  bug_report: "Bug Report",
  billing: "Billing Question",
  general: "General Question",
  feature: "Feature Request",
} as const;

type TicketCategoryKey = keyof typeof TICKET_CATEGORIES;

const CATEGORY_RETRIEVAL_QUERIES: Record<TicketCategoryKey, string> = {
  bug_report: "Caedral API errors troubleshooting debugging status",
  billing: "Caedral billing pricing subscription payment balance tokens",
  general: "Caedral getting started models API documentation support",
  feature: "Caedral product features roadmap feedback requests",
};

const migrationsDir = resolve(__dirname, "../migrations");
for (const file of [
  "001_discord_tickets.sql",
  "002_ticket_assistant.sql",
  "003_knowledge_chunks.sql",
]) {
  const path = resolve(migrationsDir, file);
  if (!existsSync(path)) continue;
  const migration = readFileSync(path, "utf8");
  await sql.unsafe(migration);
}

async function simulateInitialReply(categoryKey: TicketCategoryKey) {
  const categoryLabel = TICKET_CATEGORIES[categoryKey];
  const memberDisplayName = "TestUser";

  return generateAssistantReply({
    surface: "discord",
    messages: [
      {
        role: "user",
        content: `I just opened a ${categoryLabel} support ticket. My name is ${memberDisplayName}.`,
      },
    ],
    retrievalQuery: CATEGORY_RETRIEVAL_QUERIES[categoryKey],
    extraInstructions: [
      `This is the automated first reply for a new "${categoryLabel}" support ticket.`,
      "Use the Caedral knowledge base excerpts — cite specific product facts when relevant.",
      "Ask the user to describe their specific issue in detail.",
      "You are an AI assistant — do not pretend to be a human agent.",
      "Keep the response concise (2–4 short paragraphs max).",
    ].join(" "),
    model: getAssistantReplyModel(),
    maxTokens: 700,
    temperature: 0.4,
  });
}

async function testFollowUpWithHistory() {
  const channelId = `test-followup-${randomUUID()}`;
  const ticketId = randomUUID();
  const openerId = "user-followup-456";

  await sql`
    INSERT INTO discord_tickets (id, channel_id, opener_discord_id, category, status)
    VALUES (${ticketId}, ${channelId}, ${openerId}, ${"General Question"}, ${"open"})
  `;

  const openingUserMessage =
    "I just opened a General Question support ticket. My name is TestUser.";
  await sql`
    UPDATE discord_tickets
    SET assistant_history = assistant_history || ${sql.json([
      {
        role: "user",
        content: openingUserMessage,
        at: new Date().toISOString(),
      },
      {
        role: "assistant",
        content: "Hello! How can I help you today?",
        at: new Date().toISOString(),
      },
    ])}
    WHERE channel_id = ${channelId}
  `;

  const historyRows = await sql<{ assistant_history: unknown }[]>`
    SELECT assistant_history FROM discord_tickets WHERE channel_id = ${channelId}
  `;
  const history = (historyRows[0]?.assistant_history as Array<{
    role: "user" | "assistant";
    content: string;
  }>) ?? [];

  history.push({ role: "user", content: "oi, tudo bem?" });

  const reply = await generateAssistantReply({
    surface: "discord",
    messages: history.map(({ role, content }) => ({ role, content })),
    model: getAssistantReplyModel(),
    maxTokens: 900,
    temperature: 0.4,
  });

  console.log("\n=== Follow-up simulation ===");
  console.log("assistantModel:", getAssistantReplyModel());
  console.log("historyMessages:", history.length);
  console.log("\n--- Follow-up bot response ---\n");
  console.log(reply.content);

  if (isGenericFailureReply(reply.content)) {
    throw new Error("Follow-up Caedral chat call failed");
  }

  await sql`DELETE FROM discord_tickets WHERE id = ${ticketId}`;
}

function isGenericFailureReply(content: string): boolean {
  return content.includes("having trouble generating a response");
}

async function testMuteAndHistory() {
  const channelId = `test-channel-${randomUUID()}`;
  const ticketId = randomUUID();

  await sql`
    INSERT INTO discord_tickets (id, channel_id, opener_discord_id, category, status)
    VALUES (${ticketId}, ${channelId}, ${"user-123"}, ${"General Question"}, ${"open"})
  `;

  const entry = {
    role: "assistant" as const,
    content: "Hello! This is an automated first response.",
    at: new Date().toISOString(),
  };

  await sql`
    UPDATE discord_tickets
    SET assistant_history = assistant_history || ${sql.json([entry])}
    WHERE channel_id = ${channelId}
  `;

  await sql`
    UPDATE discord_tickets
    SET assistant_muted = true
    WHERE id = ${ticketId}
  `;

  await sql`DELETE FROM discord_tickets WHERE id = ${ticketId}`;
}

async function main() {
  console.log("=== Ticket AI end-to-end (Billing Question) ===\n");

  const reply = await simulateInitialReply("billing");

  console.log("knowledgeChunksUsed:", reply.knowledgeChunksUsed);
  console.log("webSearchUsed:", reply.webSearchUsed);
  console.log("assistantModel:", getAssistantReplyModel());
  console.log("\n--- Bot response (full) ---\n");
  console.log(reply.content);
  console.log("\n--- end ---\n");

  if (reply.knowledgeChunksUsed < 1) {
    throw new Error("Expected knowledge base retrieval — got 0 chunks");
  }

  if (reply.content.includes("having trouble generating a response")) {
    throw new Error("Caedral chat returned fallback — auth or model call failed");
  }

  await testMuteAndHistory();
  await testFollowUpWithHistory();
  await sql.end({ timeout: 5 });
  console.log("All checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
