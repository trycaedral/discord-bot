/**
 * Live Discord E2E: owner-as-opener follow-ups using an existing or new ticket channel.
 * Run: cd discord-bot && npx tsx scripts/live-ticket-flow-test.ts
 */
import "../src/config/env.js";
import {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  ChannelType,
  type Message,
  type TextChannel,
} from "discord.js";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { env } from "../src/config/env.js";
import { createTicketRecord } from "../src/db/client.js";
import { handleTicketAssistantMessage } from "../src/services/ticket-assistant.js";

const FLOW = "[ticket-flow/live-test]";
const sql = postgres(env.databaseUrl, { max: 2 });

function buildMockMessage(
  channel: TextChannel,
  authorId: string,
  content: string,
): Message {
  return {
    author: { id: authorId, bot: false },
    guild: channel.guild,
    channel,
    content,
    partial: false,
    cleanContent: content,
    fetch: async function fetchSelf() {
      return this as Message;
    },
  } as unknown as Message;
}

async function main() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  await new Promise<void>((resolve, reject) => {
    client.once("ready", () => resolve());
    client.once("error", reject);
    void client.login(env.token);
  });

  console.log(`${FLOW} Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(env.guildId);
  await guild.members.fetch(env.ownerDiscordId);

  const channelName = `ticket-live-test-${Date.now().toString(36)}`;
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: env.ticketCategoryId,
    topic: "Automated live ticket flow test — safe to delete",
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: env.ownerDiscordId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: client.user!.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ],
  });

  const textChannel = channel as TextChannel;
  const ticketId = randomUUID();

  await createTicketRecord({
    id: ticketId,
    channelId: textChannel.id,
    openerDiscordId: env.ownerDiscordId,
    category: "General Question",
  });

  console.log(
    `${FLOW} Created #${channelName} (${textChannel.id}) ticket=${ticketId} opener=${env.ownerDiscordId}`,
  );

  const userMessages = [
    "Live test 1: what is Caedral?",
    "Live test 2: how does billing work?",
    "Live test 3: thanks for the help!",
  ];

  for (let i = 0; i < userMessages.length; i++) {
    const content = userMessages[i]!;
    console.log(`\n${FLOW} === User message ${i + 1}: "${content}" ===\n`);

    await handleTicketAssistantMessage(
      buildMockMessage(textChannel, env.ownerDiscordId, content),
    );

    await new Promise((r) => setTimeout(r, 2500));

    const recent = await textChannel.messages.fetch({ limit: 10 });
    const botReplies = [...recent.values()].filter(
      (m) => m.author.id === client.user!.id,
    );
    console.log(
      `${FLOW} Bot messages in channel after step ${i + 1}: ${botReplies.size}`,
    );
  }

  const allMessages = await textChannel.messages.fetch({ limit: 20 });
  const conversation = [...allMessages.values()]
    .reverse()
    .map((m) => {
      const who =
        m.author.id === client.user!.id
          ? "BOT"
          : m.author.id === env.ownerDiscordId
            ? "USER (owner)"
            : m.author.username;
      const text = m.content || "[branded container message]";
      return `${who}: ${text.slice(0, 800)}`;
    })
    .join("\n---\n");

  console.log(`\n${FLOW} === Conversation transcript ===\n`);
  console.log(conversation);

  await sql`DELETE FROM discord_tickets WHERE id = ${ticketId}`;
  console.log(`\n${FLOW} Cleaning up test channel #${channelName}`);
  await textChannel.delete("Live ticket flow test complete");

  await sql.end({ timeout: 5 });
  await client.destroy();
  console.log(`\n${FLOW} LIVE TEST PASSED`);
}

main().catch(async (error) => {
  console.error(`${FLOW} FAILED:`, error);
  await sql.end({ timeout: 2 }).catch(() => {});
  process.exit(1);
});
