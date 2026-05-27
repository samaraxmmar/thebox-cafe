'use strict';

/* Logger pino — propre, structuré.
   Tente pino-pretty en dev, retombe sur du JSON / console si indisponible. */

const isDev = process.env.NODE_ENV !== 'production';

let logger;
try {
  const pino = require('pino');

  const base = {
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    base:  { app: 'thebox' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (isDev) {
    // Tester si pino-pretty est dispo — sinon JSON nu
    let hasPretty = false;
    try { require.resolve('pino-pretty'); hasPretty = true; } catch (_) {}
    if (hasPretty) {
      logger = pino({
        ...base,
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,app' },
        },
      });
    } else {
      logger = pino(base);
    }
  } else {
    logger = pino(base);
  }
} catch (e) {
  // Si pino lui-même n'est pas dispo, on retombe sur console
  console.warn('[logger] pino indisponible:', e.message);
  logger = {
    info:  (...a) => console.log('[INFO]',  ...a),
    warn:  (...a) => console.warn('[WARN]', ...a),
    error: (...a) => console.error('[ERR]', ...a),
    debug: (...a) => isDev && console.log('[DBG]', ...a),
  };
}

module.exports = logger;
