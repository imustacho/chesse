import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder } from 'discord.js';
import { brandImage, brandThumbnailAttachment } from './brand.js';

export function buildLauncher({ ownerId, opponentId, voiceId, inviteUrl, notice }) {
  const actions = new ActionRowBuilder().addComponents(inviteUrl
    ? new ButtonBuilder().setLabel('Join voice & play').setStyle(ButtonStyle.Link).setURL(inviteUrl)
    : new ButtonBuilder().setLabel('Open Activity').setStyle(ButtonStyle.Primary).setCustomId('activity:launch'));
  actions.addComponents(new ButtonBuilder().setLabel('Play legacy').setStyle(ButtonStyle.Secondary)
    .setCustomId(`activity:legacy:${ownerId}:${opponentId || 'open'}`));
  const panel = new ContainerBuilder().addSectionComponents(new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# chesse\nA little cheese. A good game.'),
      new TextDisplayBuilder().setContent(`${opponentId ? `<@${ownerId}> vs <@${opponentId}>\n` : ''}${voiceId && inviteUrl ? `Your table is waiting in <#${voiceId}>.` : 'Open the Activity together, or join a voice channel and run /chess for a voice invite.'}\n${notice || 'Play on a shared board, hang out in voice, and make your next move.'}`),
    ).setThumbnailAccessory(new ThumbnailBuilder().setURL(brandImage('chesse_face_happy')).setDescription('chesse')))
    .addActionRowComponents(actions)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Activity opens a lobby: invite a friend, find players, or watch. Both players must be ready. Play legacy opens the classic chat board.'));
  return { flags: MessageFlags.IsComponentsV2, components: [panel], files: [brandThumbnailAttachment('chesse_face_happy')], allowedMentions: { parse: [] } };
}
