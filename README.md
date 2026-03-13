# slack-logger

Modular Slack error logging for Node.js, React, Next.js and React Native.

## Packages

| Package | Use for |
|---|---|
| `@nakraniprakash/slack-logger-node` | Node.js / Express backends |
| `@nakraniprakash/slack-logger-react` | React, Next.js, React Native |

> `@nakraniprakash/slack-logger-core` is an internal dependency — never install directly.

---

## Installation

```bash
# Backend
npm install @nakraniprakash/slack-logger-node

# Frontend
npm install @nakraniprakash/slack-logger-react
```

Add to `.npmrc` in your project:
```
@nakraniprakash:registry=https://npm.pkg.github.com
```

---

## Backend usage (Node.js / Express)

```js
const {
  initLogger,
  logger,
  errorMiddleware,
  attachProcessHandlers,
} = require('@nakraniprakash/slack-logger-node')

// 1. Init once at app startup
initLogger({
  project: 'networth-tracker',
  environment: process.env.NODE_ENV, // 'production' | 'staging' | 'development'
  channels: {
    backend:  'https://hooks.slack.com/services/...',
    payments: 'https://hooks.slack.com/services/...',
  },
  defaultChannel: 'backend',
})

// 2. Catch unhandled rejections and uncaught exceptions
attachProcessHandlers({ channel: 'backend' })

// 3. Register Express error middleware (after all routes)
app.use(errorMiddleware)

// 4. Manual logging anywhere
logger.error('DB connection failed', err)
logger.error('Payment failed', err, { channel: 'payments', userId: req.user.id })
logger.warn('Slow query', null, { extra: { queryMs: 3200 } })
logger.info('User signed up', null, { userEmail: 'foo@bar.com' })
```

---

## Frontend usage (React / Next.js)

```jsx
import { initLogger, logger, SlackErrorBoundary } from '@nakraniprakash/slack-logger-react'

// 1. Init once at app root
initLogger({
  project: 'networth-tracker',
  environment: process.env.NODE_ENV,
  channels: {
    frontend: 'https://hooks.slack.com/services/...',
    payments: 'https://hooks.slack.com/services/...',
  },
  defaultChannel: 'frontend',
})

// 2. Wrap your app
function App() {
  return (
    <SlackErrorBoundary>
      <YourApp />
    </SlackErrorBoundary>
  )
}

// 3. Wrap specific sections with a different channel
<SlackErrorBoundary channel="payments" fallback={<p>Payment failed. Please try again.</p>}>
  <CheckoutFlow />
</SlackErrorBoundary>

// 4. Manual logging
logger.error('API call failed', err)
logger.error('Payment failed', err, { channel: 'payments' })
```

### Next.js shorthand

```jsx
// pages/_app.jsx
import { withSlackLogger } from '@nakraniprakash/slack-logger-react'

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default withSlackLogger(MyApp, {
  project: 'networth-tracker',
  environment: process.env.NODE_ENV,
  channels: {
    frontend: 'https://hooks.slack.com/services/...',
  },
  defaultChannel: 'frontend',
})
```

---

## React Native usage

Same as React — `initLogger` auto-detects React Native and uses `ErrorUtils.setGlobalHandler` instead of `window.onerror`.

```js
// App.js
import { initLogger, SlackErrorBoundary } from '@nakraniprakash/slack-logger-react'

initLogger({
  project: 'networth-tracker-mobile',
  environment: __DEV__ ? 'development' : 'production',
  channels: {
    frontend: 'https://hooks.slack.com/services/...',
  },
  defaultChannel: 'frontend',
})
```

---

## Channel routing

Each `logger.error()` call can specify which Slack channel to post to:

```js
logger.error('message', err)                           // → defaultChannel
logger.error('message', err, { channel: 'payments' }) // → payments channel
logger.error('message', err, { channel: 'auth' })     // → auth channel
```

Add new channels anytime by updating your `initLogger` config — no code changes needed.

---

## Slack message format

Each message includes:
- Level (ERROR / WARN / INFO)
- Project name + environment
- Timestamp
- URL / HTTP method / status code
- User ID / email (if provided)
- Full stacktrace
- Extra context (body, headers — sensitive fields auto-redacted)

---

## Publishing a new version

```bash
# Bump version in all 3 package.json files, then:
git tag v1.0.1
git push origin v1.0.1
# GitHub Actions publishes all 3 packages automatically
```
