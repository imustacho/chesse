import { Chess } from 'chess.js';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class GameError extends Error {}
export const DEFAULT_SETTINGS = { minutes: 10, increment: 0, allowSpectators: true, visibility: 'private' };
export function validateSettings(input = {}) {
  const s = { ...DEFAULT_SETTINGS, ...input };
  if (![0, 3, 5, 10, 15, 30].includes(s.minutes) || ![0, 2, 5].includes(s.increment) || typeof s.allowSpectators !== 'boolean' || !['private', 'public'].includes(s.visibility)) throw new GameError('Choose a supported time control and room setting.');
  return { minutes: s.minutes, increment: s.minutes ? s.increment : 0, allowSpectators: s.allowSpectators, visibility: s.visibility };
}
export function profile(user) { return { id: user.id, name: user.name, username: user.username || user.name }; }
export class RoomStore {
  constructor(directory, { now = Date.now } = {}) { this.directory = directory; this.now = now; mkdirSync(directory, { recursive: true }); }
  path(id) { return join(this.directory, `${createHash('sha256').update(id).digest('hex')}.json`); }
  fresh(id) { return { id, version: 0, players: { w: null, b: null }, moves: [], result: null, drawOffer: null, rematch: [], ready: [], round: 1, status: 'waiting', settings: { ...DEFAULT_SETTINGS }, clocks: { w: 600_000, b: 600_000, runningSince: null } }; }
  load(id) {
    if (!existsSync(this.path(id))) return this.fresh(id);
    const value = JSON.parse(readFileSync(this.path(id), 'utf8'));
    return { ...this.fresh(id), status: value.result ? 'finished' : value.players?.w && value.players?.b ? 'active' : 'waiting', ...value };
  }
  list() { return readdirSync(this.directory).filter(n => n.endsWith('.json')).map(n => JSON.parse(readFileSync(join(this.directory, n), 'utf8'))).filter(r => r.id && r.hostId); }
  save(room) {
    room.updatedAt = this.now(); const target = this.path(room.id);
    writeFileSync(`${target}.tmp`, JSON.stringify(room), { mode: 0o600 }); renameSync(`${target}.tmp`, target);
  }
  create(id, options) {
    if (existsSync(this.path(id))) throw new GameError('That room already exists.');
    const room = { ...this.fresh(id), ...options, id, settings: validateSettings(options.settings) };
    room.clocks = { w: room.settings.minutes * 60_000, b: room.settings.minutes * 60_000, runningSince: null };
    this.save(room); return room;
  }
  chess(room) { const chess = new Chess(); for (const move of room.moves) chess.move(move); return chess; }
  remaining(room, chess) {
    const c = { ...room.clocks };
    if (room.status === 'active' && room.settings.minutes && c.runningSince !== null) c[chess.turn()] = Math.max(0, c[chess.turn()] - Math.max(0, this.now() - c.runningSince));
    return c;
  }
  settle(room, chess) {
    const clocks = this.remaining(room, chess);
    if (room.status === 'active' && room.settings.minutes && clocks[chess.turn()] <= 0) {
      const other = chess.turn() === 'w' ? 'b' : 'w';
      const onlyKing = chess.board().flat().filter(p => p?.color === other).length === 1;
      room.result = { winner: onlyKing ? null : room.players[other].id, reason: onlyKing ? 'Time expired · opponent has only a king' : 'Time expired' };
      room.status = 'finished'; room.clocks = { ...clocks, runningSince: null }; room.version++; this.save(room);
    }
  }
  view(id, userId) {
    const room = this.load(id), chess = this.chess(room); this.settle(room, chess);
    const { homeInstanceId, invitedUserId, ...value } = room;
    const seated = Object.values(room.players).some(p => p?.id === userId);
    if (!seated) delete value.code;
    return { ...value, invitedUserId: seated ? invitedUserId : undefined, clocks: this.remaining(room, chess), serverNow: this.now(), fen: chess.fen(), turn: chess.turn(), check: chess.isCheck(), legal: room.status !== 'active' ? [] : chess.moves({ verbose: true }).map(({ from, to, promotion }) => ({ from, to, promotion })), me: userId, lastMove: chess.history({ verbose: true }).at(-1) || null };
  }
  act(id, user, input) {
    const room = this.load(id), chess = this.chess(room); this.settle(room, chess);
    if (!Number.isInteger(input.version) || input.version !== room.version) throw new GameError('The board changed. Try again on the updated board.');
    const color = ['w', 'b'].find(c => room.players[c]?.id === user.id), both = room.players.w && room.players.b;
    switch (input.action) {
      case 'seat': {
        if (!['w', 'b'].includes(input.color)) throw new GameError('Choose a valid seat.');
        if (!['waiting', 'ready'].includes(room.status) || both) throw new GameError('This game has already started. You can watch this round.');
        if (color) throw new GameError('You already have a seat.');
        if (room.players[input.color]) throw new GameError('That seat is taken.');
        if (room.invitedUserId && room.invitedUserId !== user.id) throw new GameError('This seat is reserved for the invited friend.');
        room.players[input.color] = profile(user); room.invitedUserId = null; room.ready = []; room.status = room.players.w && room.players.b ? 'ready' : 'waiting'; break;
      }
      case 'ready': {
        if (!color || !both || room.status !== 'ready') throw new GameError('Two players must join before getting ready.');
        room.ready = room.ready.includes(user.id) ? room.ready.filter(id => id !== user.id) : [...room.ready, user.id];
        if (room.ready.length === 2) { room.status = 'active'; room.clocks.runningSince = this.now(); } break;
      }
      case 'settings': {
        if (user.id !== room.hostId || room.mode === 'multiplayer') throw new GameError('Only the host can change a friend room’s settings.');
        if (!['waiting', 'ready'].includes(room.status)) throw new GameError('Room settings are locked during a match.');
        room.settings = validateSettings(input.settings); room.ready = [];
        room.clocks = { w: room.settings.minutes * 60_000, b: room.settings.minutes * 60_000, runningSince: null }; break;
      }
      case 'invite': {
        if (user.id !== room.hostId || room.mode !== 'friends' || room.status !== 'waiting') throw new GameError('Only the host can invite someone to an open friend room.');
        room.invitedUserId = input.invitedUserId; break;
      }
      case 'decline-invite': {
        if (room.invitedUserId !== user.id) throw new GameError('This invitation is not addressed to you.');
        room.invitedUserId = null; break;
      }
      case 'leave': {
        if (!color || !['waiting', 'ready'].includes(room.status)) throw new GameError('Resign before leaving an active match.');
        room.players[color] = null; room.ready = []; room.status = 'waiting';
        if (room.hostId === user.id) room.hostId = room.players.w?.id || room.players.b?.id || room.hostId;
        if (!room.players.w && !room.players.b) { room.status = 'closed'; room.invitedUserId = null; } break;
      }
      case 'move': {
        if (!both || room.status !== 'active') throw new GameError('Wait for two players and an active game.');
        if (color !== chess.turn()) throw new GameError('It is not your turn.');
        const clocks = this.remaining(room, chess);
        let move; try { move = chess.move({ from: input.from, to: input.to, promotion: input.promotion }); } catch { throw new GameError('That move is not legal. Choose a highlighted square.'); }
        room.clocks = { ...clocks, runningSince: this.now() }; if (room.settings.minutes) room.clocks[color] += room.settings.increment * 1000;
        room.moves.push(move.san); room.drawOffer = null;
        if (chess.isCheckmate()) room.result = { winner: user.id, reason: 'Checkmate' };
        else if (chess.isDraw()) room.result = { winner: null, reason: chess.isStalemate() ? 'Stalemate' : chess.isThreefoldRepetition() ? 'Threefold repetition' : chess.isInsufficientMaterial() ? 'Insufficient material' : 'Fifty-move rule' }; break;
      }
      case 'resign': case 'offer-draw': case 'accept-draw': case 'decline-draw': {
        if (!color || !both || room.status !== 'active') throw new GameError('Only players in an active game can do that.');
        if (input.action === 'resign') room.result = { winner: room.players[color === 'w' ? 'b' : 'w'].id, reason: `${user.name} resigned` };
        if (input.action === 'offer-draw') { if (room.drawOffer) throw new GameError('A draw offer is already pending.'); room.drawOffer = user.id; }
        if (['accept-draw', 'decline-draw'].includes(input.action)) {
          if (!room.drawOffer || room.drawOffer === user.id) throw new GameError('There is no opponent draw offer to answer.');
          if (input.action === 'accept-draw') room.result = { winner: null, reason: 'Draw by agreement' }; room.drawOffer = null;
        } break;
      }
      case 'rematch': {
        if (!color || !room.result) throw new GameError('A rematch needs a finished game and both players.');
        if (room.rematch.includes(user.id)) throw new GameError('Waiting for your opponent to accept the rematch.');
        room.rematch.push(user.id);
        if (room.rematch.length === 2) {
          room.players = { w: room.players.b, b: room.players.w }; room.moves = []; room.result = null; room.drawOffer = null; room.rematch = []; room.ready = []; room.round++; room.status = 'ready';
          room.clocks = { w: room.settings.minutes * 60_000, b: room.settings.minutes * 60_000, runningSince: null };
        } break;
      }
      default: throw new GameError('Unknown game action.');
    }
    if (room.result && room.status !== 'finished') { room.clocks = { ...this.remaining(room, chess), runningSince: null }; room.status = 'finished'; }
    room.version++; this.save(room); return this.view(id, user.id);
  }
}
