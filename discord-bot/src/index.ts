import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { env } from "./config/env.js";
import { handleSlashCommand } from "./commands/index.js";
import { runMigrations } from "./db/migrate.js";
import { ensureKnowledgeBase } from "./knowledge-setup.js";
import { registerSlashCommands } from "./register-commands.js";
import { startInternalServer } from "./server/internal.js";
import {
  validateBotInstance,
  startHeartbeatLoop,
  isInstanceAuthorized,
  refreshAuthStatus,
} from "./services/instance-auth.js";
import {
  TICKET_CATEGORY_SELECT,
  TICKET_CLOSE_BUTTON,
  TICKET_OPEN_BUTTON,
  type TicketCategoryKey,
} from "./tickets/constants.js";
import {
  closeTicket,
  createTicketChannel,
  handleOpenTicketButton,
  userCanCloseTicket,
} from "./tickets/service.js";
import { handleTicketAssistantMessage } from "./services/ticket-assistant.js";
import { brandAttachment } from "./branding/ui.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Caedral Discord bot logged in as ${c.user.tag}`);
  if (!brandAttachment()) {
    console.warn(
      "[discord/branding] No bundled brand icon found and DISCORD_BRAND_ICON_URL is unset or SVG — " +
        "branded messages will use a link-button header instead of the Caedral symbol thumbnail.",
    );
  }
  startInternalServer(client);
  startHeartbeatLoop(client);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!client.user) return;
    if (!isInstanceAuthorized()) return;

    const channelLabel =
      "name" in message.channel ? `#${message.channel.name}` : message.channel.id;
    console.log(
      `[ticket-flow] MessageCreate: author=${message.author.id} bot=${message.author.bot} guild=${message.guild?.id ?? "none"} channel=${channelLabel} contentLen=${message.content?.length ?? 0} partial=${message.partial}`,
    );

    await handleTicketAssistantMessage(message);
  } catch (err) {
    console.error("[ticket-flow] Unhandled ticket assistant error:", err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!isInstanceAuthorized()) {
      await refreshAuthStatus();
      if (!isInstanceAuthorized()) {
        if (interaction.isRepliable()) {
          await interaction.reply({
            content: "⚠️ This bot instance is currently disabled by Caedral. Contact the administrator.",
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }
    }

    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction, client);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    }
  } catch (err) {
    console.error("Interaction error:", err);
    const message = "Something went wrong processing that interaction.";
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: message,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: message,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }
});

async function handleButton(interaction: ButtonInteraction) {
  if (interaction.customId === TICKET_OPEN_BUTTON) {
    const payload = await handleOpenTicketButton();
    await interaction.reply(payload);
    return;
  }

  if (interaction.customId === TICKET_CLOSE_BUTTON) {
    if (!interaction.channel?.isTextBased() || interaction.channel.isDMBased()) {
      await interaction.reply({
        content: "This button can only be used inside a ticket channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = interaction.member;
    const roleIds =
      member && "roles" in member && "cache" in member.roles
        ? [...member.roles.cache.keys()]
        : [];

    if (!userCanCloseTicket(interaction.user.id, roleIds)) {
      await interaction.reply({
        content: "You don't have permission to close this ticket.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ticketChannel = interaction.channel;
    if (!ticketChannel?.isTextBased() || ticketChannel.isDMBased()) {
      await interaction.editReply({
        content: "This button can only be used inside a ticket channel.",
      });
      return;
    }
    await closeTicket(
      interaction.client,
      ticketChannel,
      interaction.user.tag,
    );
    await interaction.editReply({ content: "Ticket closed." });
    return;
  }
}

async function handleSelectMenu(interaction: StringSelectMenuInteraction) {
  if (interaction.customId !== TICKET_CATEGORY_SELECT) return;

  const category = interaction.values[0] as TicketCategoryKey;
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({
      content: "Tickets can only be opened inside a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = interaction.member;
  if (!("permissions" in member)) {
    await interaction.reply({
      content: "Could not resolve your member profile.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guildMember = await interaction.guild.members.fetch(interaction.user.id);
  const channel = await createTicketChannel(
    interaction.guild,
    guildMember,
    category,
  );

  await interaction.editReply({
    content: `Ticket created: ${channel}`,
  });
}

async function main() {
  await runMigrations();

  const authorized = await validateBotInstance();
  if (!authorized) {
    console.error(
      "[FATAL] Caedral registration failed (invalid API key / instance ID, or instance disabled). Cannot start.",
    );
    process.exit(1);
  }

  await ensureKnowledgeBase();

  await registerSlashCommands();
  await client.login(env.token);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
