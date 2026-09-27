#!/usr/bin/env node
// Factor XII — Admin processes. One-off tasks ship in the same codebase and
// release as the web process and read the same config, so they cannot drift.
//
//   node bin/admin.js check        validate config and reach backing services (release phase)
//   node bin/admin.js config       print the effective config, secrets redacted
//   node bin/admin.js reset-hits   zero the shared counter in Redis
import { loadConfig } from '../src/config.js';
import { createRedis, pingRedis } from '../src/redis.js';

const log = {
  info: (obj, msg) => console.log(JSON.stringify({ level: 'info', task: command, ...obj, msg })),
  warn: (obj, msg) => console.log(JSON.stringify({ level: 'warn', task: command, ...obj, msg })),
  error: (obj, msg) => console.error(JSON.stringify({ level: 'error', task: command, ...obj, msg })),
};

const command = process.argv[2];

function redact(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '<invalid url>';
  }
}

async function withRedis(config, fn) {
  const redis = createRedis(config.redisUrl, log);
  if (!redis) return fn(null);
  try {
    await redis.connect();
    return await fn(redis);
  } finally {
    redis.disconnect();
  }
}

const tasks = {
  async check() {
    const config = loadConfig();
    const redis = await withRedis(config, pingRedis).catch(() => 'down');
    log.info({ port: config.port, release: config.release, redis }, 'config loaded');
    if (redis === 'down') {
      log.error({ redisUrl: redact(config.redisUrl) }, 'backing service unreachable');
      return 1;
    }
    return 0;
  },

  async config() {
    const config = loadConfig();
    log.info({ config: { ...config, redisUrl: redact(config.redisUrl) } }, 'effective config');
    return 0;
  },

  async 'reset-hits'() {
    const config = loadConfig();
    if (!config.redisUrl) {
      log.error({}, 'REDIS_URL not set, nothing to reset');
      return 1;
    }
    const previous = await withRedis(config, (r) => r.getset('hits', '0'));
    log.info({ previous: Number(previous ?? 0) }, 'hits counter reset');
    return 0;
  },
};

if (!tasks[command]) {
  console.error(`usage: node bin/admin.js <${Object.keys(tasks).join('|')}>`);
  process.exit(64); // EX_USAGE
}

try {
  process.exitCode = await tasks[command]();
} catch (err) {
  log.error({ err: err.message }, 'task failed');
  process.exitCode = 1;
}
