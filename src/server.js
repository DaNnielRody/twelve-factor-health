// Process entry point (the `web` process type in the Procfile).
// Factor VII: binds to $PORT and exports HTTP itself — no external web server.
// Factor IX: fast start, graceful stop on SIGTERM/SIGINT.
import { loadConfig } from './config.js';
import { buildApp } from './app.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  // Config errors are fatal and reported on stderr before a logger exists.
  console.error(JSON.stringify({ level: 'fatal', msg: 'invalid configuration', err: err.message }));
  process.exit(78); // EX_CONFIG
}

const app = buildApp(config);

async function shutdown(signal) {
  if (app.lifecycle.draining) return;
  app.lifecycle.draining = true;
  const t0 = Date.now();
  app.log.info({ signal, timeoutMs: config.shutdownTimeoutMs }, 'shutdown signal received, draining');

  // Hard stop if draining takes longer than allowed; the platform will
  // SIGKILL us anyway, better to say why first.
  const killer = setTimeout(() => {
    app.log.error({ signal }, 'shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, config.shutdownTimeoutMs);
  killer.unref();

  try {
    await app.close(); // stops accepting, waits for in-flight requests, runs onClose hooks
    app.log.info({ signal, drainMs: Date.now() - t0 }, 'shutdown complete');
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  app.log.fatal({ err }, 'unhandled rejection');
  process.exit(1);
});

try {
  const address = await app.listen({ port: config.port, host: config.host });
  app.log.info({ address, port: config.port, nodeEnv: config.nodeEnv, redis: Boolean(config.redisUrl) }, 'service started');
} catch (err) {
  app.log.fatal({ err }, 'failed to bind port');
  process.exit(1);
}
