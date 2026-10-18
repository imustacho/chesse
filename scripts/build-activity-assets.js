import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadImage } from '@napi-rs/canvas';
import { normalizePiece } from '../src/ui/pieceLayout.js';
const target = resolve('dist/activity/assets');
mkdirSync(target, { recursive: true });
for (const directory of ['branding', 'expressions']) cpSync(resolve('assets', directory), resolve(target, directory), { recursive: true });
mkdirSync(resolve(target, 'pieces'), { recursive: true });
for (const [color, directory] of [['w', 'light'], ['b', 'dark']]) {
  for (const [type, name] of Object.entries({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' })) {
    const image = await loadImage(resolve('assets/chess/pieces', directory, `chesse_${name}.png`));
    writeFileSync(resolve(target, 'pieces', `${color}${type}.png`), normalizePiece(image, type).toBuffer('image/png'));
  }
}
console.log('Activity branding and matched-size chess pieces exported.');
