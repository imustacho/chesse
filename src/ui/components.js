import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  AttachmentBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { renderBoard } from './board.js';
import { brandEmoji, brandText, brandImage, brandThumbnailAttachment } from './brand.js';

export function componentsV2Flags() {
  return MessageFlags.IsComponentsV2;
}

export function buildChessPanel(game) {
  const white = game.players.white;
  const black = game.players.black;
  const opponentLine = black
    ? `<@${white.id}> vs <@${black.id}>`
    : game.status === 'pending'
      ? `<@${white.id}> vs <@${game.invitedUserId}>`
      : `<@${white.id}> vs Waiting for an opponent`;

  const statusLines = [game.getStatusText()];
  if (game.chess.isCheck() && game.status === 'active') {
    statusLines.push(`${brandText('chesse_face_check', '⚠️', game.guildId)} **Check!** Protect your king.`);
  }

  const expression = game.status === 'finished'
    ? game.winnerId ? 'win' : 'lose'
    : game.chess.isCheck() ? 'check' : game.status === 'active' ? 'think' : 'happy';
  const thumbnailName = `chesse_face_${expression}`;
  const thumbnail = brandImage(thumbnailName);
  const container = new ContainerBuilder()
    .addSectionComponents(new SectionBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# ${brandText('chesse_play', '🧀', game.guildId)} chesse`),
      new TextDisplayBuilder().setContent(`-# ${opponentLine}`),
      new TextDisplayBuilder().setContent(statusLines.join('\n')),
    ).setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail).setDescription(`chesse · ${expression}`)))
    .addSeparatorComponents(new SeparatorBuilder())
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('attachment://board.png').setDescription('chesse chessboard: golden cheese pieces for White and charcoal cheese pieces for Black.'),
    ));

  const buttons = getGameButtons(game);
  if (buttons.length > 0) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));
  }

  const lastMoveText = game.lastMove ? `Last move: ${game.lastMove}` : 'No moves yet.';
  const footer = game.status === 'finished' && game.winnerId
    ? `${brandText('chesse_crown', '👑', game.guildId)} <@${game.winnerId}> won! ${lastMoveText}`
    : lastMoveText;
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));

  return {
    flags: componentsV2Flags(),
    components: [container],
    files: [new AttachmentBuilder(renderBoard(game), { name: 'board.png' }), brandThumbnailAttachment(thumbnailName)],
    attachments: [],
    allowedMentions: { parse: [] },
  };
}

function getGameButtons(game) {
  if (game.status === 'pending') {
    return [
      new ButtonBuilder()
        .setCustomId(`chess:accept:${game.id}`)
        .setLabel('Accept')
        .setEmoji(brandEmoji('chesse_play', '✅', game.guildId))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`chess:decline:${game.id}`)
        .setLabel('Decline')
        .setEmoji(brandEmoji('chesse_face_angry', '✖️', game.guildId))
        .setStyle(ButtonStyle.Secondary),
    ];
  }

  if (game.status === 'open') {
    return [
      new ButtonBuilder()
        .setCustomId(`chess:join:${game.id}`)
        .setLabel('Join game')
        .setEmoji(brandEmoji('chesse_play', '♟️', game.guildId))
        .setStyle(ButtonStyle.Primary),
    ];
  }

  if (game.status === 'active') {
    return [
      new ButtonBuilder()
        .setCustomId(`chess:move:${game.id}`)
        .setLabel('Make a move')
        .setEmoji(brandEmoji('chesse_piece_pawn', '♟️', game.guildId))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`chess:refresh:${game.id}`)
        .setLabel('Refresh')
        .setEmoji(brandEmoji('chesse_history', '🔄', game.guildId))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`chess:resign:${game.id}`)
        .setLabel('Resign')
        .setEmoji(brandEmoji('chesse_face_lose', '🏳️', game.guildId))
        .setStyle(ButtonStyle.Danger),
    ];
  }

  return [];
}

export function buildInfoPanel() {
  return {
    flags: componentsV2Flags(),
    components: [
      new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('# 🧀 chesse\n## Play chess in Discord'),
          new TextDisplayBuilder().setContent(
            'Use `/chess` to start a game. Select an `opponent` to send a direct challenge, or leave it empty so anyone can join.\n\n**Move formats**\n`e4`, `Nf3`, `O-O`, or `e2e4`',
          ),
        )
        .addSeparatorComponents(new SeparatorBuilder()),
    ],
  };
}
