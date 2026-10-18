import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivityApp } from '../src/activity/app.js';

// Invoke real route handlers with mocked Discord transport; no HTTP listener or bot.
function setup({ users = ['verified-user'] } = {}) {
  const calls = [], mutations = [];
  const app = createActivityApp({ clientId: 'app-id', clientSecret: 'secret', botToken: 'bot-secret',
    store: { view: (id, user) => ({ id, user }), act: (id, user, input) => { mutations.push({ id, user, input }); return { ok: true }; } },
    service: { snapshot: s => ({ id: s.instanceId, user: s.user.id }), act: (s, input) => { mutations.push({ id: s.instanceId, user: s.user, input }); return { ok: true }; } },
    fetcher: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/oauth2/token')) return Response.json({ access_token: 'oauth-access-token' });
      if (url.endsWith('/users/@me')) return Response.json({ id: 'verified-user', username: 'Verified' });
      if (url.includes('/activity-instances/')) return Response.json({ users });
      throw new Error('Unexpected Discord request');
    },
  });
  function handler(path, method) { return app.router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle; }
  const authorize = app.router.stack.find(layer => layer.handle.name === 'authorizeRoom').handle;
  return { calls, mutations, handler, authorize };
}
async function run(handler, req) {
  let body, status = 200, error, passed = false;
  const res = { json: value => { body = value; }, status: value => { status = value; return res; } };
  await handler(req, res, e => { error = e; passed = !e; });
  return { body, status, error, passed };
}
test('Activity authentication binds server-verified identity and instance, ignoring client identity', async () => {
  const { handler, authorize, calls, mutations } = setup();
  const login = await run(handler('/api/session', 'post'), { body: { code: 'discord-code', instanceId: 'instance-1', user: { id: 'attacker' } } });
  assert.equal(login.error, undefined); assert.match(login.body.session, /^[a-f0-9]{64}$/);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer oauth-access-token');
  assert.equal(calls[2].options.headers.Authorization, 'Bot bot-secret');
  const req = { headers: { authorization: `Bearer ${login.body.session}` }, body: { action: 'seat', userId: 'attacker', instanceId: 'other-room' } };
  assert.equal((await run(authorize, req)).passed, true);
  await run(handler('/api/room', 'post'), req);
  assert.equal(mutations[0].id, 'instance-1'); assert.equal(mutations[0].user.id, 'verified-user');
});
test('Activity rejects users outside the Discord instance and unauthenticated gameplay', async () => {
  const { handler, authorize } = setup({ users: ['someone-else'] });
  const denied = await run(handler('/api/session', 'post'), { body: { code: 'code', instanceId: 'instance-1' } });
  assert.match(denied.error.message, /Join this Activity/); assert.equal(denied.body, undefined);
  const unauthorized = await run(authorize, { headers: {} });
  assert.equal(unauthorized.status, 401); assert.equal(unauthorized.passed, false);
});
test('Activity rejects malformed authorization before sending secrets to any transport', async () => {
  const { handler, calls } = setup();
  const denied = await run(handler('/api/session', 'post'), { body: { code: 'code', instanceId: '../other' } });
  assert.match(denied.error.message, /Invalid/); assert.equal(calls.length, 0);
});
