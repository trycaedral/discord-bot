export { KNOWLEDGE_CONFIG, getOpenRouterApiKey, getAssistantReplyModel, DEFAULT_CAEDRAL_ASSISTANT_MODEL, requireDatabaseUrl, requireOpenRouterKey } from "./config.js";
export { chunkText } from "./chunk.js";
export { embedQuery, embedTexts, hashContent } from "./embeddings.js";
export {
  closeSql,
  countKnowledgeChunks,
  deleteStaleChunks,
  getSql,
  runKnowledgeMigrations,
  searchKnowledgeChunks,
  upsertKnowledgeChunks,
  type KnowledgeChunkInput,
  type StoredKnowledgeChunk,
} from "./db.js";
export { ingestKnowledgeBase, ingestKnowledgeBaseAndClose } from "./ingest.js";
export {
  buildCaedralSystemPrompt,
  getCaedralBaseSystemPrompt,
  type CaedralAiSurface,
} from "./prompts.js";
export {
  collectFaqKnowledgeSources,
  collectKnowledgeSources,
  collectKnowledgeSourcesWithHashes,
  collectAllKnowledgeSourcesWithSiteContent,
} from "./sources.js";
export {
  pingKnowledgeDb,
  retrieveContext,
  retrieveContextAndClose,
  retrieveContextDetailed,
  type RetrievedChunk,
} from "./retrieve.js";
export {
  caedralChatCompletionNonStream,
  fetchCaedralChatModelIds,
  formatInvalidModelMessage,
  CaedralChatError,
  type ChatCompletionMessage,
} from "./caedral-chat.js";
export {
  checkContentSafety,
  extractLastUserText,
  parseSafetyClassification,
  CONTENT_SAFETY_MODEL,
  CONTENT_SAFETY_TIMEOUT_MS,
  type ContentSafetyResult,
} from "./content-safety.js";
export {
  prepareAssistantMessages,
  generateAssistantReply,
  WEB_SEARCH_TOOL,
  type AssistantMessage,
  type PrepareAssistantInput,
  type PreparedAssistantContext,
  type GenerateAssistantReplyInput,
  type GenerateAssistantReplyResult,
} from "./assistant.js";
