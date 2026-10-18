import 'dotenv/config';
import { resolve } from 'node:path';
import { mkdirSync, openSync, closeSync, unlinkSync, existsSync } from 'node:fs';
import { createActivityApp } from './app.js';

for (const key of ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_TOKEN']) {
  if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
}
if (!existsSync(resolve('dist/activity/index.html'))) throw new Error('Build the Activity first: npm run activity:build');
const dataDir = resolve(process.env.ACTIVITY_DATA_DIR || 'data/activity');
mkdirSync(dataDir, { recursive: true });
const lockPath = resolve(dataDir, 'server.lock');
let lock;
try { lock = openSync(lockPath, 'wx'); } catch { throw new Error('Activity data is locked. Stop the other server first. After a crash, remove data/activity/server.lock only after confirming no Activity server is running.'); }
process.on('exit', () => { closeSync(lock); unlinkSync(lockPath); });
const app = createActivityApp({ clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET, botToken: process.env.DISCORD_TOKEN, dataDir });
const server = app.listen(Number(process.env.ACTIVITY_PORT || 3001), process.env.ACTIVITY_HOST || '127.0.0.1', () => console.log('chesse Activity server is ready.'));
server.on('error', error => { console.error(`Activity could not listen: ${error.code}`); process.exit(1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
