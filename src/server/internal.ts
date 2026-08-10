import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Client } from "discord.js";
import { env } from "../config/env.js";
import {
  postChangelogToDiscord,
  type ChangelogDiscordPayload,
} from "../services/changelog-discord.js";

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function isAuthorized(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(env.internalSecret) && token === env.internalSecret;
}

export function startInternalServer(client: Client) {
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, {
          status: "ok",
          registered: env.isRegistered(),
        });
        return;
      }

      if (req.method === "POST" && req.url === "/internal/changelog") {
        if (!env.internalSecret) {
          sendJson(res, 503, { error: "Internal changelog API is not configured." });
          return;
        }

        if (!isAuthorized(req)) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }

        const body = (await readJsonBody(req)) as Partial<ChangelogDiscordPayload>;
        if (
          typeof body.title !== "string" ||
          !body.title.trim() ||
          typeof body.description !== "string" ||
          !body.description.trim()
        ) {
          sendJson(res, 400, {
            error: "title and description are required.",
          });
          return;
        }

        const result = await postChangelogToDiscord(client, {
          id: typeof body.id === "string" ? body.id : undefined,
          title: body.title.trim(),
          description: body.description.trim(),
          category:
            typeof body.category === "string" ? body.category : undefined,
          version:
            typeof body.version === "string" ? body.version : undefined,
        });

        if (!result.ok) {
          sendJson(res, 502, { error: result.error ?? "Discord post failed." });
          return;
        }

        sendJson(res, 200, { ok: true });
        return;
      }
      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      console.error("Internal server error:", err);
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : "Internal error",
      });
    }
  });

  server.listen(env.internalHttpPort, env.internalHttpHost, () => {
    console.log(
      `Health/metrics HTTP listening on http://${env.internalHttpHost}:${env.internalHttpPort}/health`,
    );
    if (!env.internalSecret) {
      console.warn(
        "DISCORD_BOT_INTERNAL_SECRET is not set — /internal/changelog disabled.",
      );
    }
  });
}
