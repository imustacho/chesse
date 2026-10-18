import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RoomStore } from '../src/activity/rooms.js';
import { LobbyService } from '../src/activity/lobby.js';
const session = (id, instanceId = 'voice-a') => ({ user: { id, name: id, username: `user_${id}` }, instanceId });
const a = session('a'), b = session('b'), c = session('c'), remote = session('remote', 'voice-b');
function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'chesse-lobby-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let now = 1000; const store = new RoomStore(directory, { now: () => now }), service = new LobbyService(store, { now: () => now });
  const act = (s, action, input = {}) => service.act(s, { action, version: service.snapshot(s).room?.version, ...input });
  return { store, service, act, advance: ms => { now += ms; }, directory };
}
test('Activity opens a lobby; an invited friend accepts and both must ready before moves', t => {
  const { service, act } = setup(t);
  assert.equal(service.snapshot(a).screen, 'lobby'); assert.equal(service.snapshot(a).room, null);
  service.snapshot(b); service.snapshot(c);
  const created = act(a, 'create-room', { friendId: 'b' }); const id = created.room.id;
  assert.equal(created.room.status, 'waiting'); assert.deepEqual(created.room.legal, []);
  assert.throws(() => act(c, 'join-room', { roomId: id }), /reserved/);
  assert.equal(service.snapshot(b).invites[0].id, id);
  const joined = act(b, 'accept-invite', { roomId: id }); assert.equal(joined.room.status, 'ready');
  assert.throws(() => act(a, 'move', { from: 'e2', to: 'e4' }), /active game/);
  act(a, 'ready'); assert.equal(service.snapshot(b).room.status, 'ready');
  const started = act(b, 'ready'); assert.equal(started.room.status, 'active');
  assert.equal(act(a, 'move', { from: 'e2', to: 'e4' }).room.lastMove.san, 'e4');
});
test('friend settings require the host, reset consent, and spectator access is enforced', t => {
  const { service, act } = setup(t);
  service.snapshot(b);
  const id = act(a, 'create-room', { settings: { visibility: 'public' } }).room.id;
  act(b, 'join-room', { roomId: id }); act(b, 'ready');
  act(c, 'watch-room', { roomId: id }); assert.equal(service.snapshot(a).room.spectators[0].id, 'c');
  assert.throws(() => act(c, 'ready'), /Two players/);
  assert.throws(() => act(b, 'settings', { settings: { minutes: 5 } }), /Only the host/);
  const changed = act(a, 'settings', { settings: { minutes: 5, allowSpectators: false } });
  assert.deepEqual(changed.room.ready, []); assert.equal(service.snapshot(c).screen, 'lobby');
  assert.throws(() => act(c, 'watch-room', { roomId: id }), /Spectators are disabled/);
  act(a, 'ready'); act(b, 'ready'); assert.throws(() => act(a, 'settings', { settings: { minutes: 3 } }), /locked/);
});
test('private room code allows remote spectating without disclosing codes in listings', t => {
  const { service, act } = setup(t);
  const created = act(a, 'create-room');
  assert.equal(service.snapshot(remote).rooms.length, 0);
  assert.throws(() => act(remote, 'watch-room', { roomId: created.room.id }), /private room/);
  const watched = act(remote, 'watch-room', { code: created.room.code });
  assert.equal(watched.room.id, created.room.id); assert.equal(watched.room.code, undefined);
  assert.throws(() => act(remote, 'move', { from: 'e2', to: 'e4' }), /active game/);
  assert.equal(act(remote, 'return-lobby').screen, 'lobby');
});
test('matchmaking pairs real users across instances by time control, never starts automatically', t => {
  const { service, act } = setup(t);
  assert.equal(act(a, 'find-players', { settings: { minutes: 5 } }).search.queueSize, 1);
  assert.equal(act(b, 'find-players', { settings: { minutes: 10 } }).screen, 'lobby');
  const paired = act(remote, 'find-players', { settings: { minutes: 5 } });
  assert.equal(paired.room.status, 'ready'); assert.equal(paired.room.players.w.id, 'a'); assert.equal(paired.room.players.b.id, 'remote');
  assert.equal(service.snapshot(a).room.id, paired.room.id); assert.equal(service.snapshot(a).search, null);
  assert.equal(act(b, 'cancel-search').search, null);
  assert.throws(() => act(a, 'settings', { settings: { minutes: 3 } }), /Only the host/);
});
test('disconnected queued users expire; one account cannot be seated in two rooms', t => {
  const { act, advance } = setup(t);
  act(a, 'find-players'); advance(21_000);
  const searching = act(remote, 'find-players'); assert.equal(searching.room, null); assert.equal(searching.search.queueSize, 1);
  act(b, 'create-room'); assert.throws(() => act(b, 'find-players'), /current match/);
});
test('server clocks include increments, time out and survive restoring the store', t => {
  const { store, service, act, advance, directory } = setup(t);
  const id = act(a, 'create-room', { settings: { minutes: 3, increment: 2, visibility: 'public' } }).room.id;
  act(b, 'join-room', { roomId: id }); act(a, 'ready'); act(b, 'ready'); advance(10_000);
  assert.equal(act(a, 'move', { from: 'e2', to: 'e4' }).room.clocks.w, 172_000);
  assert.equal(new RoomStore(directory).load(id).moves[0], 'e4');
  advance(181_000); const ended = service.snapshot(b).room;
  assert.equal(ended.status, 'finished'); assert.equal(ended.result.winner, 'a'); assert.equal(ended.clocks.b, 0);
  assert.throws(() => store.act(id, b.user, { action: 'move', from: 'e7', to: 'e5', version: ended.version }), /active game/);
});
test('a previous match cannot be used to take a second seat or rematch a busy opponent', t => {
  const { act } = setup(t);
  const id = act(a, 'create-room', { settings: { visibility: 'public' } }).room.id;
  act(b, 'join-room', { roomId: id }); act(a, 'ready'); act(b, 'ready'); act(a, 'resign');
  act(b, 'return-lobby'); act(b, 'create-room');
  assert.throws(() => act(b, 'watch-room', { roomId: id }), /current match/);
  assert.throws(() => act(a, 'rematch'), /another room/);
});
test('host can clear a stale invitation and let another person join', t => {
  const { service, act } = setup(t);
  service.snapshot(b); const id = act(a, 'create-room', { friendId: 'b' }).room.id;
  assert.equal(service.snapshot(b).invites.length, 1);
  act(a, 'invite', { invitedUserId: null }); assert.equal(service.snapshot(b).invites.length, 0);
  assert.equal(act(c, 'join-room', { roomId: id }).room.status, 'ready');
});
test('one-click room play pairs only two opted-in users in the same verified Activity', t => {
  const { service, act } = setup(t);
  service.snapshot(b); service.snapshot(c);
  const waiting = act(a, 'find-local'); assert.equal(waiting.screen, 'lobby'); assert.equal(waiting.search.scope, 'local');
  assert.equal(service.snapshot(b).room, null, 'Joining the Activity alone must not opt someone in');
  const elsewhere = act(remote, 'find-local'); assert.equal(elsewhere.screen, 'lobby'); assert.equal(elsewhere.search.queueSize, 1);
  const paired = act(b, 'find-local'); assert.equal(paired.room.mode, 'local'); assert.equal(paired.room.status, 'ready');
  assert.equal(paired.room.players.w.id, 'a'); assert.equal(paired.room.players.b.id, 'b');
  assert.equal(service.snapshot(a).room.id, paired.room.id); assert.equal(service.snapshot(c).room, null);
  assert.equal(service.snapshot(remote).room, null); assert.equal(service.snapshot(remote).rooms.length, 0);
  assert.deepEqual(paired.room.legal, []); act(a, 'ready'); assert.equal(act(b, 'ready').room.status, 'active');
});
test('room and global queues do not mix and cancellation removes the local wait', t => {
  const { service, act } = setup(t);
  act(a, 'find-local'); assert.equal(act(b, 'find-players').screen, 'lobby');
  assert.equal(act(a, 'cancel-search').search, null);
  const waiting = act(c, 'find-local'); assert.equal(waiting.screen, 'lobby'); assert.equal(waiting.search.queueSize, 1);
  const paired = act(remote, 'find-players'); assert.equal(paired.room.players.w.id, 'b');
  assert.equal(service.snapshot(c).room, null);
});
