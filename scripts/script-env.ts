/**
 * Shared env bootstrap for dev scripts — replaces the dynamic
 * createRequire(resolve(...)) pattern flagged as command-injection risk.
 * Mirrors load-env.cjs semantics: bot .env first, monorepo root as fallback,
 * never overriding values already in the environment.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function loadScriptEnv(): void {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const botRoot = resolve(scriptDir, "..");
  for (const candidate of [resolve(botRoot, ".env"), resolve(botRoot, "../../.env")]) {
    if (!existsSync(candidate)) continue;
    for (const line of readFileSync(candidate, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    return;
  }
}
