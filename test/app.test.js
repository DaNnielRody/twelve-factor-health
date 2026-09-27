import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({ LOG_LEVEL: 'silent', RELEASE_VERSION: 'test' });

test('GET /health returns ok JSON when no backing service is attached', async (t) => {
  const app = buildApp(config);
  t.after(() => app.close());
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /application\/json/);
  const body = res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.release, 'test');
  assert.equal(body.checks.redis, 'detached');
  assert.ok(res.headers['x-request-id']);
});

test('GET /health returns 503 while draining', async (t) => {
  const app = buildApp(config);
  t.after(() => app.close());
  app.lifecycle.draining = true;
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().status, 'draining');
});

test('GET /health/live does not depend on backing services', async (t) => {
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent', REDIS_URL: 'redis://127.0.0.1:1' }));
  t.after(() => app.close());
  const res = await app.inject({ method: 'GET', url: '/health/live' });
  assert.equal(res.statusCode, 200);
});

test('GET /health reports degraded when Redis is attached but unreachable', async (t) => {
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent', REDIS_URL: 'redis://127.0.0.1:1' }));
  t.after(() => app.close());
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().checks.redis, 'down');
});

test('GET /api/hits refuses to keep state in memory without Redis', async (t) => {
  const app = buildApp(config);
  t.after(() => app.close());
  const res = await app.inject({ method: 'GET', url: '/api/hits' });
  assert.equal(res.statusCode, 503);
});

test('config reads PORT from the environment and rejects bad values', () => {
  assert.equal(loadConfig({}).port, 3000);
  assert.equal(loadConfig({ PORT: '8080' }).port, 8080);
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
  assert.throws(() => loadConfig({ LOG_LEVEL: 'loud' }), /LOG_LEVEL/);
});
