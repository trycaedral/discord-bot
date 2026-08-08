/**
 * Re-ingest bundled FAQ into the bot-local knowledge_chunks table.
 *
 * Usage:
 *   cd discord-bot && npm run knowledge:ingest
 */
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const botRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  require(resolve(botRoot, "load-env.cjs")).loadRootEnv();
} catch {
  require(resolve(botRoot, "../../load-env.cjs")).loadRootEnv();
}

const { ingestKnowledgeBaseAndClose } = await import("@caedral/knowledge");

const result = await ingestKnowledgeBaseAndClose();
console.log(JSON.stringify(result, null, 2));
