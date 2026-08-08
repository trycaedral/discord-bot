import { env } from "../config/env.js";

export async function fetchServiceHealth(
  url: string,
  timeoutMs = 5000,
): Promise<{ ok: boolean; latencyMs: number; status?: number; error?: string }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return {
      ok: res.ok,
      latencyMs: Date.now() - start,
      status: res.status,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export type StatusSnapshot = {
  site: Awaited<ReturnType<typeof fetchServiceHealth>>;
  gateway: Awaited<ReturnType<typeof fetchServiceHealth>>;
  database: Awaited<ReturnType<typeof import("../db/client.js").checkDatabase>>;
};

export async function getFullStatus(): Promise<StatusSnapshot> {
  const { checkDatabase } = await import("../db/client.js");
  const [site, gateway, database] = await Promise.all([
    fetchServiceHealth(env.siteUrl),
    fetchServiceHealth(`${env.gatewayUrl.replace(/\/$/, "")}/health`),
    checkDatabase(),
  ]);
  return { site, gateway, database };
}

function statusLabel(ok: boolean) {
  return ok ? "Operational" : "Unavailable";
}

export function formatOwnerStatus(snapshot: StatusSnapshot): string {
  const siteDetail = snapshot.site.ok
    ? `${snapshot.site.latencyMs}ms · HTTP ${snapshot.site.status ?? "—"}`
    : snapshot.site.error ?? "Unreachable";
  const gatewayDetail = snapshot.gateway.ok
    ? `${snapshot.gateway.latencyMs}ms · HTTP ${snapshot.gateway.status ?? "—"}`
    : snapshot.gateway.error ?? "Unreachable";
  const dbDetail = snapshot.database.ok
    ? `${snapshot.database.latencyMs}ms`
    : snapshot.database.error ?? "Unreachable";

  return [
    "## Service status",
    "_Internal view · owner only_",
    "",
    `**Website** · ${statusLabel(snapshot.site.ok)}`,
    `${env.siteUrl}`,
    siteDetail,
    "",
    `**API Gateway** · ${statusLabel(snapshot.gateway.ok)}`,
    `${env.gatewayUrl}`,
    gatewayDetail,
    "",
    `**Database** · ${statusLabel(snapshot.database.ok)}`,
    dbDetail,
  ].join("\n");
}

export function formatPublicStatus(snapshot: StatusSnapshot): string {
  const siteUp = snapshot.site.ok;
  const apiUp = snapshot.gateway.ok;
  const overall = siteUp && apiUp;

  return [
    "## Service status",
    "",
    overall
      ? "All systems are operational."
      : "Some systems are currently degraded.",
    "",
    `**Website** · ${statusLabel(siteUp)}`,
    `**API** · ${statusLabel(apiUp)}`,
    "",
    `Last checked · ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`,
  ].join("\n");
}
