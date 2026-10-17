import { randomInt } from 'node:crypto';
import { ContainerBuilder, MessageFlags, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder } from 'discord.js';
import { brandImage, brandThumbnailAttachment } from '../ui/brand.js';
import { UserFacingError } from './UserFacingError.js';

const expressions = ['chesse_face_check', 'chesse_face_checkmate', 'chesse_face_blunder'];
export function errorMessage(error) {
  if (error instanceof UserFacingError) return error.message;
  if (error?.code === 50035 && JSON.stringify(error.rawError?.errors ?? {}).includes('COMPONENT_INVALID_EMOJI')) {
    return 'An emoji was deleted or is unavailable to the bot. Try again after the emoji list has refreshed.';
  }
  const known = {
    50001: 'The bot cannot access this channel or message. Check its channel access.',
    50013: 'The bot does not have permission to do this. Check its channel permissions.',
    10008: 'The game message was deleted. Start a new game with `/chess`.',
    10062: 'This interaction expired. Press the button again or use `/chess`.',
    40060: 'This interaction has already been handled. Press the button again.',
    50035: 'Discord rejected a message component or attachment. The bot message needs to be checked.',
    ENOTFOUND: 'Discord could not be reached. Check the bot internet connection and DNS settings.',
    ECONNRESET: 'The Discord connection was interrupted. Try again shortly.',
    ETIMEDOUT: 'The Discord request timed out. Try again shortly.',
  };
  const code = error?.code ?? error?.cause?.code;
  return known[code] ?? `The action could not be completed: ${code ? `technical error code ${String(code).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)}` : 'an unexpected bot error'}. Details have been saved to the bot log.`;
}

export function buildErrorPanel(error, guildId, choice = randomInt(expressions.length)) {
  const name = expressions[choice];
  const thumbnail = brandImage(name);
  return {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [new ContainerBuilder().addSectionComponents(
      new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent('### Action failed'),
        new TextDisplayBuilder().setContent(errorMessage(error)),
      ).setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail).setDescription('chesse error notification')),
    )],
    files: [brandThumbnailAttachment(name)],
    allowedMentions: { parse: [] },
  };
}

export async function handleInteractionError(interaction, error) {
  if (!(error instanceof UserFacingError)) {
    // Do not log request bodies, authorization headers or token-bearing REST objects.
    console.error('[interaction]', { name: error?.name, code: error?.code ?? error?.cause?.code, stack: error?.stack?.split('\n').slice(1, 6).join('\n') });
  }
  try {
    const payload = buildErrorPanel(error, interaction.guildId);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
    }
    return true;
  } catch (deliveryError) {
    console.error('[error-panel-delivery]', { name: deliveryError?.name, code: deliveryError?.code });
    return false;
  }
}
