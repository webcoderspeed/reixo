# Sprint 09 — SEO & npm Package Growth

> Priority: 🟢 P3
> These changes improve discoverability on npm, GitHub, and search engines. They don't affect runtime behavior but directly impact download counts and community adoption.

---

## SEO-01 · `package.json` — Keywords, Description, and Links

**File:** `package.json`

### Current state (approximate)

```json
{
  "name": "reixo",
  "version": "0.x.x",
  "description": "TypeScript HTTP client",
  "keywords": ["http", "fetch", "typescript"]
}
```

### Recommended update

```json
{
  "name": "reixo",
  "description": "TypeScript HTTP client with Result<T,E> API, retry, circuit breaker, rate limiting, deduplication, offline queue, GraphQL, WebSocket, and SSE — zero exceptions by design",
  "keywords": [
    "http-client",
    "fetch",
    "typescript",
    "result-type",
    "no-throw",
    "retry",
    "circuit-breaker",
    "rate-limiter",
    "request-deduplication",
    "offline-queue",
    "graphql-client",
    "websocket",
    "sse",
    "server-sent-events",
    "infinite-scroll",
    "pagination",
    "resumable-upload",
    "chunked-upload",
    "mock-adapter",
    "axios-alternative",
    "ky-alternative",
    "opentelemetry",
    "otel",
    "tracing",
    "browser",
    "node",
    "isomorphic",
    "functional",
    "error-handling",
    "network",
    "jwt",
    "auth-interceptor"
  ],
  "author": {
    "name": "Sanjeev Sharma",
    "email": "webcoderspeed@gmail.com",
    "url": "https://github.com/webcoderspeed"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/webcoderspeed/reixo"
  },
  "bugs": {
    "url": "https://github.com/webcoderspeed/reixo/issues"
  },
  "homepage": "https://github.com/webcoderspeed/reixo#readme"
}
```

**Why these keywords matter:**

- `axios-alternative` / `ky-alternative` — captures search traffic from developers actively looking to migrate
- `result-type` / `no-throw` — captures the functional error-handling niche
- `circuit-breaker` / `retry` / `rate-limiter` — these are frequently searched individually; having all three increases discoverability
- `isomorphic` — signals browser + Node support, a key decision factor

---

## SEO-02 · README Top Section — Hook & Feature Matrix

**File:** `README.md`

The first 200 characters of README.md appear in npm search results. Make them count.

### Recommended top section

```markdown
# reixo

**TypeScript HTTP client with zero-exception design.** Result<T,E> API means no try/catch. Ships with retry, circuit breaker, rate limiting, request deduplication, offline queue, GraphQL, WebSocket, SSE, and resumable uploads — batteries included.

[![npm version](https://badge.fury.io/js/reixo.svg)](https://badge.fury.io/js/reixo)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-green.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Why reixo?

| Feature                | reixo | axios  | ky     | swr |
| ---------------------- | ----- | ------ | ------ | --- |
| Result<T,E> (no throw) | ✅    | ❌     | ❌     | ❌  |
| Retry + backoff        | ✅    | plugin | plugin | ❌  |
| Circuit breaker        | ✅    | ❌     | ❌     | ❌  |
| Rate limiting          | ✅    | ❌     | ❌     | ❌  |
| Request dedup          | ✅    | ❌     | ❌     | ✅  |
| Offline queue          | ✅    | ❌     | ❌     | ❌  |
| GraphQL + APQ          | ✅    | ❌     | ❌     | ❌  |
| WebSocket + SSE        | ✅    | ❌     | ❌     | ❌  |
| Zero deps              | ✅    | ❌     | ✅     | ❌  |
| TypeScript-first       | ✅    | types  | ✅     | ✅  |
```

---

## SEO-03 · Add Provenance and Publish Config

**File:** `package.json`

npm provenance links the published package to its GitHub Actions build, adding a "Verified" badge on the npm page. This builds trust.

```json
{
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

Also set up a GitHub Actions workflow for automated releases:

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write # required for provenance
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm test
      - run: npm publish --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## SEO-04 · Add `funding` field

**File:** `package.json`

The `funding` field shows a "Fund this package" button on npm and GitHub, increasing community investment visibility.

```json
{
  "funding": {
    "type": "github",
    "url": "https://github.com/sponsors/webcoderspeed"
  }
}
```

---

## SEO-05 · GitHub Repository Setup

**Files:** `.github/` directory

### Recommended additions

1. **Issue templates** — `bug_report.md` and `feature_request.md` to structure incoming issues
2. **PR template** — `pull_request_template.md` with checklist (tests, types, docs, changelog)
3. **`SECURITY.md`** — how to report security vulnerabilities (linked from npm page)
4. **Topics on GitHub repo** — `typescript`, `http-client`, `circuit-breaker`, `retry`, `result-type`, `zero-dependencies`

### GitHub description (appears in search)

```
TypeScript HTTP client with Result<T,E>, retry, circuit breaker, rate limiting, deduplication, offline queue, GraphQL, WebSocket, SSE
```

---

## SEO-06 · `engines` and `exports` fields

**File:** `package.json`

Declaring supported Node.js versions and proper `exports` map improves compatibility signaling and enables tree-shaking:

```json
{
  "engines": {
    "node": ">=18.0.0"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "default": "./dist/index.mjs"
    },
    "./mock": {
      "types": "./dist/utils/mock-adapter.d.ts",
      "import": "./dist/utils/mock-adapter.mjs",
      "require": "./dist/utils/mock-adapter.cjs"
    }
  },
  "sideEffects": false
}
```

`"sideEffects": false` enables bundlers (webpack, Rollup, esbuild) to tree-shake unused utilities, reducing final bundle size for consumers.

---

## SEO-07 · Add bundle size badge

After building, measure bundle size and add a badge:

```markdown
[![Bundle size](https://img.shields.io/bundlephobia/minzip/reixo)](https://bundlephobia.com/package/reixo)
```

A small bundle size (`~10 kB minzipped`) is a major selling point vs. axios (`~13 kB`) and differentiates reixo in SEO comparisons.

---

## Summary Table

| ID     | File                | Change                                           | Impact                  |
| ------ | ------------------- | ------------------------------------------------ | ----------------------- |
| SEO-01 | `package.json`      | 30 targeted keywords, author, repo, homepage     | npm discoverability     |
| SEO-02 | `README.md`         | Hook copy + feature comparison matrix            | Conversion from search  |
| SEO-03 | `package.json` + CI | npm provenance + automated releases              | Trust signal            |
| SEO-04 | `package.json`      | `funding` field                                  | Community engagement    |
| SEO-05 | `.github/`          | Issue templates, PR template, SECURITY.md        | Contribution quality    |
| SEO-06 | `package.json`      | `engines` + `exports` map + `sideEffects: false` | Tree-shaking, compat    |
| SEO-07 | `README.md`         | Bundle size badge                                | Performance credibility |
