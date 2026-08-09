import {
  ChannelType,
  Client,
  ComponentType,
  Guild,
  GuildMember,
  Message,
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
  linkButton,
  secondaryButton,
  sendBranded,
  textBlock,
  brandedContainer,
  brandHeaderSection,
  separator,
} from "../branding/ui.js";
import { env } from "../config/env.js";
import {
  closeTicketRecord,
  createTicketRecord,
  getTicketByChannel,
  type TranscriptMessage,
} from "../db/client.js";
import { sendInitialTicketAssistantReply } from "../services/ticket-assistant.js";
import { canManageTickets } from "../utils/permissions.js";
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_SELECT,
  TICKET_CLOSE_BUTTON,
  TICKET_OPEN_BUTTON,
  type TicketCategoryKey,
} from "./constants.js";
import { submitTicketTranscript } from "../services/ticket-transcripts.js";

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

/** Fetches every message in the channel, oldest first, paginating past Discord's 100-per-call limit. */
async function fetchAllMessages(
  channel: GuildTextBasedChannel,
): Promise<Message[]> {
  const all: Message[] = [];

  let lastId: string | undefined;
  for (;;) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(lastId ? { before: lastId } : {}),
    });
    if (batch.size === 0) break;
    all.push(...batch.values());
    lastId = batch.last()?.id;
    if (batch.size < 100) break;
  }

  return all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

type RawComponent = {
  type: number;
  content?: string;
  components?: RawComponent[];
  media?: { url: string };
  items?: { media: { url: string } }[];
};

/**
 * Extracts plain text and media URLs from a Components V2 message, since
 * `msg.content` comes back empty when a message is built with components.
 */
function extractFromComponents(
  components: Message["components"],
): { text: string; mediaUrls: string[] } {
  const textParts: string[] = [];
  const mediaUrls: string[] = [];

  function walk(raw: RawComponent) {
    switch (raw.type) {
      case ComponentType.TextDisplay:
        if (raw.content) textParts.push(raw.content);
        break;
      case ComponentType.Thumbnail:
        if (raw.media?.url) mediaUrls.push(raw.media.url);
        break;
      case ComponentType.MediaGallery:
        for (const item of raw.items ?? []) {
          if (item.media?.url) mediaUrls.push(item.media.url);
        }
        break;
      default:
        // Section, Container, ActionRow, etc. — walk their children.
        for (const child of raw.components ?? []) {
          walk(child);
        }
    }
  }

  for (const component of components) {
    walk(component.toJSON() as RawComponent);
  }

  return { text: textParts.join("\n"), mediaUrls };
}

async function buildTranscript(
  channel: GuildTextBasedChannel,
): Promise<{ text: string; entries: TranscriptMessage[] }> {
  const lines: string[] = [
    `# Transcript — #${channel.name}`,
    `Channel ID: ${channel.id}`,
    `Created: ${channel.createdAt?.toISOString() ?? "unknown"}`,
    "",
  ];

  const messages = await fetchAllMessages(channel);
  const entries: TranscriptMessage[] = [];

  for (const msg of messages) {
    const attachmentUrls = [...msg.attachments.values()].map((a) => a.url);

    // Components V2 messages have empty `content` — the real text lives
    // inside `msg.components`, so we extract it as a fallback.
    let content = msg.content;
    if (!content && msg.components.length > 0) {
      const extracted = extractFromComponents(msg.components);
      content = extracted.text;
      attachmentUrls.push(...extracted.mediaUrls);
    }

    const attachmentsSuffix =
      attachmentUrls.length > 0
        ? ` [attachments: ${attachmentUrls.join(", ")}]`
        : "";

    lines.push(
      `[${msg.createdAt.toISOString()}] ${msg.author.tag}: ${content || "(no content)"}${attachmentsSuffix}`,
    );

    entries.push({
      id: msg.id,
      authorId: msg.author.id,
      authorTag: msg.author.tag,
      authorDisplayName: msg.member?.displayName ?? msg.author.displayName ?? msg.author.username,
      authorAvatarUrl: msg.author.displayAvatarURL({ size: 64 }),
      content,
      createdAt: msg.createdAt.toISOString(),
      attachments: attachmentUrls,
      isBot: msg.author.bot,
    });
  }

  return { text: lines.join("\n"), entries };
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

  const { text: transcript, entries } = await buildTranscript(channel);
  const fullTranscript = `${transcript}\n\n---\nClosed by ${closedByTag} at ${new Date().toISOString()}`;

  await closeTicketRecord(ticket.id, fullTranscript, entries);

    const logUrl = await submitTicketTranscript(ticket.id, entries, {
    category: ticket.category,
    openerDiscordId: ticket.openerDiscordId,
    closedAt: new Date().toISOString(),
  });
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

    if (logUrl) {
      logContainer.addActionRowComponents((row) =>
        row.setComponents(linkButton("View full transcript", logUrl)),
      );
    }

    await sendBranded(logChannel, logContainer);
  }

  if (logUrl) {
    try {
      const opener = await client.users.fetch(ticket.openerDiscordId);
      const dmContainer = buildBrandedMessage(
        BRAND_SAND,
        [
          "## Your ticket was closed",
          "",
          `**Category** · ${ticket.category}`,
          `Here's the full transcript of your conversation.`,
        ].join("\n"),
      ).addActionRowComponents((row) =>
        row.setComponents(linkButton("View transcript", logUrl)),
      );

      await opener.send(brandedMessagePayload(dmContainer));
    } catch (err) {
      console.warn(
        `Could not DM ticket opener ${ticket.openerDiscordId} about closed ticket ${ticket.id}:`,
        err,
      );
    }
  }

  await channel.delete(`Ticket closed by ${closedByTag}`);
}

export function userCanCloseTicket(
  userId: string,
  memberRoleIds: string[],
): boolean {
  return canManageTickets(userId, memberRoleIds);
}
