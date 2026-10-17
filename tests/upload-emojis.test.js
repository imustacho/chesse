import test from 'node:test';
import assert from 'node:assert/strict';
import { Routes } from 'discord.js';
import { loadEmojiFiles, uploadApplicationEmojis } from '../scripts/upload-emojis.js';

test('all seven upload files are valid PNGs with stable emoji names', async () => {
  const emojis = await loadEmojiFiles();
  assert.equal(emojis.length, 7);
  assert.ok(emojis.some(e => e.name === 'chesse_crown'));
  for (const { name, png } of emojis) {
    assert.match(name, /^chesse_[a-z_]+$/);
    assert.ok(png.length < 256 * 1024);
  }
});

test('uploader uses only application endpoints and skips existing names', async () => {
  const calls = [];
  const rest = {
    get: async route => {
      calls.push(['GET', route]);
      return route === Routes.oauth2CurrentApplication() ? { id: '123' } : { items: [{ id: '1', name: 'chesse_play' }] };
    },
    post: async (route, options) => { calls.push(['POST', route, options.body]); },
  };
  const emojis = [{ name: 'chesse_play', png: Buffer.from('existing') }, { name: 'chesse_crown', png: Buffer.from('new') }];
  const result = await uploadApplicationEmojis({ rest, applicationId: '123', emojis, log: () => {} });
  assert.deepEqual(result, { created: 1, skipped: 1 });
  const posts = calls.filter(c => c[0] === 'POST');
  assert.equal(posts.length, 1);
  assert.equal(posts[0][1], '/applications/123/emojis');
  assert.equal(posts[0][2].name, 'chesse_crown');
  assert.equal(posts[0][2].image, 'data:image/png;base64,bmV3');
  assert.ok(calls.every(c => !c[1].includes('/guilds/')));
});

test('mismatched token/application prevents all uploads', async () => {
  let requests = 0;
  const rest = { get: async () => { requests++; return { id: '999' }; }, post: async () => assert.fail('Must not upload') };
  await assert.rejects(uploadApplicationEmojis({ rest, applicationId: '123', emojis: [] }), /different applications/);
  assert.equal(requests, 1);
});

test('partial failures stop cleanly without leaking API payloads', async () => {
  const rest = {
    get: async route => route === Routes.oauth2CurrentApplication() ? { id: '123' } : { items: [] },
    post: async () => { const error = new Error('secret token in raw error'); error.code = 50013; throw error; },
  };
  await assert.rejects(uploadApplicationEmojis({ rest, applicationId: '123', emojis: [{ name: 'chesse_play', png: Buffer.from('x') }], log: () => {} }), error => /chesse_play.*50013/.test(error.message) && !error.message.includes('secret token'));
});
