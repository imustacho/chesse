import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { normalizePiece } from './pieceLayout.js';

const C = { cream: '#FFF8E7', gold: '#F7C948', accent: '#E3AA22', dark: '#29251E', muted: '#8F7954', light: '#FFF1CB' };
const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const pieces = {};
for (const [type, name] of Object.entries(names)) {
  const original = await loadImage(fileURLToPath(new URL(`../../assets/chess/pieces/light/chesse_${name}.png`, import.meta.url)));
  pieces[`w${type}`] = normalizePiece(original, type);
  pieces[`b${type}`] = normalizePiece(await loadImage(fileURLToPath(new URL(`../../assets/chess/pieces/dark/chesse_${name}.png`, import.meta.url))), type);
}
function rounded(ctx, x, y, w, h, radius, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
}
function text(ctx, value, x, y, font, color = C.dark) {
  ctx.font = font; ctx.fillStyle = color; ctx.fillText(value, x, y);
}

export function renderBoard(game) {
  const canvas = createCanvas(896, 896), ctx = canvas.getContext('2d');
  ctx.fillStyle = C.cream; ctx.fillRect(0, 0, 896, 896);
  const x0 = 48, y0 = 48, cell = 100;
  rounded(ctx, 36, 36, 824, 824, 16, C.dark);
  const last = game.chess.history({ verbose: true }).at(-1);
  const board = game.chess.board();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = x0 + col * cell, y = y0 + row * cell, square = `${'abcdefgh'[col]}${8 - row}`;
      ctx.fillStyle = (row + col) % 2 ? '#D9B46B' : '#FFF1CB'; ctx.fillRect(x, y, cell, cell);
      if (last && (square === last.from || square === last.to)) {
        ctx.fillStyle = '#F7C948AA'; ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = '#A8770D'; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
      }
      const piece = board[row][col];
      if (piece?.type === 'k' && piece.color === game.chess.turn() && game.chess.isCheck()) {
        ctx.fillStyle = '#DA5D48AA'; ctx.fillRect(x, y, cell, cell);
      }
      if (piece) ctx.drawImage(pieces[piece.color + piece.type], x, y);
    }
  }
  ctx.textAlign = 'center';
  for (let i = 0; i < 8; i++) {
    text(ctx, 'abcdefgh'[i], x0 + i * cell + 50, 882, 'bold 20px sans-serif', C.muted);
    text(ctx, String(8 - i), 18, y0 + i * cell + 56, 'bold 20px sans-serif', C.muted);
  }
  return canvas.toBuffer('image/png');
}
