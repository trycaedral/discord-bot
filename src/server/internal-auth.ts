import { timingSafeEqual } from "node:crypto";

/** Timing-safe bearer check for DISCORD_BOT_INTERNAL_SECRET. */
export function verifyInternalBearer(
  presented: string | undefined,
  expected: string | undefined,
): boolean {
  const secret = expected?.trim();
  if (!secret) return false;
  const token = presented?.trim();
  if (!token) return false;

  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
