import { randomUUID, randomBytes } from 'node:crypto';
import { GameError, profile, validateSettings } from './rooms.js';

export class LobbyService {
  constructor(store, { now = Date.now } = {}) { this.store = store; this.now = now; this.presence = new Map(); this.locations = new Map(); this.queue = new Map(); }
  touch(session) {
    this.presence.set(`${session.user.id}:${session.instanceId}`, { user: profile(session.user), instanceId: session.instanceId, seen: this.now() });
    for (const [id, p] of this.presence) if (this.now() - p.seen > 20_000) this.presence.delete(id);
    for (const [id, entry] of this.queue) if (![...this.presence.values()].some(p => p.user.id === id && p.instanceId === entry.instanceId)) this.queue.delete(id);
  }
  playersRoom(id) {
    const candidate = this.store.list().find(r => !['finished', 'closed'].includes(r.status) && Object.values(r.players).some(p => p?.id === id));
    if (!candidate) return null;
    const current = this.store.view(candidate.id, id);
    return ['finished', 'closed'].includes(current.status) ? null : this.store.load(candidate.id);
  }
  available(id) { if (this.playersRoom(id)) throw new GameError('Leave your waiting room or finish your current match first.'); }
  people(instanceId) { return [...new Map([...this.presence.values()].filter(p => p.instanceId === instanceId).map(p => [p.user.id, { ...p.user, busy: !!this.playersRoom(p.user.id), searching: this.queue.has(p.user.id) }])).values()]; }
  viewers(id) { return [...new Map([...this.presence.values()].filter(p => this.locations.get(p.user.id) === id).map(p => [p.user.id, p.user])).values()].filter(u => !Object.values(this.store.load(id).players).some(p => p?.id === u.id)); }
  snapshot(session) {
    this.touch(session);
    const user = session.user, live = this.playersRoom(user.id);
    if (live && !this.locations.has(user.id)) this.locations.set(user.id, live.id);
    const id = this.locations.get(user.id); let room;
    if (id) {
      room = this.store.view(id, user.id);
      const seated = Object.values(room.players).some(p => p?.id === user.id);
      if (room.status === 'closed' || (!seated && !room.settings.allowSpectators)) { this.locations.delete(user.id); room = null; }
    }
    const list = this.store.list();
    const rooms = list.filter(r => r.status !== 'closed' && (r.settings.visibility === 'public' || r.homeInstanceId === session.instanceId) && [...this.presence.values()].some(p => Object.values(r.players).some(player => player?.id === p.user.id))).slice(-40)
      .map(r => { const game = this.store.view(r.id, user.id); return { id: r.id, name: r.name, mode: r.mode, players: r.players, status: game.status, settings: r.settings, reserved: !!r.invitedUserId, spectators: this.viewers(r.id).length }; });
    const invites = list.filter(r => r.status === 'waiting' && r.invitedUserId === user.id).map(r => ({ id: r.id, host: Object.values(r.players).find(p => p?.id === r.hostId), settings: r.settings, name: r.name }));
    const search = this.queue.get(user.id);
    return { screen: room ? 'room' : 'lobby', me: profile(user), room: room ? { ...room, spectators: this.viewers(room.id), online: [...new Set([...this.presence.values()].map(p => p.user.id))].filter(id => Object.values(room.players).some(p => p?.id === id)) } : null, participants: this.people(session.instanceId), rooms, invites, search: search ? { since: search.since, settings: search.settings, scope: search.scope, queueSize: [...this.queue.values()].filter(e => e.scope === search.scope && (search.scope !== 'local' || e.instanceId === search.instanceId)).length } : null };
  }
  create(session, input) {
    this.available(session.user.id); const settings = validateSettings(input.settings); let friend;
    if (input.friendId) {
      friend = this.people(session.instanceId).find(p => p.id === input.friendId && p.id !== session.user.id);
      if (!friend || friend.busy || friend.searching) throw new GameError('Choose an available friend in this Activity.');
    }
    const id = randomUUID();
    this.store.create(id, { hostId: session.user.id, homeInstanceId: session.instanceId, name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 40) : `${session.user.name}'s table`, code: randomBytes(4).toString('hex').toUpperCase(), mode: 'friends', settings, players: { w: profile(session.user), b: null }, invitedUserId: friend?.id || null });
    this.queue.delete(session.user.id); this.locations.set(session.user.id, id);
  }
  find(session, input, scope = 'global') {
    this.available(session.user.id);
    // The one-click room queue always starts from shared defaults, so no settings mismatch can strand room mates.
    const settings = validateSettings(scope === 'local' ? { visibility: 'private' } : { ...input.settings, visibility: 'public' });
    const other = [...this.queue.values()].find(e => e.user.id !== session.user.id && e.scope === scope && (scope !== 'local' || e.instanceId === session.instanceId) && e.settings.minutes === settings.minutes && e.settings.increment === settings.increment && e.settings.allowSpectators === settings.allowSpectators);
    if (!other) { this.queue.set(session.user.id, { user: profile(session.user), instanceId: session.instanceId, scope, settings, since: this.now() }); return; }
    const id = randomUUID();
    this.store.create(id, { hostId: other.user.id, homeInstanceId: other.instanceId, mode: scope === 'local' ? 'local' : 'multiplayer', name: `${other.user.name} vs ${session.user.name}`, code: randomBytes(4).toString('hex').toUpperCase(), settings, status: 'ready', players: { w: other.user, b: profile(session.user) } });
    this.queue.delete(other.user.id); this.queue.delete(session.user.id); this.locations.set(other.user.id, id); this.locations.set(session.user.id, id);
  }
  join(session, input, watching) {
    const r = input.code ? this.store.list().find(r => r.code === String(input.code).trim().toUpperCase()) : this.store.list().find(r => r.id === input.roomId);
    if (!r || r.status === 'closed') throw new GameError('That room could not be found. Check the room code.');
    const own = Object.values(r.players).some(p => p?.id === session.user.id);
    const occupied = this.playersRoom(session.user.id);
    if (occupied && occupied.id !== r.id) throw new GameError('Leave your waiting room or finish your current match first.');
    if (!own && r.settings.visibility !== 'public' && r.homeInstanceId !== session.instanceId && r.invitedUserId !== session.user.id && !input.code) throw new GameError('A private room requires its room code or a personal invitation.');
    if (watching && !own && !r.settings.allowSpectators) throw new GameError('Spectators are disabled for this room.');
    if (!watching && !own) {
      if (r.mode === 'multiplayer') throw new GameError('These seats belong to the matched players. You can watch instead.');
      this.store.act(r.id, session.user, { action: 'seat', color: r.players.w ? 'b' : 'w', version: r.version });
    }
    this.queue.delete(session.user.id); this.locations.set(session.user.id, r.id);
  }
  act(session, input) {
    this.touch(session);
    switch (input.action) {
      case 'create-room': this.create(session, input); break;
      case 'find-players': this.find(session, input); break;
      case 'find-local': this.find(session, input, 'local'); break;
      case 'cancel-search': this.queue.delete(session.user.id); break;
      case 'join-room': case 'accept-invite': this.join(session, input, false); break;
      case 'watch-room': this.join(session, input, true); break;
      case 'decline-invite': {
        const r = this.store.list().find(r => r.id === input.roomId && r.invitedUserId === session.user.id);
        if (!r) throw new GameError('That invitation is no longer available.');
        this.store.act(r.id, session.user, { action: 'decline-invite', version: r.version }); break;
      }
      case 'return-lobby': {
        const id = this.locations.get(session.user.id);
        if (id) {
          const r = this.store.load(id), seated = Object.values(r.players).some(p => p?.id === session.user.id);
          if (seated && r.status === 'active') throw new GameError('Resign or finish the match before returning to the lobby.');
          if (seated && ['waiting', 'ready'].includes(r.status)) this.store.act(id, session.user, { action: 'leave', version: r.version });
        }
        this.locations.delete(session.user.id); break;
      }
      default: {
        const id = this.locations.get(session.user.id); if (!id) throw new GameError('Join a room before taking a game action.');
        if (input.action === 'invite' && input.invitedUserId && !this.people(session.instanceId).some(p => p.id === input.invitedUserId && p.id !== session.user.id && !p.busy && !p.searching)) throw new GameError('Choose an available friend in this Activity.');
        if (input.action === 'rematch' && Object.values(this.store.load(id).players).some(p => { const occupied = p && this.playersRoom(p.id); return occupied && occupied.id !== id; })) throw new GameError('A player has joined another room. Return to the lobby for a new game.');
        if (!['ready', 'settings', 'invite', 'move', 'resign', 'offer-draw', 'accept-draw', 'decline-draw', 'rematch'].includes(input.action)) throw new GameError('Unknown game action.');
        this.store.act(id, session.user, input);
      }
    }
    return this.snapshot(session);
  }
}
