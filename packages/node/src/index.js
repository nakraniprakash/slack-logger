/**
 * @nakraniprakash/slack-logger-node
 * ─────────────────────────────────────────────────────────────────────────────
 * Slack error logger for Node.js / Express backends.
 *
 * Usage:
 *
 *   const { initLogger, logger, errorMiddleware } = require('@nakraniprakash/slack-logger-node')
 *
 *   initLogger({
 *     project: 'networth-tracker',
 *     environment: process.env.NODE_ENV,
 *     channels: {
 *       backend:  'https://hooks.slack.com/services/...',
 *       payments: 'https://hooks.slack.com/services/...',
 *     },
 *     defaultChannel: 'backend',
 *   })
 *
 *   // Manual logging
 *   logger.error('DB connection failed', err)
 *   logger.error('Payment failed', err, { channel: 'payments', userId: 123 })
 *   logger.warn('High memory usage', null, { extra: { memoryMB: 512 } })
 *
 *   // Express global error middleware (add after all routes)
 *   app.use(errorMiddleware)
 */

'use strict';

const core = require('@prakashnakrani/slack-logger-core');

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Initialise the logger. Call once at app startup before any routes.
 * @param {import('@prakashnakrani/slack-logger-core').SlackLoggerConfig} config
 */
function initLogger(config) {
  core.init(config);
}

// ── Manual logger ─────────────────────────────────────────────────────────────

/**
 * Manual logger for use anywhere in your Node.js code.
 *
 * @example
 * logger.error('Something broke', err)
 * logger.error('Payment failed', err, { channel: 'payments', userId: req.user.id })
 * logger.warn('Slow query', null, { extra: { queryMs: 3200 } })
 * logger.info('User signed up', null, { userEmail: 'foo@bar.com' })
 */
const logger = {
  /**
   * @param {string} message
   * @param {Error|null} [error]
   * @param {import('@prakashnakrani/slack-logger-core').LogContext} [context]
   */
  error: (message, error = null, context = {}) => core.log('error', message, error, context),
  warn:  (message, error = null, context = {}) => core.log('warn',  message, error, context),
  info:  (message, error = null, context = {}) => core.log('info',  message, error, context),
  debug: (message, error = null, context = {}) => core.log('debug', message, error, context),
};

// ── Express error middleware ───────────────────────────────────────────────────

/**
 * Express global error middleware.
 * Catches all errors passed via next(err) and sends them to Slack.
 *
 * IMPORTANT: Must be registered AFTER all routes and other middleware:
 *   app.use(errorMiddleware)
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function errorMiddleware(err, req, res, next) {
  // Build context from request
  const context = {
    url:        req.originalUrl || req.url,
    method:     req.method,
    statusCode: err.statusCode || err.status || 500,
    userId:     req.user?.id,
    userEmail:  req.user?.email,
    extra: {
      body:    sanitizeBody(req.body),
      headers: sanitizeHeaders(req.headers),
    },
  };

  // Fire and forget — don't block the response
  core.log('error', err.message || 'Unhandled server error', err, context);

  // Pass to default Express error handler
  next(err);
}

// ── Unhandled rejection / exception catchers ──────────────────────────────────

/**
 * Attach global process-level error catchers.
 * Call once at app startup after initLogger().
 *
 * Catches:
 *  - unhandledRejection  (unhandled Promise rejections)
 *  - uncaughtException   (synchronous throws that escaped try/catch)
 *
 * @param {object} [options]
 * @param {string} [options.channel] - Which Slack channel to route these to
 */
function attachProcessHandlers(options = {}) {
  const channel = options.channel;

  process.on('unhandledRejection', (reason) => {
    const error   = reason instanceof Error ? reason : new Error(String(reason));
    const message = `Unhandled Promise Rejection: ${error.message}`;
    core.log('error', message, error, { channel });
  });

  process.on('uncaughtException', (error) => {
    const message = `Uncaught Exception: ${error.message}`;
    core.log('error', message, error, { channel });
    // Don't exit — let your process manager handle restarts
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Remove sensitive fields from request body before logging */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const SENSITIVE = ['password', 'token', 'secret', 'authorization', 'card', 'cvv', 'ssn'];
  const sanitized = { ...body };
  SENSITIVE.forEach(key => {
    if (sanitized[key]) sanitized[key] = '[REDACTED]';
  });
  return sanitized;
}

/** Remove sensitive headers before logging */
function sanitizeHeaders(headers) {
  if (!headers) return {};
  const { authorization, cookie, ...safe } = headers;
  return safe;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  initLogger,
  logger,
  errorMiddleware,
  attachProcessHandlers,
};
