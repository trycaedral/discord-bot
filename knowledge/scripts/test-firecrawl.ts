/**
 * Tests Firecrawl integration and graceful fallback.
 *
 * Usage (from repo root):
 *   cd knowledge && npm run test-firecrawl
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

config({ path: resolve(repoRoot, ".env") });
config({ path: resolve(repoRoot, "site/.env") });

const {
  generateAssistantReply,
  prepareAssistantMessages,
  searchWeb,
} = await import("../src/index.js");

async function testInvalidKeyFallback() {
  const original = process.env.FIRECRAWL_API_KEY;
  process.env.FIRECRAWL_API_KEY = "fc-invalid-key-for-test";

  console.log("\n=== Fallback: invalid FIRECRAWL_API_KEY ===");

  const searchResult = await searchWeb("Caedral API status outage");
  console.log(
    "searchWeb result:",
    searchResult === null ? "null (expected)" : "unexpected data",
  );

  const prepared = await prepareAssistantMessages({
    surface: "chat",
    messages: [{ role: "user", content: "Is there a Caedral outage right now?" }],
    openRouterModel: "deepseek/deepseek-v4-flash",
  });

  console.log("prepareAssistantMessages:");
  console.log("  messages count:", prepared.messages.length);
  console.log("  has system prompt:", prepared.messages[0]?.role === "system");
  console.log("  webSearchUsed:", prepared.webSearchUsed);
  console.log("  knowledgeChunksUsed:", prepared.knowledgeChunksUsed);

  const reply = await generateAssistantReply({
    surface: "discord",
    messages: [{ role: "user", content: "What is Caedral?" }],
    openRouterModel:
      process.env.CAEDRAL_ASSISTANT_REPLY_MODEL ??
      "deepseek/deepseek-v4-flash",
    maxTokens: 200,
  });

  console.log("generateAssistantReply:");
  console.log("  content length:", reply.content.length);
  console.log("  preview:", reply.content.slice(0, 120).replace(/\n/g, " "));
  console.log("  webSearchUsed:", reply.webSearchUsed);

  process.env.FIRECRAWL_API_KEY = original;
}

async function testValidKeyIfConfigured() {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key || key === "fc-invalid-key-for-test") {
    console.log("\n=== Success path: skipped (FIRECRAWL_API_KEY not set) ===");
    return;
  }

  console.log("\n=== Success path: valid FIRECRAWL_API_KEY ===");

  const searchResult = await searchWeb("Caedral AI API", { limit: 2 });
  if (searchResult) {
    console.log("searchWeb snippets:", searchResult.snippets.length);
    for (const snippet of searchResult.snippets) {
      console.log(`  - ${snippet.title} (${snippet.url})`);
    }
  } else {
    console.log("searchWeb returned null (check API key or network)");
  }
}

async function main() {
  await testInvalidKeyFallback();
  await testValidKeyIfConfigured();
  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
