/**
 * Load discord-bot/.env for local scripts (standalone repo or monorepo subfolder).
 */
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const BOT_ROOT = resolve(__dirname);

function loadEnvFile(filePath, { overwrite = false } = {}) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;

    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (overwrite || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadRootEnv() {
  loadEnvFile(resolve(BOT_ROOT, ".env"));
}

module.exports = { loadRootEnv, loadEnvFile };
