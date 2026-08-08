import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import {
  BRAND_GRAPHITE,
  BRAND_SAND,
  buildBrandedMessage,
  editReplyBranded,
  linkButton,
  replyBranded,
  sendBranded,
} from "../branding/ui.js";
import { env } from "../config/env.js";
import { lookupUserByEmail } from "../db/client.js";
import { publishChangelogToSite } from "../services/changelog.js";
import { postChangelogToDiscord } from "../services/changelog-discord.js";
import {
  formatOwnerStatus,
  formatPublicStatus,
  getFullStatus,
} from "../services/status.js";
import { requireOwner } from "../utils/permissions.js";
import { buildTicketPanelComponents } from "../tickets/service.js";

const API_PRICING = [
  { tier: "Base", rate: "Free ($0.01 min balance)" },
  { tier: "Titan", rate: "$2 in / $0.20 cached / $6 out per 1M tokens" },
  { tier: "Olympus", rate: "$5 in / $0.50 cached / $15 out per 1M tokens" },
  { tier: "Primordial", rate: "$10 in / $1 cached / $30 out per 1M tokens" },
];

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post a formatted announcement (owner only)")
    .addStringOption((o) =>
      o.setName("title").setDescription("Announcement title").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("description")
        .setDescription("Announcement body")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("link").setDescription("Optional link URL").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("changelog-publish")
    .setDescription("Publish a changelog entry (owner only)")
    .addStringOption((o) =>
      o.setName("title").setDescription("Changelog title").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("body").setDescription("Changelog body").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("version").setDescription("Version tag").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Live service status (owner only, includes internals)"),
  new SlashCommandBuilder()
    .setName("user-lookup")
    .setDescription("Look up a user account by email (owner only)")
    .addStringOption((o) =>
      o.setName("email").setDescription("User email").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("setup-tickets")
    .setDescription("Post the support ticket panel (owner only)"),
  new SlashCommandBuilder()
    .setName("docs")
    .setDescription("Link to Caedral documentation"),
  new SlashCommandBuilder()
    .setName("pricing")
    .setDescription("Caedral API pricing summary"),
  new SlashCommandBuilder()
    .setName("status-public")
    .setDescription("Public service status"),
].map((c) => c.toJSON());

export async function handleSlashCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  switch (interaction.commandName) {
    case "announce":
      await handleAnnounce(interaction);
      break;
    case "changelog-publish":
      await handleChangelogPublish(interaction, client);
      break;
    case "status":
      await handleStatus(interaction, true);
      break;
    case "user-lookup":
      await handleUserLookup(interaction);
      break;
    case "setup-tickets":
      await handleSetupTickets(interaction);
      break;
    case "docs":
      await handleDocs(interaction);
      break;
    case "pricing":
      await handlePricing(interaction);
      break;
    case "status-public":
      await handleStatus(interaction, false);
      break;
    default:
      await interaction.reply({
        content: "Unknown command.",
        flags: MessageFlags.Ephemeral,
      });
  }
}

async function handleAnnounce(interaction: ChatInputCommandInteraction) {
  if (!(await requireOwner(interaction))) return;

  const title = interaction.options.getString("title", true);
  const description = interaction.options.getString("description", true);
  const link = interaction.options.getString("link");

  const container = buildBrandedMessage(
    BRAND_GRAPHITE,
    [`## ${title}`, "", description].join("\n"),
    (c) => {
      if (link) {
        c.addActionRowComponents((row) =>
          row.setComponents(linkButton("Read more", link)),
        );
      }
    },
  );

  const channel = await interaction.client.channels.fetch(
    env.announcementsChannelId,
  );
  if (!channel?.isSendable()) {
    await interaction.reply({
      content: "Announcements channel is not configured correctly.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await sendBranded(channel, container);
  await interaction.reply({
    content: "Announcement posted.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleChangelogPublish(
  interaction: ChatInputCommandInteraction,
  client: Client,
) {
  if (!(await requireOwner(interaction))) return;

  const title = interaction.options.getString("title", true);
  const body = interaction.options.getString("body", true);
  const version = interaction.options.getString("version") ?? undefined;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const apiResult = await publishChangelogToSite({ title, body, version });

  const discordResult = await postChangelogToDiscord(client, {
    title,
    description: body,
    category: version,
  });

  const parts = [];
  if (discordResult.ok) {
    parts.push("Changelog posted to Discord updates channel.");
  } else {
    parts.push(`Discord: ${discordResult.error}`);
  }
  if (apiResult.ok) {
    parts.push("Site changelog API updated.");
  } else {
    parts.push(`Site API: ${apiResult.error}`);
  }

  await interaction.editReply({ content: parts.join("\n") });
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
  ownerView: boolean,
) {
  if (ownerView && !(await requireOwner(interaction))) return;

  await interaction.deferReply({
    flags: ownerView ? MessageFlags.Ephemeral : undefined,
  });

  const snapshot = await getFullStatus();
  const content = ownerView
    ? formatOwnerStatus(snapshot)
    : formatPublicStatus(snapshot);

  const accent = ownerView ? BRAND_GRAPHITE : BRAND_SAND;
  const container = buildBrandedMessage(accent, content);

  await editReplyBranded(interaction, container);
}

async function handleUserLookup(interaction: ChatInputCommandInteraction) {
  if (!(await requireOwner(interaction))) return;

  if (!env.platformUserLookup) {
    await interaction.reply({
      content:
        "User lookup is not available on self-hosted bots. It requires the Caedral platform database.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const email = interaction.options.getString("email", true);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const user = await lookupUserByEmail(email);
  if (!user) {
    await interaction.editReply({ content: `No user found for \`${email}\`.` });
    return;
  }

  // balance_cents column stores milli-cents (1 USD = 100_000).
  const balance = (user.balanceCents / 100_000).toFixed(2);
  const container = buildBrandedMessage(
    BRAND_GRAPHITE,
    [
      "## User lookup",
      "_Owner access · sensitive data_",
      "",
      `**Email** · ${user.email}`,
      `**Name** · ${user.name}`,
      `**User ID** · \`${user.id}\``,
      `**Account status** · ${user.accountStatus}`,
      `**Email verified** · ${user.emailVerified ? "Yes" : "No"}`,
      `**Admin** · ${user.isAdmin ? "Yes" : "No"}`,
      `**Balance** · $${balance}`,
      `**Created** · ${user.createdAt.toISOString()}`,
    ].join("\n"),
  );

  await editReplyBranded(interaction, container);
}

async function handleSetupTickets(interaction: ChatInputCommandInteraction) {
  if (!(await requireOwner(interaction))) return;

  const channel = await interaction.client.channels.fetch(
    env.supportChannelId,
  );
  if (!channel?.isSendable()) {
    await interaction.reply({
      content: "Support channel is not configured correctly.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const panel = buildTicketPanelComponents();
  await sendBranded(channel, panel);
  await interaction.reply({
    content: "Ticket panel posted in the support channel.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleDocs(interaction: ChatInputCommandInteraction) {
  const docsUrl = `${env.siteUrl.replace(/\/$/, "")}/docs`;
  const container = buildBrandedMessage(
    BRAND_SAND,
    [
      "## Documentation",
      "",
      "API reference, SDKs in 6 languages, and n8n integration guides.",
    ].join("\n"),
    (c) =>
      c.addActionRowComponents((row) =>
        row.setComponents(linkButton("Open documentation", docsUrl)),
      ),
  );

  await replyBranded(interaction, container);
}

async function handlePricing(interaction: ChatInputCommandInteraction) {
  const pricingUrl = `${env.siteUrl.replace(/\/$/, "")}/pricing`;
  const lines = API_PRICING.map(
    (p) => `**${p.tier}** · ${p.rate}`,
  ).join("\n\n");

  const container = buildBrandedMessage(
    BRAND_SAND,
    [
      "## API Pricing",
      "",
      "Prepaid balance only — no subscriptions.",
      "",
      lines,
    ].join("\n"),
    (c) =>
      c.addActionRowComponents((row) =>
        row.setComponents(linkButton("View full pricing", pricingUrl)),
      ),
  );

  await replyBranded(interaction, container);
}
