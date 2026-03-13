/**
 * @nakraniprakash/slack-logger-core
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared logic used by slack-logger-node and slack-logger-react.
 * Not intended for direct installation.
 *
 * Responsibilities:
 *  - Store global config (project, environment, channel map)
 *  - Format error payloads into Slack Block Kit messages
 *  - Send HTTP POST to the correct Slack webhook URL
 */

'use strict';

// ── Global config store ───────────────────────────────────────────────────────

/** @type {SlackLoggerConfig} */
let _config = null;

/**
 * @typedef {Object} SlackLoggerConfig
 * @property {string} project - Project name e.g. 'networth-tracker'
 * @property {'production'|'staging'|'development'} environment
 * @property {Record<string, string>} channels - Map of channel name → Slack webhook URL
 * @property {string} defaultChannel - Fallback channel if none specified
 */

/**
 * Initialise the logger. Call once at app startup.
 * @param {SlackLoggerConfig} config
 */
function init(config) {
  if (!config.project) throw new Error('[slack-logger] project is required');
  if (!config.channels || Object.keys(config.channels).length === 0) {
    throw new Error('[slack-logger] at least one channel is required');
  }
  if (!config.defaultChannel) throw new Error('[slack-logger] defaultChannel is required');
  if (!config.channels[config.defaultChannel]) {
    throw new Error(`[slack-logger] defaultChannel "${config.defaultChannel}" not found in channels map`);
  }

  _config = {
    project: config.project,
    environment: config.environment || 'production',
    channels: config.channels,
    defaultChannel: config.defaultChannel,
  };
}

/**
 * Get current config — throws if not initialised.
 * @returns {SlackLoggerConfig}
 */
function getConfig() {
  if (!_config) throw new Error('[slack-logger] Not initialised. Call init() first.');
  return _config;
}

// ── Severity levels ───────────────────────────────────────────────────────────

const LEVEL_EMOJI = {
  error:   '🔴',
  warn:    '🟡',
  info:    '🔵',
  debug:   '⚪',
};

const LEVEL_COLOR = {
  error:   '#E53E3E',
  warn:    '#DD6B20',
  info:    '#3182CE',
  debug:   '#718096',
};

// ── Slack Block Kit formatter ─────────────────────────────────────────────────

/**
 * @typedef {Object} LogContext
 * @property {string} [channel] - Override which Slack channel to post to
 * @property {string} [userId] - Authenticated user ID
 * @property {string} [userEmail] - Authenticated user email
 * @property {string} [url] - Request URL or page URL
 * @property {string} [method] - HTTP method
 * @property {number} [statusCode] - HTTP status code
 * @property {Record<string, any>} [extra] - Any additional key/value pairs
 */

/**
 * Build a Slack Block Kit payload from an error + context.
 * @param {'error'|'warn'|'info'|'debug'} level
 * @param {string} message
 * @param {Error|null} error
 * @param {LogContext} context
 * @returns {object} Slack API payload
 */
