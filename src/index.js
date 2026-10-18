import 'dotenv/config';
import {
  Client,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
  InviteTargetType,
} from 'discord.js';
import { buildLauncher } from './ui/launcher.js';
import { ChessGame, createGameId } from './chess/ChessGame.js';
import { buildChessPanel } from './ui/components.js';
import { configureBrand } from './ui/brand.js';
import { UserFacingError } from './errors/UserFacingError.js';
import { handleInteractionError } from './errors/interactionErrorHandler.js';

const requiredEnv = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildExpressions, GatewayIntentBits.GuildVoiceStates],
  presence: { status: 'idle' },
});
const games = new Map();

client.once(Events.ClientReady, async (readyClient) => {
  configureBrand(readyClient);
  try { await readyClient.application.emojis.fetch(); } catch { console.warn('Could not fetch application emojis; using server emojis or defaults.'); }
  await Promise.allSettled(readyClient.guilds.cache.map(guild => guild.emojis.fetch()));
  console.log(`🧀 ${readyClient.user.tag} connected — status: ${readyClient.user.presence.status}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (error) {
    await handleInteractionError(interaction, error);
  }
});

async function handleCommand(interaction) {
  if (interaction.commandName !== 'chess') return;

  const opponent = interaction.options.getUser('opponent');
  if (opponent?.id === interaction.user.id) {
    throw new UserFacingError('You cannot challenge yourself. Choose another player as your opponent.');
  }
  if (opponent?.bot) {
    throw new UserFacingError('You cannot challenge a bot. Choose a human player as your opponent.');
  }

  await interaction.deferReply();
  const voice = interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channel;
  let inviteUrl, notice;
  if (voice?.type === ChannelType.GuildVoice) {
    try {
      const invite = await voice.createInvite({ targetApplication: process.env.DISCORD_CLIENT_ID, targetType: InviteTargetType.EmbeddedApplication, maxAge: 3600, maxUses: 0, unique: false });
      inviteUrl = invite.url;
    } catch {
      notice = 'A voice invite could not be created. Check Create Invite permission and Activity settings. You can still use Open Activity or Play legacy.';
    }
  }
  await interaction.editReply(buildLauncher({ ownerId: interaction.user.id, opponentId: opponent?.id, voiceId: voice?.id, inviteUrl, notice }));
}

async function startLegacy(interaction, opponent) {
  const game = new ChessGame({
    id: createGameId(),
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    challenger: interaction.user,
    invitedUser: opponent,
  });
  games.set(game.id, game);

  await interaction.deferReply();
  const message = await interaction.editReply(buildChessPanel(game));
  game.messageId = message.id;
}

async function handleButton(interaction) {
  if (interaction.customId === 'activity:launch') {
    await interaction.launchActivity();
    return;
  }
  if (interaction.customId.startsWith('activity:legacy:')) {
    const [, , ownerId, opponentId] = interaction.customId.split(':');
    if (interaction.user.id !== ownerId) throw new UserFacingError('Only the challenger can open this legacy game. Use /chess to create your own.');
    const opponent = opponentId === 'open' ? null : await client.users.fetch(opponentId);
    await startLegacy(interaction, opponent);
    return;
  }
  const [scope, action, gameId] = interaction.customId.split(':');
  if (scope !== 'chess') return;

  const game = games.get(gameId);
  if (!game) {
    throw new UserFacingError('This game could not be found. The bot may have restarted. Start a new game with `/chess`.');
  }

  if (action === 'accept') {
    game.acceptInvite(interaction.user);
    await updateGamePanel(interaction, game);
    return;
  }

  if (action === 'decline') {
    game.declineInvite(interaction.user);
    await updateGamePanel(interaction, game);
    return;
  }

  if (action === 'join') {
    game.join(interaction.user);
    await updateGamePanel(interaction, game);
    return;
  }

  if (action === 'refresh') {
    await updateGamePanel(interaction, game);
    return;
  }

  if (action === 'resign') {
    game.resign(interaction.user.id);
    await updateGamePanel(interaction, game);
    return;
  }

  if (action === 'move') {
    if (game.status !== 'active') throw new UserFacingError('This game is not active. Start a new game or wait for your opponent to join.');
    const color = game.getPlayerColor(interaction.user.id);
    if (!color) throw new UserFacingError('You are not a player in this game. Only the two players can make moves.');
    if (game.chess.turn() !== color) throw new UserFacingError('It is your opponent’s turn. Wait for their move before playing.');

    const modal = new ModalBuilder()
      .setCustomId(`chess:move-modal:${game.id}`)
      .setTitle('Enter your move');
    const input = new TextInputBuilder()
      .setCustomId('move')
      .setLabel('SAN or coordinates')
      .setPlaceholder('e4  ·  Nf3  ·  e2e4')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return;
  }
  throw new UserFacingError('Unknown game action. Start a new game with `/chess`.');
}

async function handleModal(interaction) {
  const [scope, action, gameId] = interaction.customId.split(':');
  if (scope !== 'chess' || action !== 'move-modal') return;

  const game = games.get(gameId);
  if (!game) {
    throw new UserFacingError('This game could not be found. The bot may have restarted. Start a new game with `/chess`.');
  }

  game.makeMove(interaction.user.id, interaction.fields.getTextInputValue('move'));

  await updateGamePanel(interaction, game);
}

async function updateGamePanel(interaction, game) {
  await interaction.deferUpdate();
  await interaction.editReply(buildChessPanel(game));
}

client.login(process.env.DISCORD_TOKEN).catch(() => {
  console.error('Could not connect to Discord. Check the network and bot token settings.');
  process.exitCode = 1;
});
