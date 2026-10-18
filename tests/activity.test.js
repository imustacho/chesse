import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomStore } from '../src/activity/rooms.js';
import { buildLauncher } from '../src/ui/launcher.js';

const white = { id: 'white', name: 'White' }, black = { id: 'black', name: 'Black' }, viewer = { id: 'viewer', name: 'Viewer' };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'chesse-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new RoomStore(dir);
  const act = (user, action, extra = {}) => store.act('instance', user, { version: store.load('instance').version, action, ...extra });
  act(white, 'seat', { color: 'w' }); act(black, 'seat', { color: 'b' });
  act(white, 'ready'); act(black, 'ready');
  return { store, act, dir };
}
test('Activity rejects spectators, wrong turns, illegal moves and stale concurrent actions', t => {
  const { store, act } = fixture(t);
  assert.throws(() => act(viewer, 'move', { from: 'e2', to: 'e4' }), /not your turn/);
  assert.throws(() => act(black, 'move', { from: 'e7', to: 'e5' }), /not your turn/);
  assert.throws(() => act(white, 'move', { from: 'e2', to: 'e5' }), /not legal/);
  act(white, 'move', { from: 'e2', to: 'e4' });
  assert.throws(() => store.act('instance', black, { action: 'move', from: 'e7', to: 'e5', version: store.load('instance').version - 1 }), /board changed/);
  assert.equal(store.load('instance').moves.length, 1);
  assert.throws(() => act(viewer, 'resign'), /Only players/);
});
test('Activity persists moves and restores repetition history after process replacement', t => {
  const { act, dir } = fixture(t);
  for (let round = 0; round < 2; round++) {
    act(white, 'move', { from: 'g1', to: 'f3' }); act(black, 'move', { from: 'g8', to: 'f6' });
    act(white, 'move', { from: 'f3', to: 'g1' }); act(black, 'move', { from: 'f6', to: 'g8' });
  }
  const restored = new RoomStore(dir).view('instance', white.id);
  assert.equal(restored.moves.length, 8);
  assert.equal(restored.result.reason, 'Threefold repetition');
  assert.deepEqual(restored.legal, []);
});
test('Activity checkmate ends game; rematch requires both players and swaps colors', t => {
  const { act, store } = fixture(t);
  act(white, 'move', { from: 'f2', to: 'f3' }); act(black, 'move', { from: 'e7', to: 'e5' });
  act(white, 'move', { from: 'g2', to: 'g4' });
  const end = act(black, 'move', { from: 'd8', to: 'h4' });
  assert.equal(end.result.winner, black.id); assert.equal(end.result.reason, 'Checkmate');
  assert.throws(() => act(white, 'move', { from: 'e2', to: 'e4' }), /active game/);
  assert.throws(() => act(viewer, 'rematch'), /both players/);
  act(white, 'rematch'); assert.equal(store.load('instance').round, 1);
  assert.throws(() => act(white, 'rematch'), /Waiting/);
  const next = act(black, 'rematch');
  assert.equal(next.round, 2); assert.equal(next.players.w.id, black.id); assert.equal(next.result, null); assert.deepEqual(next.moves, []);
});
test('draw offers need opponent consent and clear on a move; resignation records winner', t => {
  const { act } = fixture(t);
  act(white, 'offer-draw');
  assert.throws(() => act(white, 'accept-draw'), /opponent draw offer/);
  assert.equal(act(white, 'move', { from: 'e2', to: 'e4' }).drawOffer, null);
  act(black, 'offer-draw');
  assert.equal(act(white, 'accept-draw').result.reason, 'Draw by agreement');
  act(white, 'rematch'); act(black, 'rematch');
  act(white, 'ready'); act(black, 'ready');
  assert.equal(act(black, 'resign').result.winner, white.id);
});
test('rooms are isolated and seats cannot be stolen or occupied twice', t => {
  const { store, act } = fixture(t);
  assert.throws(() => act(viewer, 'seat', { color: 'w' }), /already started/);
  assert.equal(store.view('other-instance', white.id).players.w, null);
  store.act('other-instance', white, { action: 'seat', color: 'w', version: 0 });
  assert.throws(() => store.act('other-instance', white, { action: 'seat', color: 'b', version: 1 }), /already have a seat/);
  assert.equal(store.act('other-instance', white, { action: 'leave', version: 1 }).players.w, null);
});
test('launcher has colorless Components v2, voice invite and legacy owner/opponent route', () => {
  const panel = buildLauncher({ ownerId: '123', opponentId: '456', voiceId: '789', inviteUrl: 'https://discord.gg/example' });
  const json = panel.components[0].toJSON();
  assert.equal(json.accent_color, undefined);
  const row = json.components.find(c => c.type === 1);
  assert.equal(row.components[0].url, 'https://discord.gg/example');
  assert.equal(row.components[1].custom_id, 'activity:legacy:123:456');
  const fallback = buildLauncher({ ownerId: '123' }).components[0].toJSON();
  assert.equal(fallback.components.find(c => c.type === 1).components[0].custom_id, 'activity:launch');
});
