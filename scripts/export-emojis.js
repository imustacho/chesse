import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { alphaBounds } from '../src/ui/pieceLayout.js';
import assert from 'node:assert/strict';

const entries = [
  { name: 'chesse_play', source: 'assets/branding/icons/chesse_play.png', usage: 'Title, Accept, Join game' },
  { name: 'chesse_piece_pawn', source: 'assets/branding/icons/chesse_piece_pawn.png', usage: 'Make a move' },
  { name: 'chesse_history', source: 'assets/branding/icons/chesse_history.png', usage: 'Refresh' },
  { name: 'chesse_face_angry', source: 'assets/expressions/chesse_face_angry.png', usage: 'Decline' },
  { name: 'chesse_face_lose', source: 'assets/expressions/chesse_face_lose.png', usage: 'Resign' },
  { name: 'chesse_face_check', source: 'assets/expressions/chesse_face_check.png', usage: 'Check warning' },
  { name: 'chesse_crown', source: 'assets/branding/icons/chesse_crown.png', usage: 'Winner footer' },
];
await mkdir('assets/emojis', { recursive: true });
await mkdir('assets/previews', { recursive: true });
const sheet = createCanvas(840, 400), preview = sheet.getContext('2d');
preview.fillStyle = '#FFF8E7'; preview.fillRect(0, 0, sheet.width, sheet.height);
for (let i = 0; i < entries.length; i++) {
  const entry = entries[i], image = await loadImage(entry.source), bounds = alphaBounds(image);
  const canvas = createCanvas(128, 128), ctx = canvas.getContext('2d');
  const scale = 116 / Math.max(bounds.width, bounds.height), w = bounds.width * scale, h = bounds.height * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, (128 - w) / 2, (128 - h) / 2, w, h);
  const png = canvas.toBuffer('image/png');
  assert.ok(png.length < 256 * 1024);
  assert.equal(ctx.getImageData(0, 0, 1, 1).data[3], 0);
  await writeFile(`assets/emojis/${entry.name}.png`, png);
  const x = (i % 4) * 210, y = Math.floor(i / 4) * 200;
  preview.drawImage(canvas, x + 41, y + 12);
  preview.textAlign = 'center'; preview.fillStyle = '#29251E'; preview.font = '14px sans-serif';
  preview.fillText(entry.name, x + 105, y + 162);
  console.log(`${entry.name}: 128×128, ${Math.round(png.length / 1024)} KiB`);
}
await writeFile('assets/metadata/emoji-manifest.json', JSON.stringify(entries, null, 2));
await writeFile('assets/previews/emojis.png', sheet.toBuffer('image/png'));
