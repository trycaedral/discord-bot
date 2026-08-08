import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { env } from "../config/env.js";

export function isOwner(userId: string): boolean {
  return userId === env.ownerDiscordId;
}

export async function requireOwner(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  if (isOwner(interaction.user.id)) return true;
  await interaction.reply({
    content: "You don't have permission to use this command.",
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

export function canManageTickets(userId: string, memberRoleIds: string[]): boolean {
  if (isOwner(userId)) return true;
  if (env.supportRoleId && memberRoleIds.includes(env.supportRoleId)) return true;
  return false;
}
