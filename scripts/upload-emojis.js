import { config } from 'dotenv';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadImage } from '@napi-rs/canvas';
import { REST, Routes } from 'discord.js';

class UploadError extends Error {}

export async function loadEmojiFiles(directory = new URL('../assets/emojis/', import.meta.url)) {
  const files = (await readdir(directory)).filter(file => file.endsWith('.png')).sort();
  if (files.length === 0) throw new UploadError('No PNG files found in assets/emojis/.');
  const emojis = [];
  for (const file of files) {
    const name = file.slice(0, -4);
    if (!/^[a-zA-Z0-9_]{2,32}$/.test(name)) throw new UploadError(`Invalid emoji filename: ${file}. Use 2–32 letters, numbers, or underscores.`);
    const png = await readFile(new URL(file, directory));
    if (png.length === 0 || png.length > 256 * 1024) throw new UploadError(`${file}: PNG files must be at most 256 KiB.`);
    if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new UploadError(`${file}: not a valid PNG file.`);
    let image;
    try { image = await loadImage(png); } catch { throw new UploadError(`${file}: the PNG could not be decoded.`); }
    if (image.width !== 128 || image.height !== 128) throw new UploadError(`${file}: expected 128×128 pixels. Run npm run assets:emojis first.`);
    emojis.push({ name, png });
  }
  return emojis;
}

export async function uploadApplicationEmojis({ rest, applicationId, emojis, log = console.log }) {
  if (!/^\d+$/.test(applicationId ?? '')) throw new UploadError('DISCORD_CLIENT_ID must be a numeric Discord application ID.');
  const application = await rest.get(Routes.oauth2CurrentApplication());
  if (application.id !== applicationId) throw new UploadError('DISCORD_TOKEN and DISCORD_CLIENT_ID belong to different applications. Nothing was uploaded.');
  const route = Routes.applicationEmojis(applicationId);
  const { items } = await rest.get(route);
  const existingNames = new Set(items.map(emoji => emoji.name));
  const missing = emojis.filter(emoji => !existingNames.has(emoji.name));
  if (items.length + missing.length > 2000) throw new UploadError('The application does not have enough free emoji slots. Nothing was uploaded.');
  const summary = { created: 0, skipped: 0 };
  for (const { name, png } of emojis) {
    if (existingNames.has(name)) {
      log(`Skipped ${name}: already exists on the application.`);
      summary.skipped++;
      continue;
    }
    // REST handles rate limits; upload sequentially. Never call guild emoji endpoints.
    try { await rest.post(route, { body: { name, image: `data:image/png;base64,${png.toString('base64')}` } }); }
    catch (error) {
      const code = String(error?.code ?? error?.status ?? 'network').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
      throw new UploadError(`Could not upload ${name} (error ${code}). Fix the connection or credentials and rerun; existing uploads will be skipped.`);
    }
    existingNames.add(name);
    log(`Uploaded ${name} to the application.`);
    summary.created++;
  }
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: npm run emojis:upload [-- --dry-run]\nUploads assets/emojis/*.png to the bot application, never to a server.\nExisting names are skipped. --dry-run validates local PNGs without contacting Discord.');
    return;
  }
  if (args.some(arg => arg !== '--dry-run')) throw new UploadError('Unknown option. Use --help or --dry-run.');
  const emojis = await loadEmojiFiles();
  for (const emoji of emojis) console.log(`Validated ${emoji.name}: 128×128, ${Math.round(emoji.png.length / 1024)} KiB.`);
  if (args.includes('--dry-run')) {
    console.log(`Dry run complete: ${emojis.length} valid emojis. No Discord requests were made.`);
    return;
  }
  config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
  if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) throw new UploadError('Set DISCORD_TOKEN and DISCORD_CLIENT_ID in .env before uploading.');
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const result = await uploadApplicationEmojis({ rest, applicationId: process.env.DISCORD_CLIENT_ID, emojis });
  console.log(`Done: ${result.created} uploaded, ${result.skipped} already present. Restart the bot to refresh its application emoji cache.`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => {
    const code = String(error?.code ?? error?.status ?? 'network').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
    console.error(error instanceof UploadError ? error.message : `Could not load files or contact Discord (error ${code}). Check the files, credentials, and network.`);
    process.exitCode = 1;
  });
}
