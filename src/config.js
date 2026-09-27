// Factor III — Config. The only place that reads process.env.
// Every setting has a documented default in .env.example; nothing is read from
// files that vary per deploy, and the resulting object is frozen.

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

function int(name, value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, got "${value}"`);
  }
  return n;
}

export function loadConfig(env = process.env) {
  const logLevel = env.LOG_LEVEL || 'info';
  if (!LOG_LEVELS.includes(logLevel)) {
    throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${logLevel}"`);
  }

  return Object.freeze({
    serviceName: env.SERVICE_NAME || 'twelve-factor-health',
    // Factor VII — the port comes from the environment, never from code.
    port: int('PORT', env.PORT, 3000, { min: 0, max: 65535 }),
    host: env.HOST || '0.0.0.0',
    logLevel,
    // Factor IV — backing service located by URL only; empty means "not attached".
    redisUrl: env.REDIS_URL || '',
    // Factor IX — upper bound for draining in-flight requests on SIGTERM.
    shutdownTimeoutMs: int('SHUTDOWN_TIMEOUT_MS', env.SHUTDOWN_TIMEOUT_MS, 10000, { min: 0 }),
    // Factor V — release identity injected at build/release time, not computed at run time.
    release: env.RELEASE_VERSION || 'dev',
    nodeEnv: env.NODE_ENV || 'development',
  });
}
