/**
 * Test retrieval against the knowledge base with sample queries.
 *
 * Usage (from knowledge/):
 *   npm run test-retrieval
 */
import { closeSql } from "../src/db.js";
import { retrieveContextDetailed } from "../src/retrieve.js";
import { buildCaedralSystemPrompt } from "../src/prompts.js";

const QUERIES = [
  "what is caedral's pricing",
  "who made caedral",
  "how do I fix a 401 invalid api key",
  "what are the model tiers",
];

console.log("=== Caedral Knowledge Base — Retrieval Test ===\n");

for (const query of QUERIES) {
  console.log(`Query: "${query}"`);
  const chunks = await retrieveContextDetailed(query, 3);

  if (chunks.length === 0) {
    console.log("  (no results)\n");
    continue;
  }

  for (const [index, chunk] of chunks.entries()) {
    console.log(
      `  [${index + 1}] similarity=${chunk.similarity.toFixed(4)} source=${chunk.source} category=${chunk.category}`,
    );
    console.log(
      `      ${chunk.content.slice(0, 180).replace(/\s+/g, " ")}${chunk.content.length > 180 ? "…" : ""}`,
    );
  }

  const promptPreview = buildCaedralSystemPrompt({
    surface: "discord",
    retrievedContext: chunks.map((c) => c.content),
  });
  console.log(`  System prompt length: ${promptPreview.length} chars`);
  console.log("");
}

await closeSql();
console.log("Done.");