function buildSlackPayload(level, message, error, context = {}) {
  const config = getConfig();
  const emoji  = LEVEL_EMOJI[level] || '⚪';
  const color  = LEVEL_COLOR[level] || '#718096';
  const env    = config.environment.toUpperCase();
  const now    = new Date().toISOString();

  // Header text
  const headerText = `${emoji} *[${config.project}] [${env}] ${message}*`;

  // Build fields
  const fields = [
    { type: 'mrkdwn', text: `*Level:*\n${level.toUpperCase()}` },
    { type: 'mrkdwn', text: `*Time:*\n${now}` },
    { type: 'mrkdwn', text: `*Project:*\n${config.project}` },
    { type: 'mrkdwn', text: `*Environment:*\n${env}` },
  ];

  if (context.url) {
    fields.push({ type: 'mrkdwn', text: `*URL:*\n${context.url}` });
  }
  if (context.method || context.statusCode) {
    fields.push({
      type: 'mrkdwn',
      text: `*Request:*\n${context.method || ''} ${context.statusCode ? `(${context.statusCode})` : ''}`.trim(),
    });
  }
  if (context.userId || context.userEmail) {
    fields.push({
      type: 'mrkdwn',
      text: `*User:*\n${context.userEmail || context.userId}`,
    });
  }

  // Extra context fields
  if (context.extra && typeof context.extra === 'object') {
    Object.entries(context.extra).forEach(([key, value]) => {
      fields.push({
        type: 'mrkdwn',
        text: `*${key}:*\n${JSON.stringify(value)}`,
      });
    });
  }

  // Blocks
  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: headerText },
    },
    {
      type: 'section',
      fields: fields.slice(0, 10), // Slack max 10 fields per section
    },
  ];

  // Stacktrace block
  if (error?.stack) {
    const stack = error.stack.length > 2900
      ? error.stack.substring(0, 2900) + '\n... (truncated)'
      : error.stack;

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Stacktrace:*\n\`\`\`${stack}\`\`\``,
      },
    });
  }

  blocks.push({ type: 'divider' });

  return {
    attachments: [
      {
        color,
        blocks,
        fallback: `[${config.project}] ${level.toUpperCase()}: ${message}`,
      },
    ],
  };
}

// ── HTTP sender ───────────────────────────────────────────────────────────────

/**
 * Resolve the webhook URL for a given channel name.
 * Falls back to defaultChannel if channel not found.
 * @param {string|undefined} channel
 * @returns {string} webhook URL
 */
function resolveWebhookUrl(channel) {
  const config = getConfig();
  const name   = channel || config.defaultChannel;
  const url    = config.channels[name] || config.channels[config.defaultChannel];
  if (!url) throw new Error(`[slack-logger] No webhook URL found for channel "${name}"`);
  return url;
}

/**
 * Send a payload to Slack. Works in both Node.js and browser environments.
 * Fire-and-forget — never throws, logs to console.error on failure.
 * @param {string} webhookUrl
 * @param {object} payload
 */
async function sendToSlack(webhookUrl, payload) {
  try {
    // Use fetch (Node 18+ / browsers) or fall back to https module
    if (typeof fetch !== 'undefined') {
      await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    } else {
      // Node < 18 fallback using built-in https
      const https = require('https');
      const body  = JSON.stringify(payload);
      const url   = new URL(webhookUrl);

      await new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: url.hostname,
            path:     url.pathname + url.search,
            method:   'POST',
            headers: {
              'Content-Type':   'application/json',
              'Content-Length': Buffer.byteLength(body),
            },
          },
          (res) => {
            res.on('data', () => {});
            res.on('end', resolve);
          }
        );
        req.on('error', reject);
        req.write(body);
        req.end();
      });
    }
  } catch (err) {
    // Never crash the app because logging failed
    console.error('[slack-logger] Failed to send to Slack:', err.message);
  }
}

// ── Main log function ─────────────────────────────────────────────────────────

/**
 * Core log function. Used internally by slack-logger-node and slack-logger-react.
 * @param {'error'|'warn'|'info'|'debug'} level
 * @param {string} message
 * @param {Error|null} error
 * @param {LogContext} context
 */
async function log(level, message, error = null, context = {}) {
  // Skip if not initialised — fail silently so app doesn't crash
  if (!_config) {
    console.warn('[slack-logger] Not initialised. Call init() before logging.');
    return;
  }

  // Only send to Slack in production/staging by default
  if (_config.environment === 'development' && !context.forceSend) {
    console.log(`[slack-logger] [${level.toUpperCase()}] ${message}`, error || '');
    return;
  }

  const webhookUrl = resolveWebhookUrl(context.channel);
  const payload    = buildSlackPayload(level, message, error, context);

  // Fire and forget — don't await in the calling code's hot path
  sendToSlack(webhookUrl, payload);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = { init, getConfig, log, resolveWebhookUrl, buildSlackPayload, sendToSlack };
