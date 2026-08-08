import {
  ChannelType,
  Client,
  Guild,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
  type GuildTextBasedChannel,
} from "discord.js";
import { randomUUID } from "node:crypto";
import {
  BRAND_GRAPHITE,
  BRAND_SAND,
  buildBrandedMessage,
  brandedMessagePayload,
  dangerButton,
  secondaryButton,
  sendBranded,
  textBlock,
  brandedContainer,
  brandHeaderSection,
  separator,
} from "../branding/ui.js";
import { env } from "../config/env.js";
import { closeTicketRecord, createTicketRecord, getTicketByChannel } from "../db/client.js";
import { sendInitialTicketAssistantReply } from "../services/ticket-assistant.js";
import { canManageTickets } from "../utils/permissions.js";
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_SELECT,
  TICKET_CLOSE_BUTTON,
  TICKET_OPEN_BUTTON,
  type TicketCategoryKey,
} from "./constants.js";

const TICKET_CATEGORY_DESCRIPTIONS: Record<TicketCategoryKey, string> = {
  bug_report: "Report an API error, outage, or unexpected behavior.",
  billing: "Questions about prepaid balance, top-ups, invoices, or account balance.",
  general: "Product questions, onboarding, or general guidance.",
  feature: "Suggest a capability or improvement.",
};

export function buildTicketPanelComponents() {
  return buildBrandedMessage(
    BRAND_SAND,
    [
      "## Support",
      "",
      "Open a private ticket for billing, bugs, feature requests, or general questions.",
      "A Caedral assistant responds first; a team member follows up when needed.",
    ].join("\n"),
    (container) =>
      container.addActionRowComponents((row) =>
        row.setComponents(secondaryButton(TICKET_OPEN_BUTTON, "Open ticket")),
      ),
  );
}

function buildCategorySelectMenu() {
  return new StringSelectMenuBuilder()
    .setCustomId(TICKET_CATEGORY_SELECT)
    .setPlaceholder("Choose a topic")
    .addOptions(
      Object.entries(TICKET_CATEGORIES).map(([value, label]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(label)
          .setValue(value)
          .setDescription(TICKET_CATEGORY_DESCRIPTIONS[value as TicketCategoryKey]),
      ),
    );
}

export function buildCategorySelectContainer() {
  return brandedContainer(BRAND_SAND)
    .addSectionComponents(brandHeaderSection())
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      textBlock(
        [
          "## Open a ticket",
          "",
          "Select a category below. A private channel will be created for you.",
        ].join("\n"),
      ),
    )
    .addActionRowComponents((row) =>
      row.setComponents(buildCategorySelectMenu()),
    );
}

export async function handleOpenTicketButton() {
  return {
    ...brandedMessagePayload(
      buildCategorySelectContainer(),
      MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    ),
  };
}

function ticketChannelName(category: TicketCategoryKey, userId: string) {
  const slug = category.replace("_", "-");
  return `ticket-${slug}-${userId.slice(-4)}`.slice(0, 100);
}

export async function createTicketChannel(
  guild: Guild,
  member: GuildMember,
  categoryKey: TicketCategoryKey,
): Promise<TextChannel> {
  const categoryLabel = TICKET_CATEGORIES[categoryKey];
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: guild.members.me!.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    },
  ];

  if (env.supportRoleId) {
    overwrites.push({
      id: env.supportRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  if (env.ownerDiscordId !== member.id) {
    overwrites.push({
      id: env.ownerDiscordId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: ticketChannelName(categoryKey, member.id),
    type: ChannelType.GuildText,
    parent: env.ticketCategoryId,
    topic: `Caedral support — ${categoryLabel} — ${member.user.tag}`,
    permissionOverwrites: overwrites,
  });

  const ticketId = randomUUID();
  await createTicketRecord({
    id: ticketId,
    channelId: channel.id,
    openerDiscordId: member.id,
    category: categoryLabel,
  });

  const welcome = buildBrandedMessage(
    BRAND_SAND,
    [
      `## ${categoryLabel}`,
      "",
      `<@${member.id}>, your ticket is open.`,
      "",
      "An automated Caedral assistant reply follows shortly. Describe your issue in detail below — a team member will step in if needed.",
    ].join("\n"),
    (container) =>
      container.addActionRowComponents((row) =>
        row.setComponents(dangerButton(TICKET_CLOSE_BUTTON, "Close ticket")),
      ),
  );

  await sendBranded(channel, welcome);

  await sendInitialTicketAssistantReply(
    channel,
    categoryKey,
    member.displayName || member.user.username,
  );

  return channel;
}

async function buildTranscript(channel: GuildTextBasedChannel): Promise<string> {
  const lines: string[] = [
    `# Transcript — #${channel.name}`,
    `Channel ID: ${channel.id}`,
    `Created: ${channel.createdAt?.toISOString() ?? "unknown"}`,
    "",
  ];

  let lastId: string | undefined;
  for (;;) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(lastId ? { before: lastId } : {}),
    });
    if (batch.size === 0) break;
    const sorted = [...batch.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    );
    for (const msg of sorted) {
      const attachments =
        msg.attachments.size > 0
          ? ` [attachments: ${[...msg.attachments.values()].map((a) => a.url).join(", ")}]`
          : "";
      lines.push(
        `[${msg.createdAt.toISOString()}] ${msg.author.tag}: ${msg.content || "(components only)"}${attachments}`,
      );
    }
    lastId = batch.last()?.id;
    if (batch.size < 100) break;
  }

  return lines.join("\n");
}

export async function closeTicket(
  client: Client,
  channel: GuildTextBasedChannel,
  closedByTag: string,
): Promise<void> {
  const ticket = await getTicketByChannel(channel.id);
  if (!ticket || ticket.status === "closed") {
    throw new Error("Ticket not found or already closed.");
  }

  const transcript = await buildTranscript(channel);
  const fullTranscript = `${transcript}\n\n---\nClosed by ${closedByTag} at ${new Date().toISOString()}`;

  await closeTicketRecord(ticket.id, fullTranscript);

  const logChannel = await client.channels.fetch(env.ticketLogChannelId);
  if (logChannel?.isSendable()) {
    const logContainer = buildBrandedMessage(
      BRAND_GRAPHITE,
      [
        "## Ticket closed",
        "",
        `**Category** · ${ticket.category}`,
        `**Opened by** · <@${ticket.openerDiscordId}>`,
        `**Channel** · \`${channel.name}\``,
        `**Closed by** · ${closedByTag}`,
      ].join("\n"),
    )
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(
        textBlock(
          `\`\`\`\n${fullTranscript.slice(0, 3500)}${fullTranscript.length > 3500 ? "\n…(truncated)" : ""}\n\`\`\``,
        ),
      );

    await sendBranded(logChannel, logContainer);
  }

  await channel.delete(`Ticket closed by ${closedByTag}`);
}

export function userCanCloseTicket(
  userId: string,
  memberRoleIds: string[],
): boolean {
  return canManageTickets(userId, memberRoleIds);
}
