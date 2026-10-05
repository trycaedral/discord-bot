/**
 * Re-ingest bundled FAQ into the bot-local knowledge_chunks table.
 *
 * Usage:
 *   cd discord-bot && npm run knowledge:ingest
 */
import { loadScriptEnv } from "./script-env.js";

loadScriptEnv();

const { ingestKnowledgeBaseAndClose } = await import("@caedral/knowledge");

const result = await ingestKnowledgeBaseAndClose();
console.log(JSON.stringify(result, null, 2));
