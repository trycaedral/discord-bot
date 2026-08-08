import { REST, Routes } from "discord.js";
import { commandDefinitions } from "./commands/index.js";
import { env } from "./config/env.js";

export type RegisteredCommand = {
  id: string;
  name: string;
};

export type RegisterCommandsResult = {
  scope: "guild" | "global";
  guildId?: string;
  clientId: string;
  commands: RegisteredCommand[];
};

function formatDiscordApiError(err: unknown): string {
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    if (record.rawError !== undefined) {
      return JSON.stringify(record.rawError, null, 2);
    }
    if (record.code !== undefined || record.status !== undefined) {
      return JSON.stringify(
        {
          code: record.code,
          status: record.status,
          message: record.message,
        },
        null,
        2,
      );
    }
  }
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  return String(err);
}

async function resolveApplicationId(rest: REST): Promise<string> {
  const application = (await rest.get(Routes.oauth2CurrentApplication())) as {
    id: string;
    name?: string;
  };

  if (application.id !== env.clientId) {
    console.warn(
      [
        "[discord] DISCORD_CLIENT_ID does not match the bot token application.",
        `  env DISCORD_CLIENT_ID: ${env.clientId}`,
        `  token application id:  ${application.id}${application.name ? ` (${application.name})` : ""}`,
        "Using the token application id for slash command registration.",
        "Keep DISCORD_CLIENT_ID for site OAuth; set DISCORD_BOT_APPLICATION_ID if you prefer an explicit bot app id.",
      ].join("\n"),
    );
  }

  return application.id;
}

/**
 * Register slash commands with Discord.
 *
 * Default: guild commands on DISCORD_GUILD_ID (instant propagation for dev/test).
 * Set DISCORD_COMMANDS_REGISTER_GLOBAL=true to register globally (can take up to ~1 hour).
 */
export async function registerSlashCommands(): Promise<RegisterCommandsResult> {
  const registerGlobally =
    process.env.DISCORD_COMMANDS_REGISTER_GLOBAL === "true";
  const rest = new REST({ version: "10" }).setToken(env.token);
  const scope = registerGlobally ? "global" : "guild";

  console.log(
    `[discord] Registering ${commandDefinitions.length} slash command(s) (${scope})…`,
  );

  if (!registerGlobally) {
    console.log(`[discord] Guild target: ${env.guildId}`);
  }

  try {
    const applicationId = await resolveApplicationId(rest);

    const registered = registerGlobally
      ? await rest.put(Routes.applicationCommands(applicationId), {
          body: commandDefinitions,
        })
      : await rest.put(
          Routes.applicationGuildCommands(applicationId, env.guildId),
          { body: commandDefinitions },
        );

    const commands = (registered as Array<{ id: string; name: string }>).map(
      (command) => ({
        id: command.id,
        name: command.name,
      }),
    );

    const result: RegisterCommandsResult = {
      scope,
      clientId: applicationId,
      ...(registerGlobally ? {} : { guildId: env.guildId }),
      commands,
    };

    console.log(
      "[discord] Slash commands registered successfully:",
      JSON.stringify(result, null, 2),
    );

    return result;
  } catch (err) {
    console.error(
      "[discord] Slash command registration failed:",
      formatDiscordApiError(err),
    );

    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: number }).code === 20012
    ) {
      console.error(
        [
          "[discord] Hint (403 / code 20012): DISCORD_CLIENT_ID likely does not match DISCORD_BOT_TOKEN.",
          "Also ensure the bot was invited with scope applications.commands:",
          `  https://discord.com/api/oauth2/authorize?client_id=${env.clientId}&permissions=117776&scope=bot%20applications.commands`,
          "Use the bot application's client id in the URL (Developer Portal → your bot app → Application ID),",
          "not necessarily DISCORD_CLIENT_ID if that is your site OAuth app.",
        ].join("\n"),
      );
    }

    throw err;
  }
}
