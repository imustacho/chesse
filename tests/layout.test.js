import test from 'node:test';
import assert from 'node:assert/strict';
import { loadImage } from '@napi-rs/canvas';
import { alphaBounds, normalizePiece } from '../src/ui/pieceLayout.js';
import { buildChessPanel } from '../src/ui/components.js';
import { ChessGame } from '../src/chess/ChessGame.js';

test('white and black versions of every piece have the same visible size and baseline', async () => {
  const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  for (const [type, name] of Object.entries(names)) {
    const white = alphaBounds(normalizePiece(await loadImage(`assets/chess/pieces/light/chesse_${name}.png`), type));
    const black = alphaBounds(normalizePiece(await loadImage(`assets/chess/pieces/dark/chesse_${name}.png`), type));
    assert.ok(Math.abs(white.width - black.width) <= 1, `${name}: width`);
    assert.ok(Math.abs(white.height - black.height) <= 1, `${name}: height`);
    assert.equal(white.y + white.height, black.y + black.height, `${name}: baseline`);
  }
});

test('game header precedes the single separator, board, controls and final small-print move', () => {
  const game = new ChessGame({ id: 'layout', challenger: { id: 'w', username: 'white' } });
  game.join({ id: 'b', username: 'black' });
  game.makeMove('w', 'e4');
  const children = buildChessPanel(game).components[0].toJSON().components;
  assert.deepEqual(children.map(c => c.type), [9, 14, 12, 1, 10]);
  assert.match(children[0].components[0].content, /chesse$/);
  assert.equal(children[0].components[1].content, '-# <@w> vs <@b>');
  assert.match(children[0].components[2].content, /Black to move/);
  assert.equal(children.at(-1).content, '-# Last move: e4');
  game.resign('b');
  const finished = buildChessPanel(game).components[0].toJSON().components;
  assert.match(finished[0].components[2].content, /<@b> resigned/);
  assert.doesNotMatch(finished[0].components[2].content, /won/);
  assert.equal(finished.at(-1).content, '-# 👑 <@w> won! Last move: e4');
  assert.deepEqual(finished.map(c => c.type), [9, 14, 12, 10]);
});
