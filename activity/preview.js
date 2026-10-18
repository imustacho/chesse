import { Chess } from 'chess.js';
const me = { id: 'demo-white', name: 'mustacho', username: 'imustacho' }, friend = { id: 'demo-black', name: 'A friend', username: 'chesse_friend' };
const settings = { minutes: 10, increment: 0, allowSpectators: true, visibility: 'private' };
function game() { const c = new Chess(); ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'].forEach(m => c.move(m)); return { id: 'offline', hostId: me.id, code: 'CHEESE01', version: 0, status: 'active', mode: 'friends', name: 'A friendly game', settings, players: { w: me, b: friend }, ready: [], rematch: [], round: 1, moves: c.history(), fen: c.fen(), turn: c.turn(), check: false, result: null, drawOffer: null, clocks: { w: 600000, b: 600000 }, me: me.id, spectators: [{ id: 'demo-viewer', name: 'A spectator', username: 'spectator' }], online: [me.id, friend.id], lastMove: c.history({ verbose: true }).at(-1), legal: c.moves({ verbose: true }) }; }
export function demoSnapshot(screen) { return { screen: screen === 'game' ? 'room' : 'lobby', me, room: screen === 'game' ? game() : null, participants: [me, friend].map(p => ({ ...p, busy: false, searching: false })), invites: [], rooms: [], search: null }; }
export function demoAct(state, action, input) {
  const next = structuredClone(state);
  if (action === 'find-players' || action === 'find-local') { next.search = { since: Date.now(), settings: input.settings || settings, scope: action === 'find-local' ? 'local' : 'global', queueSize: 1 }; return next; }
  if (action === 'cancel-search') { next.search = null; return next; }
  if (action === 'create-room') { next.room = game(); next.screen = 'room'; next.room.status = 'waiting'; next.room.players.b = null; next.room.settings = input.settings; next.room.moves = []; const c = new Chess(); next.room.fen = c.fen(); next.room.lastMove = null; next.room.legal = []; next.room.invitedUserId = input.friendId || null; return next; }
  if (action === 'return-lobby') return demoSnapshot();
  const r = next.room;
  if (action === 'settings') r.settings = input.settings;
  else if (action === 'move') { const c = new Chess(r.fen), m = c.move(input); r.fen = c.fen(); r.turn = c.turn(); r.check = c.isCheck(); r.lastMove = m; r.moves.push(m.san); r.legal = c.moves({ verbose: true }); }
  else if (action === 'resign') { r.result = { winner: friend.id, reason: 'mustacho resigned' }; r.status = 'finished'; r.legal = []; }
  else if (action === 'offer-draw') r.drawOffer = me.id;
  else throw new Error('Offline design preview. Use Discord for multiplayer actions.');
  r.version++; return next;
}
