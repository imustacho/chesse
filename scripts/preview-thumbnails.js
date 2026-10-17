import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const names = ['happy', 'think', 'win', 'lose', 'check', 'checkmate', 'blunder', 'angry'];
const canvas = createCanvas(1000, 540), ctx = canvas.getContext('2d');
ctx.fillStyle = '#FFF8E7'; ctx.fillRect(0, 0, canvas.width, canvas.height);
for (let i = 0; i < names.length; i++) {
  const name = names[i];
  const file = await readFile(`assets/expressions/chesse_face_${name}.png`);
  const image = await loadImage(file);
  assert.ok(image.width >= 512 && image.height >= 512, `${name} must be high-resolution`);
  const probe = createCanvas(image.width, image.height), probeCtx = probe.getContext('2d');
  probeCtx.drawImage(image, 0, 0);
  assert.equal(probeCtx.getImageData(0, 0, 1, 1).data[3], 0, `${name} must have transparent corners`);
  const x = (i % 4) * 250, y = Math.floor(i / 4) * 270;
  ctx.drawImage(image, x + 15, y + 12, 220, 220);
  ctx.textAlign = 'center'; ctx.fillStyle = '#29251E'; ctx.font = '18px sans-serif';
  ctx.fillText(name, x + 125, y + 250);
  console.log(`${name}: ${image.width}×${image.height}, ${Math.round(file.length / 1024)} KiB, alpha OK`);
}
await writeFile('assets/previews/expressions.png', canvas.toBuffer('image/png'));
