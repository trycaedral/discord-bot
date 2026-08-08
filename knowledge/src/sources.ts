import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkText } from "./chunk.js";
import type { KnowledgeChunkInput } from "./db.js";
import { hashContent } from "./embeddings.js";

function documentToChunks(input: {
  source: string;
  category: string;
  title: string;
  description?: string;
  body: string;
}): KnowledgeChunkInput[] {
  const fullText = [
    `# ${input.title}`,
    input.description ?? "",
    input.body,
  ]
    .filter(Boolean)
    .join("\n\n");

  return chunkText(fullText).map((content, chunkIndex) => ({
    source: input.source,
    category: input.category,
    content,
    chunkIndex,
  }));
}

function knowledgePackageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

export function collectFaqKnowledgeSources(): KnowledgeChunkInput[] {
  const faqPath = resolve(knowledgePackageRoot(), "KNOWLEDGE_BASE.md");
  const faqBody = readFileSync(faqPath, "utf8");

  return documentToChunks({
    source: "knowledge/KNOWLEDGE_BASE.md",
    category: "faq",
    title: "Caedral internal FAQ and troubleshooting",
    body: faqBody,
  });
}

/** FAQ-only sources (site content collected separately via site package). */
export function collectKnowledgeSources(): KnowledgeChunkInput[] {
  return collectFaqKnowledgeSources();
}

export async function collectKnowledgeSourcesWithHashes() {
  const chunks = collectFaqKnowledgeSources();
  const hashes = new Set(
    chunks.map((c) => hashContent(c.source, c.chunkIndex, c.content)),
  );
  return { chunks, hashes };
}

export async function collectAllKnowledgeSourcesWithSiteContent(
  siteChunks: KnowledgeChunkInput[],
) {
  const chunks = [...collectFaqKnowledgeSources(), ...siteChunks];
  const hashes = new Set(
    chunks.map((c) => hashContent(c.source, c.chunkIndex, c.content)),
  );
  return { chunks, hashes };
}
