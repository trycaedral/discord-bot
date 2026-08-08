import { hostname } from "node:os";
import type { Client } from "discord.js";
import { env } from "../config/env.js";
import {
  deliverPendingChangelogs,
  type PendingChangelogBroadcast,
} from "./changelog-broadcast.js";

const HEARTBEAT_INTERVAL_MS = 60_000;
const AUTH_CACHE_TTL_MS = 3 * 60_000;

let instanceAuthorized = false;
let lastAuthCheck = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let cachedSystemPrompt: string | null = null;
let cachedAssistantModel: string | null = null;

function getApiUrl(path: string): string {
  return `${env.gatewayUrl.replace(/\/$/, "")}${path}`;
}

function instanceAuthHeaders(): Record<string, string> {
  const credential = env.instanceCredential();
  if (!credential) {
    throw new Error("No Caedral bot credential configured");
  }

  return {
    Authorization: `Bearer ${credential}`,
    "Content-Type": "application/json",
  };
}

function heartbeatPayload(client: Client): Record<string, unknown> {
  const guilds = client.guilds.cache.map((g) => ({ id: g.id, name: g.name }));
  const uptimeSeconds = Math.floor(process.uptime());

  return {
    guilds,
    uptimeSeconds,
    status: "up",
    version: env.botVersion,
    hostname: env.hostname || hostname(),
    authMode: env.authMode(),
  };
}

export function getInstanceSystemPrompt(): string | null {
  return cachedSystemPrompt;
}

/** Dashboard-selected model; null → use CAEDRAL_ASSISTANT_MODEL from env. */
export function getInstanceAssistantModel(): string | null {
  return cachedAssistantModel;
}

export function getEffectiveAssistantModel(): string {
  return cachedAssistantModel ?? env.assistantModel;
}

export async function validateBotInstance(): Promise<boolean> {
  if (!env.isRegistered()) {
    if (env.allowUnregistered) {
      instanceAuthorized = true;
      return true;
    }
    return false;
  }

  try {
    const res = await fetch(getApiUrl("/v1/bot-instances/validate"), {
      method: "POST",
      headers: instanceAuthHeaders(),
      body: "{}",
    });

    if (res.ok) {
      const data = (await res.json()) as {
        valid: boolean;
        instanceName: string;
        systemPrompt: string | null;
        assistantModel?: string | null;
        instanceId?: string;
      };
      instanceAuthorized = true;
      lastAuthCheck = Date.now();
      cachedSystemPrompt = data.systemPrompt;
      cachedAssistantModel = data.assistantModel ?? null;
      console.log(
        `[instance-auth] Validated (${env.authMode()}): ${data.instanceName}`,
      );
      return true;
    }

    const err = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    console.error(
      `[instance-auth] Validation failed (${res.status}): ${err?.error?.message ?? "unknown"}`,
    );
    instanceAuthorized = false;
    return false;
  } catch (error) {
    console.error(
      "[instance-auth] Cannot reach API:",
      error instanceof Error ? error.message : error,
    );
    instanceAuthorized = false;
    return false;
  }
}

export async function refreshAuthStatus(): Promise<boolean> {
  if (!env.isRegistered()) return env.allowUnregistered;

  if (Date.now() - lastAuthCheck < AUTH_CACHE_TTL_MS) {
    return instanceAuthorized;
  }

  return validateBotInstance();
}

export function isInstanceAuthorized(): boolean {
  if (!env.isRegistered()) return env.allowUnregistered;
  return instanceAuthorized;
}

async function sendHeartbeat(client: Client): Promise<void> {
  if (!env.isRegistered()) return;

  try {
    const res = await fetch(getApiUrl("/v1/bot-instances/heartbeat"), {
      method: "POST",
      headers: instanceAuthHeaders(),
      body: JSON.stringify(heartbeatPayload(client)),
    });

    if (res.status === 403) {
      console.error(
        "[instance-auth] Heartbeat rejected — instance disabled. Shutting down command processing.",
      );
      instanceAuthorized = false;
      return;
    }

    if (!res.ok) {
      console.warn(`[instance-auth] Heartbeat failed: ${res.status}`);
      return;
    }

    const data = (await res.json()) as {
      status: string;
      systemPrompt?: string | null;
      assistantModel?: string | null;
      pendingChangelogs?: PendingChangelogBroadcast[];
    };
    if (data.status !== "active") {
      console.error(
        `[instance-auth] Instance status changed to "${data.status}" — disabling.`,
      );
      instanceAuthorized = false;
    } else {
      instanceAuthorized = true;
      lastAuthCheck = Date.now();
      if (data.systemPrompt !== undefined) {
        cachedSystemPrompt = data.systemPrompt;
      }
      if (data.assistantModel !== undefined) {
        cachedAssistantModel = data.assistantModel;
      }
      if (data.pendingChangelogs?.length) {
        void deliverPendingChangelogs(client, data.pendingChangelogs);
      }
    }
  } catch (error) {
    console.warn(
      "[instance-auth] Heartbeat error:",
      error instanceof Error ? error.message : error,
    );
  }
}

export function startHeartbeatLoop(client: Client): void {
  if (!env.isRegistered()) return;

  sendHeartbeat(client);

  heartbeatTimer = setInterval(() => {
    sendHeartbeat(client);
  }, HEARTBEAT_INTERVAL_MS);

  if (typeof heartbeatTimer.unref === "function") {
    heartbeatTimer.unref();
  }

  console.log(
    `[instance-auth] Heartbeat loop started (every ${HEARTBEAT_INTERVAL_MS / 1000}s, ${env.authMode()})`,
  );
}

export function stopHeartbeatLoop(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
