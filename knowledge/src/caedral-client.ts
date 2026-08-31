import { Caedral } from "caedral";
import {
  getCaedralBotInstanceId,
  getCaedralInternalApiKey,
  getCaedralInternalApiUrl,
  getNotreMode,
} from "./config.js";

let cachedClient: Caedral | null = null;

export function createCaedralClient(): Caedral {
  const instanceId = getCaedralBotInstanceId();
  const apiKey = instanceId || getCaedralInternalApiKey();
  return new Caedral({
    apiKey,
    baseURL: getCaedralInternalApiUrl(),
  });
}

export function getCaedralClient(): Caedral {
  if (!cachedClient) {
    cachedClient = createCaedralClient();
  }
  return cachedClient;
}

export function notreRequestOptions():
  | { mode: "off" | "auto"; telemetry: false }
  | undefined {
  const mode = getNotreMode();
  if (mode === "off") return undefined;
  return { mode, telemetry: false };
}
