import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AttachmentBuilder } from 'discord.js';

let client;
let ids = {};
try { ids = JSON.parse(readFileSync(new URL('../../assets/config/emoji-ids.json', import.meta.url), 'utf8')); } catch {}
export function configureBrand(discordClient) { client = discordClient; }
export function brandEmoji(name, fallback, guildId) {
  if (!client) return ids[name] ? { id: ids[name], name } : fallback;
  const caches = [client.application?.emojis?.cache, client.guilds.cache.get(guildId)?.emojis.cache].filter(Boolean);
  // Persisted IDs may refer to deleted/reuploaded emojis. Use only live, available entries.
  for (const cache of caches) {
    const matches = [...cache.values()].filter(e => e.name === name && e.available !== false);
    // Snowflake order: prefer the newest upload when old/new emojis share a name.
    matches.sort((a, b) => b.id.length - a.id.length || b.id.localeCompare(a.id));
    const emoji = matches[0]
      ?? (ids[name] ? cache.get(ids[name]) : undefined);
    if (emoji && emoji.available !== false) return { id: emoji.id, name: emoji.name, animated: Boolean(emoji.animated) };
  }
  return fallback;
}
export function brandText(name, fallback, guildId) {
  const emoji = brandEmoji(name, fallback, guildId);
  return typeof emoji === 'string' ? emoji : `<:${name}:${emoji.id}>`;
}

const thumbnailNames = new Set(['happy', 'think', 'win', 'lose', 'check', 'checkmate', 'blunder'].map(name => `chesse_face_${name}`));

export function brandImage(name) {
  if (!thumbnailNames.has(name)) throw new Error('Unknown thumbnail image.');
  return `attachment://${name}.png`;
}

export function brandThumbnailAttachment(name) {
  if (!thumbnailNames.has(name)) throw new Error('Unknown thumbnail image.');
  return new AttachmentBuilder(fileURLToPath(new URL(`../../assets/expressions/${name}.png`, import.meta.url)), { name: `${name}.png` });
}
