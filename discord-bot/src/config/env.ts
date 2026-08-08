import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load repo-root `.env` when running outside Docker (dev, PM2). In Docker,
 * `env_file: .env` already populates process.env, so a missing load-env.cjs
 * at any of these relative depths is not fatal — just skip silently.
 */
function loadMonorepoEnv(): void {
  const req = createRequire(import.meta.url);
  for (const rel of ["../../../load-env.cjs", "../../load-env.cjs"]) {
    try {
      (req(rel) as { loadRootEnv: () => void }).loadRootEnv();
      return;
    } catch {
      // try next candidate path
    }
  }
}

loadMonorepoEnv();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() ?? fallback;
}

function optionalFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/** Bot app id for REST calls; falls back to DISCORD_CLIENT_ID (often the site OAuth app). */
function botApplicationId(): string {
  return optional("DISCORD_BOT_APPLICATION_ID") || required("DISCORD_CLIENT_ID");
}

function readBotVersion(): string {
  const fromEnv = optional("BOT_VERSION");
  if (fromEnv) return fromEnv;

  try {
    const pkgPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const caedralApiKey = optional("CAEDRAL_API_KEY");
const instanceId = optional("CAEDRAL_BOT_INSTANCE_ID");
const allowUnregistered = optionalFlag("CAEDRAL_BOT_ALLOW_UNREGISTERED");

const CAEDRAL_PLATFORM_GATEWAY = "https://api.caedral.com";

/** Self-hosted bots always use production gateway; internal/dev may override. */
function resolvePlatformGatewayUrl(): string {
  if (caedralApiKey && !instanceId) {
    return CAEDRAL_PLATFORM_GATEWAY;
  }

  const override = optional("GATEWAY_URL").replace(/\/$/, "");
  if (override) return override;
  if (allowUnregistered) return "http://127.0.0.1:5001";
  return CAEDRAL_PLATFORM_GATEWAY;
}

/** Internal Caedral bots take precedence; self-hosted bots use CAEDRAL_API_KEY. */
function instanceCredential(): string {
  if (instanceId) return instanceId;
  if (caedralApiKey) return caedralApiKey;
  return "";
}

function assertCaedralRegistration(): void {
  if (instanceCredential()) return;

  if (allowUnregistered) {
    console.warn(
      "[env] CAEDRAL_BOT_ALLOW_UNREGISTERED=1 — running without platform registration (local dev only)",
    );
    return;
  }

  throw new Error(
    "CAEDRAL_API_KEY (self-hosted) or CAEDRAL_BOT_INSTANCE_ID (internal) is required. " +
      "Create an API key at https://caedral.com/dashboard/api-keys or set CAEDRAL_BOT_ALLOW_UNREGISTERED=1 for local dev.",
  );
}

assertCaedralRegistration();

export const env = {
  token: required("DISCORD_BOT_TOKEN"),
  /** Customer API key for self-hosted bots (cd_live_…). */
  caedralApiKey,
  /** Internal Caedral bot instance UUID — unlimited gateway access when provisioned. */
  instanceId,
  systemPrompt: optional("CAEDRAL_BOT_SYSTEM_PROMPT"),
  clientId: botApplicationId(),
  guildId: required("DISCORD_GUILD_ID"),
  ownerDiscordId: required("OWNER_DISCORD_ID"),
  supportRoleId: optional("DISCORD_SUPPORT_ROLE_ID"),
  announcementsChannelId: required("DISCORD_ANNOUNCEMENTS_CHANNEL_ID"),
  updatesChannelId: required("DISCORD_UPDATES_CHANNEL_ID"),
  supportChannelId: required("DISCORD_SUPPORT_CHANNEL_ID"),
  ticketCategoryId: required("DISCORD_TICKET_CATEGORY_ID"),
  ticketLogChannelId: required("DISCORD_TICKET_LOG_CHANNEL_ID"),
  /** Bot-local Postgres (tickets only). Not the Caedral platform database. */
  databaseUrl: required("DATABASE_URL"),
  siteUrl: optional("NEXT_PUBLIC_SITE_URL", "https://caedral.com"),
  /** Caedral API gateway — hardcoded for self-hosted; override only for internal/dev. */
  gatewayUrl: resolvePlatformGatewayUrl(),
  changelogApiUrl: optional(
    "CHANGELOG_API_URL",
    `${optional("NEXT_PUBLIC_SITE_URL", "https://caedral.com")}/api/changelog`,
  ),
  changelogApiSecret: optional("CHANGELOG_API_SECRET"),
  brandIconUrl: optional(
    "DISCORD_BRAND_ICON_URL",
    "", // empty → bundled PNG via attachment:// in sendBranded
  ),
  internalHttpPort: Number(optional("DISCORD_BOT_INTERNAL_PORT", "5010")),
  internalHttpHost: optional("DISCORD_BOT_INTERNAL_HOST", "127.0.0.1"),
  internalSecret: optional("DISCORD_BOT_INTERNAL_SECRET"),
  botVersion: readBotVersion(),
  hostname: optional("BOT_HOSTNAME", hostname()),
  allowUnregistered,
  /** Caedral chat model for ticket AI (POST /v1/chat/completions). */
  assistantModel: optional("CAEDRAL_ASSISTANT_MODEL", "caedral-base"),
  /** Caedral platform user table lookup — only when sharing the platform DB. */
  platformUserLookup:
    optionalFlag("CAEDRAL_PLATFORM_USER_LOOKUP") || Boolean(instanceId),
  isRegistered: () => instanceCredential().length > 0,
  instanceCredential,
  authMode: (): "api-key" | "instance-id" | "unregistered" => {
    if (instanceId) return "instance-id";
    if (caedralApiKey) return "api-key";
    return "unregistered";
  },
};
