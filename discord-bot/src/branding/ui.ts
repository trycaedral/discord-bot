import {
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type SendableChannels,
} from "discord.js";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

const BRAND_ICON_FILENAME = "caedral-symbol.png";

function bundledBrandIconPath(): string {
  const fromModule = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../assets",
    BRAND_ICON_FILENAME,
  );
  if (existsSync(fromModule)) {
    return fromModule;
  }
  const fromCwd = join(process.cwd(), "assets", BRAND_ICON_FILENAME);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }
  return fromModule;
}

/**
 * Discord doesn't render SVG URLs, so a non-SVG `DISCORD_BRAND_ICON_URL` is used
 * as-is. Otherwise, fall back to the bundled PNG via `attachment://` — but only
 * when that file actually exists. Returns null when no usable raster image is
 * available, so callers must NOT set a thumbnail accessory in that case (Discord
 * rejects Components V2 payloads referencing a non-existent attachment).
 */
export function brandThumbnailUrl(): string | null {
  const url = env.brandIconUrl.trim();
  if (url && !url.toLowerCase().endsWith(".svg")) {
    return url;
  }
  return brandAttachment() ? `attachment://${BRAND_ICON_FILENAME}` : null;
}

export function brandAttachment(): AttachmentBuilder | null {
  const path = bundledBrandIconPath();
  if (!existsSync(path)) {
    return null;
  }
  return new AttachmentBuilder(path, { name: BRAND_ICON_FILENAME });
}

/** Sand #D4C5A9 — support, docs, pricing, tickets */
export const BRAND_SAND = 0xd4c5a9;
/** Graphite #1A1A1A — announcements, status, admin */
export const BRAND_GRAPHITE = 0x1a1a1a;

export const BRAND_TAGLINE = "Intelligence built at civilization scale";

export const V2_FLAGS = MessageFlags.IsComponentsV2;

export function brandedContainer(accent: number = BRAND_SAND) {
  return new ContainerBuilder().setAccentColor(accent);
}

export function textBlock(content: string) {
  return new TextDisplayBuilder().setContent(content);
}

/**
 * Caedral symbol + name — use at the top of every public-facing message.
 * Discord requires every Section to have an accessory (thumbnail or button);
 * fall back to a link button when no usable brand image is configured, so
 * this never emits an invalid components payload.
 */
export function brandHeaderSection() {
  const section = new SectionBuilder().addTextDisplayComponents(
    textBlock(`**Caedral**\n${BRAND_TAGLINE}`),
  );
  const thumbnailUrl = brandThumbnailUrl();
  if (thumbnailUrl) {
    return section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));
  }
  return section.setButtonAccessory(linkButton("caedral.com", env.siteUrl));
}

export function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

/** Standard layout: brand header → divider → body → optional components. */
export function buildBrandedMessage(
  accent: number,
  body: string,
  configure?: (container: ContainerBuilder) => void,
) {
  const container = brandedContainer(accent)
    .addSectionComponents(brandHeaderSection())
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(textBlock(body));

  configure?.(container);
  return container;
}

export function linkButton(label: string, url: string) {
  return new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url);
}

export function secondaryButton(customId: string, label: string) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary);
}

export function dangerButton(customId: string, label: string) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Danger);
}

export type BrandedMessagePayload = {
  components: ContainerBuilder[];
  flags: number;
  files?: AttachmentBuilder[];
};

/** Payload for any branded Components V2 message — always attaches the symbol when available. */
export function brandedMessagePayload(
  container: ContainerBuilder,
  flags: number = V2_FLAGS,
): BrandedMessagePayload {
  const attachment = brandAttachment();
  return {
    components: [container],
    flags,
    ...(attachment ? { files: [attachment] } : {}),
  };
}

export async function replyBranded(
  interaction: {
    reply: (options: BrandedMessagePayload) => Promise<unknown>;
  },
  container: ContainerBuilder,
  extraFlags?: number,
): Promise<void> {
  await interaction.reply(brandedMessagePayload(container, extraFlags ?? V2_FLAGS));
}

export async function editReplyBranded(
  interaction: {
    editReply: (options: BrandedMessagePayload) => Promise<unknown>;
  },
  container: ContainerBuilder,
  extraFlags?: number,
): Promise<void> {
  await interaction.editReply(
    brandedMessagePayload(container, extraFlags ?? V2_FLAGS),
  );
}

export async function sendBranded(
  channel: SendableChannels | null,
  container: ContainerBuilder,
) {
  if (!channel?.isSendable()) {
    throw new Error("Channel is not sendable.");
  }
  await channel.send(brandedMessagePayload(container));
}

/** @deprecated Use brandHeaderSection */
export function footerSection() {
  return brandHeaderSection();
}

/** @deprecated Use secondaryButton */
export function primaryButton(customId: string, label: string) {
  return secondaryButton(customId, label);
}

/** @deprecated Use brandHeaderSection */
export function sectionWithIcon(title: string, body: string) {
  const section = new SectionBuilder().addTextDisplayComponents(
    textBlock(`**${title}**\n${body}`),
  );
  const thumbnailUrl = brandThumbnailUrl();
  if (thumbnailUrl) {
    return section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));
  }
  return section.setButtonAccessory(linkButton("caedral.com", env.siteUrl));
}
