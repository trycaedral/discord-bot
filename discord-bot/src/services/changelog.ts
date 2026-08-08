import { env } from "../config/env.js";

export type ChangelogEntry = {
  title: string;
  body: string;
  version?: string;
};

export async function publishChangelogToSite(
  entry: ChangelogEntry,
): Promise<{ ok: boolean; error?: string }> {
  if (!env.changelogApiSecret) {
    return {
      ok: false,
      error:
        "CHANGELOG_API_SECRET is not configured — Discord post only (site API pending).",
    };
  }

  try {
    const res = await fetch(env.changelogApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.changelogApiSecret}`,
      },
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
