// HTTP surface of the service. Builds a Fastify instance from a config object
// and holds no request state in memory (Factor VI): anything that must outlive
// a request goes to the backing service.
import os from 'node:os';
import Fastify from 'fastify';
import { createRedis, pingRedis } from './redis.js';

const HITS_KEY = 'hits';
const startedAt = Date.now();

export function buildApp(config, { logger } = {}) {
  const app = Fastify({
    // Factor XI — logs are an event stream: one JSON object per line on stdout.
    // No files, no rotation; the environment decides where the stream goes.
    logger: logger ?? {
      level: config.logLevel,
      base: { service: config.serviceName, release: config.release, pid: process.pid, host: os.hostname() },
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      formatters: { level: (label) => ({ level: label }) },
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    // Factor IX — during close, new requests get 503 and idle keep-alive
    // sockets are dropped so the process can exit quickly.
    return503OnClosing: true,
    forceCloseConnections: 'idle',
  });

  const redis = createRedis(config.redisUrl, app.log);
  const state = { draining: false };

  app.decorate('redis', redis);
  app.decorate('lifecycle', state);

  app.addHook('onReady', async () => {
    if (redis) await redis.connect().catch((err) => app.log.warn({ err: err.message }, 'redis not reachable at boot'));
  });
  app.addHook('onClose', async () => {
    if (redis) await redis.quit().catch(() => redis.disconnect());
  });
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  app.get('/', async () => ({
    service: config.serviceName,
    release: config.release,
    endpoints: ['GET /health', 'GET /health/live', 'GET /api/hits', 'GET /api/work?ms=2000'],
  }));

  // Liveness: is the process able to answer at all? Never depends on backing services.
  app.get('/health/live', async () => ({ status: 'ok' }));

  // Readiness: should traffic be routed here? Fails while draining or when an
  // attached backing service is down.
  app.get('/health', async (_req, reply) => {
    const redisStatus = await pingRedis(redis);
    const status = state.draining ? 'draining' : redisStatus === 'down' ? 'degraded' : 'ok';
    reply.code(status === 'ok' ? 200 : 503);
    return {
      status,
      service: config.serviceName,
      release: config.release,
      instance: os.hostname(),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      checks: { redis: redisStatus },
    };
  });

  // Shared counter kept in Redis, so every replica sees the same number.
  app.get('/api/hits', async (req, reply) => {
    if (!redis) {
      reply.code(503);
      return { error: 'backing service not attached', hint: 'set REDIS_URL' };
    }
    let hits;
    try {
      hits = await redis.incr(HITS_KEY);
    } catch (err) {
      // The resource is attached but away: say so instead of leaking a 500.
      req.log.warn({ backingService: 'redis', err: err.message }, 'backing service unavailable');
      reply.code(503);
      return { error: 'backing service unavailable' };
    }
    req.log.info({ hits }, 'hit counted');
    return { hits, servedBy: os.hostname(), pid: process.pid };
  });

  // Simulated slow request, used to show that SIGTERM drains in-flight work.
  app.get('/api/work', {
    schema: { querystring: { type: 'object', properties: { ms: { type: 'integer', minimum: 0, maximum: 30000, default: 2000 } } } },
  }, async (req) => {
    const { ms } = req.query;
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { done: true, tookMs: ms, servedBy: os.hostname(), pid: process.pid };
  });

  return app;
}
