import { describe, expect, it } from "vitest";
import {
  extractLastUserText,
  parseSafetyClassification,
} from "../src/content-safety.js";

describe("content-safety", () => {
  it("extracts last user text message", () => {
    expect(
      extractLastUserText([
        { role: "system", content: "sys" },
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "  last message  " },
      ]),
    ).toBe("last message");
  });

  it("allows explicit safe classification", () => {
    expect(parseSafetyClassification("User Safety: safe")).toEqual({
      allowed: true,
      reason: "classified_safe",
    });
  });

  it("blocks explicit unsafe classification", () => {
    const result = parseSafetyClassification("User Safety: unsafe");
    expect(result.allowed).toBe(false);
  });

  it("allows ambiguous output", () => {
    expect(parseSafetyClassification("could not determine")).toEqual({
      allowed: true,
      reason: "ambiguous_allowed",
    });
  });
});
