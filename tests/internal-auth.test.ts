import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyInternalBearer } from "../src/server/internal-auth.js";

describe("verifyInternalBearer", () => {
  it("accepts a matching secret", () => {
    assert.equal(verifyInternalBearer("super-secret", "super-secret"), true);
  });

  it("rejects missing or empty secrets", () => {
    assert.equal(verifyInternalBearer("token", undefined), false);
    assert.equal(verifyInternalBearer("token", ""), false);
    assert.equal(verifyInternalBearer(undefined, "secret"), false);
  });

  it("rejects wrong length without leaking via timing", () => {
    assert.equal(verifyInternalBearer("short", "much-longer-secret"), false);
  });

  it("rejects wrong value with equal length", () => {
    assert.equal(
      verifyInternalBearer("aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"),
      false,
    );
  });
});
