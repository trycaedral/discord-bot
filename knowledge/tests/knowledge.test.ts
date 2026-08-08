import { describe, expect, it } from "vitest";
import { buildCaedralSystemPrompt, getCaedralBaseSystemPrompt } from "../src/prompts.js";
import { chunkText } from "../src/chunk.js";

describe("knowledge prompts", () => {
  it("establishes general-purpose Caedral assistant identity", () => {
    const prompt = getCaedralBaseSystemPrompt("discord");
    expect(prompt).toMatch(/fully general-purpose AI/i);
    expect(prompt).toMatch(/You were built by Caedral/i);
    expect(prompt).toMatch(/Leonardo Turque/i);
    expect(prompt).toMatch(/Never claim another company created you/i);
  });

  it("includes retrieved context blocks", () => {
    const prompt = buildCaedralSystemPrompt({
      surface: "chat",
      retrievedContext: ["Prepaid balance only — no subscriptions."],
    });
    expect(prompt).toContain("Prepaid balance only — no subscriptions.");
    expect(prompt).toContain("--- Context 1 ---");
    expect(prompt).toMatch(/may be relevant if the user is asking about Caedral/i);
  });

  it("discourages guessing when no context was retrieved", () => {
    const prompt = buildCaedralSystemPrompt({ surface: "chat" });
    expect(prompt).toMatch(/do NOT guess or invent answers/i);
  });

  it("requires authoritative use of retrieved context", () => {
    const prompt = buildCaedralSystemPrompt({
      surface: "chat",
      retrievedContext: ["Rerank costs $0.0005 per search"],
    });
    expect(prompt).toMatch(/treat these excerpts as authoritative/i);
    expect(prompt).toContain("$0.0005 per search");
  });
});

describe("chunkText", () => {
  it("splits long documents into multiple chunks", () => {
    const text = "Paragraph one.\n\n" + "Word ".repeat(500);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 900)).toBe(true);
  });
});
