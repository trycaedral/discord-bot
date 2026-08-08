/**
 * Personality regression — verifies general-purpose assistant behavior (not support-bot redirects).
 *
 * Usage (from repo root):
 *   cd knowledge && npm run test:personality
 */
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateAssistantReply, getAssistantReplyModel } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

config({ path: resolve(repoRoot, ".env") });
config({ path: resolve(repoRoot, "site/.env") });

const TEST_CASES = [
  {
    label: "ocean poem",
    message: "write me a short poem about the ocean",
    rejectPatterns: [/caedral\.com/i, /how can I help.*caedral/i, /docs\.caedral/i],
  },
  {
    label: "binary search",
    message: "explain how binary search works",
    rejectPatterns: [/caedral/i, /how can I help with/i],
  },
  {
    label: "weather",
    message: "what's the weather like",
    rejectPatterns: [/how can I help with caedral/i, /visit our docs/i],
  },
  {
    label: "Caedral API key",
    message: "how do I get an API key for Caedral",
    requirePatterns: [/api key/i],
  },
  {
    label: "casual greeting",
    message: "hey what's up",
    rejectPatterns: [
      /how can I assist you today with caedral/i,
      /thank you for contacting support/i,
      /how may I help you with your caedral/i,
    ],
  },
  {
    label: "math (Portuguese)",
    message: "quanto é 100**10",
    rejectPatterns: [
      /how can I help.*caedral/i,
      /só posso ajudar.*caedral/i,
      /only help with caedral/i,
    ],
  },
] as const;

async function main(): Promise<void> {
  const model = getAssistantReplyModel();
  console.log(`Model: ${model}\n`);

  let passed = 0;
  for (const testCase of TEST_CASES) {
    console.log(`--- ${testCase.label} ---`);
    console.log(`User: ${testCase.message}`);

    const reply = await generateAssistantReply({
      surface: "chat",
      messages: [{ role: "user", content: testCase.message }],
      openRouterModel: model,
      maxTokens: 600,
      temperature: 0.3,
    });

    console.log(`Assistant: ${reply.content}\n`);
    console.log(
      `(knowledgeChunks=${reply.knowledgeChunksUsed}, webSearch=${reply.webSearchUsed})\n`,
    );

    let ok = true;
    for (const pattern of testCase.rejectPatterns ?? []) {
      if (pattern.test(reply.content)) {
        console.error(`  FAIL: matched reject pattern ${pattern}`);
        ok = false;
      }
    }
    for (const pattern of testCase.requirePatterns ?? []) {
      if (!pattern.test(reply.content)) {
        console.error(`  FAIL: missing required pattern ${pattern}`);
        ok = false;
      }
    }
    if (ok) {
      passed += 1;
      console.log("  PASS\n");
    }
  }

  console.log(`\n${passed}/${TEST_CASES.length} personality checks passed`);
  if (passed !== TEST_CASES.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
