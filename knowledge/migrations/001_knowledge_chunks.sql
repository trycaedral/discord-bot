-- Knowledge base chunks (embeddings stored as JSONB — no pgvector extension required)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
	"id" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"embedding_json" jsonb NOT NULL,
	"source" text NOT NULL,
	"category" text NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_chunks_source_content_hash_unique" UNIQUE("source","content_hash")
);

CREATE INDEX IF NOT EXISTS "knowledge_chunks_source_idx" ON "knowledge_chunks" ("source");
CREATE INDEX IF NOT EXISTS "knowledge_chunks_category_idx" ON "knowledge_chunks" ("category");
