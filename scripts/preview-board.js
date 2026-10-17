import { writeFile, mkdir, readFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { loadImage } from '@napi-rs/canvas';
import { ChessGame } from '../src/chess/ChessGame.js';
import { buildChessPanel } from '../src/ui/components.js';

const game = new ChessGame({ id: 'preview', challenger: { id: '1', username: 'cheese_master' }, invitedUser: null });
const before = buildChessPanel(game);
game.join({ id: '2', username: 'night_knight' });
game.makeMove('1', 'e4'); game.makeMove('2', 'e5');
const panel = buildChessPanel(game);
assert.equal(panel.components[0].toJSON().type, 17);
assert.equal(panel.flags, 32768);
const container = panel.components[0].toJSON();
const header = container.components.find(c => c.type === 9);
assert.equal(header.accessory.type, 11);
assert.equal(header.accessory.media.url, 'attachment://chesse_face_think.png');
const actions = container.components.find(c => c.type === 1);
assert.equal(actions.components[0].label, 'Make a move');
assert.equal(before.components[0].toJSON().components[0].accessory.media.url, 'attachment://chesse_face_happy.png');
assert.notDeepEqual(before.files[0].attachment, panel.files[0].attachment);
const board = await loadImage(panel.files[0].attachment);
assert.equal(board.width, 896); assert.equal(board.height, 896);
assert.equal(container.accent_color, undefined);
assert.equal(before.components[0].toJSON().accent_color, undefined);
const manifest = JSON.parse(await readFile('assets/metadata/emoji-manifest.json', 'utf8'));
for (const item of manifest) {
  const file = `assets/emojis/${item.name}.png`, image = await loadImage(file);
  assert.equal(image.width, 128); assert.equal(image.height, 128);
  assert.ok((await stat(file)).size < 256 * 1024);
}
await mkdir('assets/previews', { recursive: true });
await writeFile('assets/previews/board.png', panel.files[0].attachment);
console.log('Canvas board, Components v2 thumbnails, custom emojis, and upload assets validated.');
