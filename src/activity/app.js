import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { GameError, RoomStore } from './rooms.js';
import { LobbyService } from './lobby.js';

export function createActivityApp({ clientId, clientSecret, botToken, dataDir, distDir = resolve('dist/activity'), fetcher = fetch, store = new RoomStore(dataDir), service = new LobbyService(store) }) {
  const app = express(), sessions = new Map();
  app.disable('x-powered-by');
  // cloudflared connects through localhost. Trust forwarded client addresses only from loopback proxies.
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '4kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const limit = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests. Please wait a minute.' } });
  app.use('/api', limit);
  app.get('/api/config', (req, res) => res.json({ clientId }));
  async function discord(path, authorization) {
    const response = await fetcher(`https://discord.com/api/v10${path}`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new GameError('Discord could not verify this session. Close and reopen the Activity.');
    return response.json();
  }
  async function verifyInstance(instance, userId) {
    const value = await discord(`/applications/${clientId}/activity-instances/${encodeURIComponent(instance)}`, `Bot ${botToken}`);
    if (!value.users?.includes(userId)) throw new GameError('Join this Activity in Discord before playing.');
  }
  app.post('/api/session', rateLimit({ windowMs: 60_000, limit: 20, message: { error: 'Too many sign-in attempts. Please wait a minute.' } }), async (req, res, next) => {
    try {
      const { code, instanceId } = req.body || {};
      if (typeof code !== 'string' || code.length > 512 || !code || typeof instanceId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(instanceId)) throw new GameError('Invalid Discord authorization request.');
      const response = await fetcher('https://discord.com/api/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code }), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new GameError('Discord sign-in expired. Close and reopen the Activity.');
      const token = await response.json();
      if (!token.access_token) throw new GameError('Discord did not return an access token.');
      const user = await discord('/users/@me', `Bearer ${token.access_token}`);
      await verifyInstance(instanceId, user.id);
      for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
      if (sessions.size >= 5000) throw new GameError('The server is busy. Please try again shortly.');
      const session = randomBytes(32).toString('hex');
      sessions.set(session, { user: { id: user.id, name: user.global_name || user.username, username: user.username }, instanceId, verified: Date.now(), expires: Date.now() + 30 * 60_000 });
      res.json({ session, access_token: token.access_token });
    } catch (error) { next(error); }
  });
  app.use('/api/room', async function authorizeRoom(req, res, next) {
    try {
      const session = sessions.get(req.headers.authorization?.replace(/^Bearer /, ''));
      if (!session || session.expires < Date.now()) return res.status(401).json({ error: 'Your session expired. Close and reopen the Activity.' });
      if (Date.now() - session.verified > 30_000) { await verifyInstance(session.instanceId, session.user.id); session.verified = Date.now(); }
      session.expires = Date.now() + 30 * 60_000;
      req.gameSession = session;
      next();
    } catch (error) { next(error); }
  });
  app.get('/api/room', (req, res) => res.json(service.snapshot(req.gameSession)));
  app.post('/api/room', (req, res) => res.json(service.act(req.gameSession, req.body || {})));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));
  app.use(express.static(distDir));
  app.use((error, req, res, next) => {
    if (error instanceof GameError) return res.status(400).json({ error: error.message });
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') return res.status(400).json({ error: 'Invalid request body.' });
    console.error('[activity]', error.name); // Never log OAuth responses or request headers.
    res.status(500).json({ error: 'The server could not complete this action. Please retry.' });
  });
  return app;
}
