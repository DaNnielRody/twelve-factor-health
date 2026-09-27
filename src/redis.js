// Factor IV — Backing services. Redis is an attached resource addressed only by
// REDIS_URL: swapping a local container for a managed instance is a config
// change, not a code change. With no URL the service runs detached.
import Redis from 'ioredis';

export function createRedis(url, log) {
  if (!url) return null;

  const client = new Redis(url, {
    lazyConnect: true,
    // Fail fast instead of queueing commands while the resource is away,
    // so /health reports the truth and requests do not hang.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  client.on('ready', () => log.info({ backingService: 'redis' }, 'backing service connected'));
  client.on('error', (err) => log.warn({ backingService: 'redis', err: err.message }, 'backing service error'));

  return client;
}

export async function pingRedis(client) {
  if (!client) return 'detached';
  try {
    return (await client.ping()) === 'PONG' ? 'up' : 'down';
  } catch {
    return 'down';
  }
}
