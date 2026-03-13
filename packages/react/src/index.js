/**
 * @nakraniprakash/slack-logger-react
 * ─────────────────────────────────────────────────────────────────────────────
 * Slack error logger for React (web), Next.js and React Native.
 *
 * Usage:
 *
 *   import { initLogger, logger, SlackErrorBoundary } from '@nakraniprakash/slack-logger-react'
 *
 *   // 1. Initialise once at app root (e.g. _app.jsx, App.js, index.js)
 *   initLogger({
 *     project: 'networth-tracker',
 *     environment: process.env.NODE_ENV,
 *     channels: {
 *       frontend: 'https://hooks.slack.com/services/...',
 *       payments: 'https://hooks.slack.com/services/...',
 *     },
 *     defaultChannel: 'frontend',
 *   })
 *
 *   // 2. Wrap your app with the ErrorBoundary
 *   <SlackErrorBoundary>
 *     <App />
 *   </SlackErrorBoundary>
 *
 *   // 3. Manual logging anywhere
 *   logger.error('Payment screen crashed', err)
 *   logger.error('API call failed', err, { channel: 'payments', url: '/checkout' })
 */

const React = require('react');
const core  = require('@nakraniprakash/slack-logger-core');

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Initialise the logger. Call once at app root before rendering.
 * Also attaches global error handlers for uncaught errors.
 * @param {import('@nakraniprakash/slack-logger-core').SlackLoggerConfig} config
 */
function initLogger(config) {
  core.init(config);
  attachGlobalHandlers();
}

// ── Manual logger ─────────────────────────────────────────────────────────────

/**
 * Manual logger for use anywhere in your React / React Native code.
 *
 * @example
 * logger.error('Payment failed', err)
 * logger.error('API call failed', err, { channel: 'payments', url: '/checkout' })
 * logger.warn('Slow render', null, { extra: { componentName: 'Dashboard' } })
 */
const logger = {
  /**
   * @param {string} message
   * @param {Error|null} [error]
   * @param {import('@nakraniprakash/slack-logger-core').LogContext} [context]
   */
  error: (message, error = null, context = {}) => core.log('error', message, error, context),
  warn:  (message, error = null, context = {}) => core.log('warn',  message, error, context),
  info:  (message, error = null, context = {}) => core.log('info',  message, error, context),
  debug: (message, error = null, context = {}) => core.log('debug', message, error, context),
};

// ── Global error handlers ─────────────────────────────────────────────────────

/**
 * Attach global uncaught error handlers.
 * Auto-detected: browser vs React Native.
 * Called automatically by initLogger().
 */
function attachGlobalHandlers() {
  // ── Browser: window.onerror + unhandledrejection ──────────────────────────
  if (typeof window !== 'undefined') {
    // Synchronous JS errors
    window.onerror = (message, source, lineno, colno, error) => {
      const err = error || new Error(String(message));
      core.log('error', `Uncaught Error: ${err.message}`, err, {
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        extra: { source, lineno, colno },
      });
      return false; // Don't suppress default browser error handling
    };

    // Unhandled Promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error   = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));
      core.log('error', `Unhandled Promise Rejection: ${error.message}`, error, {
        url: window.location.href,
      });
    });

  // ── React Native: ErrorUtils global handler ───────────────────────────────
  } else if (typeof ErrorUtils !== 'undefined') {
    const previousHandler = ErrorUtils.getGlobalHandler();

    ErrorUtils.setGlobalHandler((error, isFatal) => {
      core.log('error', `${isFatal ? 'FATAL: ' : ''}${error.message}`, error, {
        extra: { isFatal },
      });

      // Call the previous handler (default React Native red screen / crash reporter)
      if (previousHandler) previousHandler(error, isFatal);
    });
  }
}

// ── React ErrorBoundary ───────────────────────────────────────────────────────

/**
 * React ErrorBoundary component.
 * Catches render errors in the component tree and sends them to Slack.
 *
 * @example
 * // Wrap your entire app:
 * <SlackErrorBoundary>
 *   <App />
 * </SlackErrorBoundary>
 *
 * // Or wrap specific sections with a custom channel:
 * <SlackErrorBoundary channel="payments" fallback={<p>Payment failed</p>}>
 *   <CheckoutFlow />
 * </SlackErrorBoundary>
 *
 * Props:
 *  - channel {string}        - Which Slack channel to post to (optional, uses defaultChannel)
 *  - fallback {ReactNode}    - UI to render when an error is caught (optional)
 *  - onError {function}      - Callback(error, errorInfo) for custom handling (optional)
 */
class SlackErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    core.log('error', `React render error: ${error.message}`, error, {
      channel: this.props.channel,
      url:     typeof window !== 'undefined' ? window.location.href : undefined,
      extra:   { componentStack: errorInfo.componentStack },
    });

    if (typeof this.props.onError === 'function') {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      // Default fallback UI
      return React.createElement(
        'div',
        {
          style: {
            padding: '24px',
            textAlign: 'center',
            color: '#E53E3E',
          },
        },
        React.createElement('p', null, 'Something went wrong. Please refresh the page.')
      );
    }

    return this.props.children;
  }
}

// ── Next.js helper ────────────────────────────────────────────────────────────

/**
 * Wrap Next.js _app.jsx to add global error tracking.
 * Use this instead of manually calling initLogger + SlackErrorBoundary.
 *
 * @example
 * // pages/_app.jsx
 * import { withSlackLogger } from '@nakraniprakash/slack-logger-react'
 *
 * function MyApp({ Component, pageProps }) {
 *   return <Component {...pageProps} />
 * }
 *
 * export default withSlackLogger(MyApp, {
 *   project: 'networth-tracker',
 *   environment: process.env.NODE_ENV,
 *   channels: {
 *     frontend: 'https://hooks.slack.com/services/...',
 *   },
 *   defaultChannel: 'frontend',
 * })
 *
 * @param {React.ComponentType} AppComponent
 * @param {import('@nakraniprakash/slack-logger-core').SlackLoggerConfig} config
 */
function withSlackLogger(AppComponent, config) {
  // Init once
  core.init(config);
  attachGlobalHandlers();

  function WrappedApp(props) {
    return React.createElement(
      SlackErrorBoundary,
      null,
      React.createElement(AppComponent, props)
    );
  }

  WrappedApp.displayName = `withSlackLogger(${AppComponent.displayName || AppComponent.name || 'App'})`;

  // Preserve Next.js static methods
  if (AppComponent.getInitialProps) {
    WrappedApp.getInitialProps = AppComponent.getInitialProps;
  }

  return WrappedApp;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  initLogger,
  logger,
  SlackErrorBoundary,
  withSlackLogger,
  attachGlobalHandlers,
};
