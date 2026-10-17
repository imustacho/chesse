import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';

const sourcePath = 'assets/references/chess-pieces.png';
const source = await loadImage(sourcePath);
const crops = {
  light: { pawn: [187, 45, 72, 77], knight: [283, 30, 74, 92], bishop: [387, 28, 70, 94], rook: [488, 37, 76, 85], queen: [588, 31, 77, 91], king: [687, 22, 81, 100] },
  dark: { pawn: [187, 174, 72, 83], knight: [283, 162, 74, 95], bishop: [387, 161, 70, 96], rook: [488, 171, 76, 86], queen: [588, 164, 77, 93], king: [687, 155, 81, 102] },
};

function clearBackdrop(ctx, width, height) {
  const pixels = ctx.getImageData(0, 0, width, height);
  const seen = new Uint8Array(width * height), queue = [];
  const visit = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (seen[index]) return;
    seen[index] = 1;
    const p = index * 4;
    if (pixels.data[p] > 145 && pixels.data[p + 1] > 140 && pixels.data[p + 2] > 115) queue.push(index);
  };
  for (let x = 0; x < width; x++) { visit(x, 0); visit(x, height - 1); }
  for (let y = 0; y < height; y++) { visit(0, y); visit(width - 1, y); }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head], x = index % width, y = Math.floor(index / width);
    pixels.data[index * 4 + 3] = 0;
    visit(x - 1, y); visit(x + 1, y); visit(x, y - 1); visit(x, y + 1);
  }
  ctx.putImageData(pixels, 0, 0);
}

await mkdir('assets/metadata', { recursive: true });
await mkdir('assets/previews', { recursive: true });
const sheet = createCanvas(960, 420), preview = sheet.getContext('2d');
preview.fillStyle = '#FFF8E7'; preview.fillRect(0, 0, 960, 420);
let sideIndex = 0;
for (const [side, pieces] of Object.entries(crops)) {
  await mkdir(`assets/chess/pieces/${side}`, { recursive: true });
  let index = 0;
  for (const [name, [x, y, w, h]] of Object.entries(pieces)) {
    const crop = createCanvas(w, h), ctx = crop.getContext('2d');
    ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
    clearBackdrop(ctx, w, h);
    const canvas = createCanvas(256, 256), out = canvas.getContext('2d');
    out.imageSmoothingQuality = 'high';
    out.drawImage(crop, (256 - w * 2.2) / 2, 244 - h * 2.2, w * 2.2, h * 2.2);
    await writeFile(`assets/chess/pieces/${side}/chesse_${name}.png`, canvas.toBuffer('image/png'));
    preview.drawImage(canvas, index * 160 + 10, sideIndex * 210 + 10, 140, 160);
    preview.fillStyle = '#29251E'; preview.font = '15px sans-serif'; preview.textAlign = 'center';
    preview.fillText(`${side} ${name}`, index * 160 + 80, sideIndex * 210 + 195);
    index++;
  }
  sideIndex++;
}
await writeFile('assets/metadata/chess-piece-crops.json', JSON.stringify({ source: sourcePath, crops }, null, 2));
await writeFile('assets/previews/chess-pieces.png', sheet.toBuffer('image/png'));
console.log('Extracted 12 chess pieces from the latest reference.');
