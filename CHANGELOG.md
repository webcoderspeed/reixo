# Changelog

All notable changes to **reixo** will be documented in this file.
This project adheres to [Semantic Versioning](https://semver.org).

## [2.3.3](https://github.com/webcoderspeed/reixo/compare/v2.3.2...v2.3.3) (2026-10-15)

### 📚 Documentation

* fix Result examples that did not compile ([bb127fb](https://github.com/webcoderspeed/reixo/commit/bb127fb7945debeb2dc1ff6e3f85e5c30a2ba310))

## [2.3.2](https://github.com/webcoderspeed/reixo/compare/v2.3.1...v2.3.2) (2026-10-15)

### 📚 Documentation

* correct which clients read proxy env vars ([f021ba9](https://github.com/webcoderspeed/reixo/commit/f021ba9686ebb4183d895bf00a4fbbd53e41ac12))

## [2.3.1](https://github.com/webcoderspeed/reixo/compare/v2.3.0...v2.3.1) (2026-10-15)

### 📚 Documentation

* correct competitor claims in the comparisons ([53ed662](https://github.com/webcoderspeed/reixo/commit/53ed662a2a8fad04ec9a8abf07501036b580b783))
* use reixo as the orval mutator ([48ccfad](https://github.com/webcoderspeed/reixo/commit/48ccfada467deb2da40bd9b192b329edc01314b2))

## [2.3.0](https://github.com/webcoderspeed/reixo/compare/v2.2.2...v2.3.0) (2026-10-15)

### ✨ Features

* **proxy:** add proxy and dispatcher options; make pool/ssl effective in Node ([2b6438d](https://github.com/webcoderspeed/reixo/commit/2b6438d4e41d74de22d871ee9675c0c37383578e))

### 🐛 Bug Fixes

* **types:** satisfy exactOptionalPropertyTypes ([5317834](https://github.com/webcoderspeed/reixo/commit/531783414f2ed7d17f5ebd93fccd570574086345))

### 📚 Documentation

* document proxy, dispatcher, pool/ssl fix and agent deprecation ([92a0600](https://github.com/webcoderspeed/reixo/commit/92a06006758eb6bc21a0480fb903c5f3b17b2894))

## [2.3.0] — Unreleased

### ✨ Features

* **proxy:** first-class HTTP(S) proxy support via a new `proxy` option on `HTTPClientConfig` and per request on `HTTPOptions`: `'env'` (HTTPS_PROXY / HTTP_PROXY / NO_PROXY, read once at client creation), a proxy URL, a `ProxyConfig` object, or `false` to bypass. It is opt-in, so behaviour without the option is unchanged. Node.js uses undici's `EnvHttpProxyAgent`, Bun uses native `fetch({ proxy })` and Deno uses `Deno.createHttpClient`. Browsers and edge runtimes ignore the option with a single warning.
* **dispatcher:** new `dispatcher` option (client and per request) that passes a pre-built undici `Dispatcher` (`Agent`, `ProxyAgent`, `MockAgent`, …) to `fetch` unchanged. It is typed on `HTTPOptions`, so custom transports no longer need casts.
* Proxy failures are reported distinctly: an unreachable proxy throws `NetworkError`, and a rejected CONNECT throws `HTTPError` with the proxy's status. A `407` is not retried. Proxy credentials are never included in errors or logs. `redactProxyUrl()` is exported.
* New exports: `ProxyConfig`, `ProxyOption`, `TLSOptions`, `redactProxyUrl`, and `HTTPBuilder#withProxy()`.
* `undici` (`>= 6.14.0`) is an **optional** peer dependency. It is loaded lazily, and only when `proxy`, `pool`, `ssl` or `dispatcher` is used. reixo still has zero runtime dependencies, and undici is never part of browser bundles.

### 🐛 Bug Fixes

* **node:** `pool` (`maxSockets`, `keepAlive`, `keepAliveMsecs`) and `ssl` (`ca`, `cert`, `key`, `passphrase`, `rejectUnauthorized`) now take effect in Node.js. Previously they built `node:http(s)` agents that `fetch` silently ignored. They are now translated into an undici `Agent`, and the TLS options are also applied to the proxy hop.
* reixo-only request options (`proxy`, `dispatcher`, `agent`, `cacheConfig`, `validationSchema`, `responseType`, progress callbacks, …) are no longer forwarded to `fetch()`. Unknown keys are still forwarded, as before.

### ⚠️ Deprecated

* The per-request `agent` option. `fetch` has never accepted `http.Agent` / `https.Agent`. It is now ignored with a one-time warning. Use `pool` / `ssl`, `proxy`, or `dispatcher`.

### 🔭 Under consideration for 3.0

* Make `proxy: 'env'` the default, matching axios. This was not done in 2.3.0 because it would silently re-route traffic for existing users who have `HTTPS_PROXY` set.
* `retry.methods`: by default, only retry idempotent methods (POST/PATCH are currently retried on 5xx/429/408/network errors).

## [2.2.2](https://github.com/webcoderspeed/reixo/compare/v2.2.1...v2.2.2) (2026-03-14)

### 📚 Documentation

* add dynamic npm version and github star count fetching ([1a5b390](https://github.com/webcoderspeed/reixo/commit/1a5b390d94e9f1d3df7ad55fab66614658cfb087))

## [2.2.1](https://github.com/webcoderspeed/reixo/compare/v2.2.0...v2.2.1) (2026-03-14)

### 📚 Documentation

* update landing page version to v2.2.0 and enhance metadata ([b93b91e](https://github.com/webcoderspeed/reixo/commit/b93b91ea09ad5b8aff338ba3bb6a231e28da5f58))

## [2.2.0](https://github.com/webcoderspeed/reixo/compare/v2.1.17...v2.2.0) (2026-03-14)

### ✨ Features

* expose subpath exports for graphql, ws, sse, and mock ([6de251a](https://github.com/webcoderspeed/reixo/commit/6de251a9e98ee1404dae99871cba66874c947f29))

## [2.1.17](https://github.com/webcoderspeed/reixo/compare/v2.1.16...v2.1.17) (2026-03-14)

### 📚 Documentation

* add standalone documentation landing page ([020128d](https://github.com/webcoderspeed/reixo/commit/020128d14fd632fc299ecdfe99b3c97d4632e7e7))

## [2.1.16](https://github.com/webcoderspeed/reixo/compare/v2.1.15...v2.1.16) (2026-03-14)

### 📚 Documentation

* finalize playground landing page with feature comparison and quickstart ([9103dcb](https://github.com/webcoderspeed/reixo/commit/9103dcb19aed6e1ebac7c68021c23b89c42d834f))

## [2.1.15](https://github.com/webcoderspeed/reixo/compare/v2.1.14...v2.1.15) (2026-03-14)

### 📚 Documentation

* improve code block syntax highlighting and add contributing guide ([4828bf0](https://github.com/webcoderspeed/reixo/commit/4828bf001b356c35dc0e91b01e5c0bb3c224eb59))

## [2.1.14](https://github.com/webcoderspeed/reixo/compare/v2.1.13...v2.1.14) (2026-03-14)

### 📚 Documentation

* add advanced features and config reference to README ([8463e78](https://github.com/webcoderspeed/reixo/commit/8463e7835f54141122cb9a7bf0527742bb8de677))

## [2.1.13](https://github.com/webcoderspeed/reixo/compare/v2.1.12...v2.1.13) (2026-03-14)

### 📚 Documentation

* build landing page and update playground layout ([e69c04b](https://github.com/webcoderspeed/reixo/commit/e69c04b786993462dcecf8070e2f9edd68642074))

## [2.1.12](https://github.com/webcoderspeed/reixo/compare/v2.1.11...v2.1.12) (2026-03-14)

### 📚 Documentation

* restructure README and add new feature sections ([a2d5d5c](https://github.com/webcoderspeed/reixo/commit/a2d5d5c7cb14d0c3f3b3260ae48601884ff1bcd1))

## [2.1.11](https://github.com/webcoderspeed/reixo/compare/v2.1.10...v2.1.11) (2026-03-14)

### ⚡ Performance

* lazy event/progress allocation and updated benchmarks ([04f6c46](https://github.com/webcoderspeed/reixo/commit/04f6c4686ef6322b05f2f903d6591b8616c45c48))

## [2.1.10](https://github.com/webcoderspeed/reixo/compare/v2.1.9...v2.1.10) (2026-03-14)

### ⚡ Performance

* further optimize hot path with slim config and fast interceptors ([3b16f1e](https://github.com/webcoderspeed/reixo/commit/3b16f1ec2b57d45cf01863cda7abf55b222154cf))

## [2.1.9](https://github.com/webcoderspeed/reixo/compare/v2.1.8...v2.1.9) (2026-03-14)

### ⚡ Performance

* optimize request path and update benchmarks ([46d5dea](https://github.com/webcoderspeed/reixo/commit/46d5dea7a1088ded5f4bbc7d68db55d123dace07))

## [2.1.8](https://github.com/webcoderspeed/reixo/compare/v2.1.7...v2.1.8) (2026-03-14)

### 📚 Documentation

* update README and add benchmark script ([0f7c8a0](https://github.com/webcoderspeed/reixo/commit/0f7c8a0e8866f0add4ef322cf640e637aad43ee0))

## [2.1.7](https://github.com/webcoderspeed/reixo/compare/v2.1.6...v2.1.7) (2026-03-14)

### 🐛 Bug Fixes

* **ci:** npm install for native bindings + expand eslint ignores ([2663a2c](https://github.com/webcoderspeed/reixo/commit/2663a2c98417860702ba5077457ae0a084d69c52))
* **ci:** untrack lockfile for cross-platform native bindings ([1e6d45e](https://github.com/webcoderspeed/reixo/commit/1e6d45e02774dd5d7726e25f5756822eabdef885))

# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [2.1.6](https://github.com/webcoderspeed/reixo/compare/v2.1.5...v2.1.6) (2026-03-13)

### [2.1.5](https://github.com/webcoderspeed/reixo/compare/v2.1.4...v2.1.5) (2026-03-13)

### Features

- add Result API, OpenTelemetry support, deduplication and new examples ([7c50a81](https://github.com/webcoderspeed/reixo/commit/7c50a8112e063342d032621657415fd19bfb92c9))

### Bug Fixes

- resolve lint errors in examples/05-interceptors.ts and others ([f87116a](https://github.com/webcoderspeed/reixo/commit/f87116a2abbb8d972cd18ee7c64e5fb272110420))

### [2.1.4](https://github.com/webcoderspeed/reixo/compare/v2.1.3...v2.1.4) (2026-03-13)

### Bug Fixes

- resolve lint errors in examples ([958915f](https://github.com/webcoderspeed/reixo/commit/958915f3cbad21962d3847e9b195abda6ca94a92))

### [2.1.3](https://github.com/webcoderspeed/reixo/compare/v2.1.2...v2.1.3) (2026-03-13)

### [2.1.2](https://github.com/webcoderspeed/reixo/compare/v2.1.1...v2.1.2) (2026-03-13)

### Features

- add infinite query utility for paginated data fetching ([a00dfd8](https://github.com/webcoderspeed/reixo/commit/a00dfd87ac6b423887acff67473a4c256eac0166))
- **auth:** implement token refresh queue and cache notifications ([51e9291](https://github.com/webcoderspeed/reixo/commit/51e9291c6a9d240d66512f9c7ab268ae50076160))
- **cache:** implement advanced caching strategies and real-time data synchronization ([657ad9a](https://github.com/webcoderspeed/reixo/commit/657ad9abe98457b97ec77adf6bfc9a8d689d1f3d))
- enhance core clients, utilities and add tests ([6abeb6a](https://github.com/webcoderspeed/reixo/commit/6abeb6a0e98040271cd7d7b884aa4a86864c0949))
- **graphql:** add automatic persisted queries and hashed cache keys ([b3ce11e](https://github.com/webcoderspeed/reixo/commit/b3ce11e8d42ddda9b8fca4be3e1cde9972c5136c))
- **queue:** add data payload and priority inheritance for persistence ([d2b81d8](https://github.com/webcoderspeed/reixo/commit/d2b81d82437be6e01b90d3251d88e0634b65f7bc))

### [2.1.1](https://github.com/webcoderspeed/reixo/compare/v2.1.0...v2.1.1) (2026-01-30)

## [2.1.0](https://github.com/webcoderspeed/reixo/compare/v2.0.2...v2.1.0) (2026-01-30)

### Features

- **examples:** add real-time client examples and benchmarks ([d06802b](https://github.com/webcoderspeed/reixo/commit/d06802bbcafb0ecf76afcada2a5b1a485d84085b))

### [2.0.2](https://github.com/webcoderspeed/reixo/compare/v2.0.1...v2.0.2) (2026-01-29)

### Features

- add SSEClient and polling utilities for real-time connectivity ([03e22fb](https://github.com/webcoderspeed/reixo/commit/03e22fb25767f92d26165f1fdd668ac72750a83d))
- **websocket:** add WebSocketClient with auto-reconnect and heartbeat ([02d196c](https://github.com/webcoderspeed/reixo/commit/02d196c35b793e75551dda7b2bd287d211b8e00b))

### [2.0.1](https://github.com/webcoderspeed/reixo/compare/v2.0.0...v2.0.1) (2026-01-29)

### Features

- **core:** add request lifecycle events and update todo ([ec2cd98](https://github.com/webcoderspeed/reixo/commit/ec2cd989b4b0e27ec528739d29850b7081cd136d))
- **http:** add stream response support and typed validation ([7001491](https://github.com/webcoderspeed/reixo/commit/7001491072a29744fd7cc5c4c2e740fb478cfb0e))

## [2.0.0](https://github.com/webcoderspeed/reixo/compare/v1.3.0...v2.0.0) (2026-01-29)

### Features

- add service discovery, batch transport, and OAuth2 helpers ([9552181](https://github.com/webcoderspeed/reixo/commit/95521819bf0678d7eba50fb25aae9271107e23da))

## [1.3.0](https://github.com/webcoderspeed/reixo/compare/v1.2.1...v1.3.0) (2026-01-29)

### Features

- add comprehensive developer experience utilities ([e42e929](https://github.com/webcoderspeed/reixo/commit/e42e92995300ffb8e73c0c9239bc7126abcf9125))

### [1.2.1](https://github.com/webcoderspeed/reixo/compare/v1.2.0...v1.2.1) (2026-01-28)

### Features

- add comprehensive documentation and npm package optimization\n\n- Created professional README with extensive examples and API reference\n- Optimized package.json for npm publishing with enhanced metadata\n- Added comprehensive keywords for better discoverability\n- Improved build scripts and development workflow\n- Added repository links and author information~ ([6710a27](https://github.com/webcoderspeed/reixo/commit/6710a273480ca6bd593840788ba23c65bbadff25))

## [1.2.0](https://github.com/webcoderspeed/reixo/compare/v1.1.1...v1.2.0) (2026-01-28)

### Features

- add developer experience improvements and advanced data handling ([d8e0543](https://github.com/webcoderspeed/reixo/commit/d8e05435610600f71e697db3e026fe82225b27d1))
- add pagination stopCondition and example suite ([144c70b](https://github.com/webcoderspeed/reixo/commit/144c70b2fcfc2daa907f66319f080b1e319a0fe5))
- add security, caching, deduplication, and pagination features ([7cd4cb5](https://github.com/webcoderspeed/reixo/commit/7cd4cb57d8b06e4c3776f9e27d0fed0dbb1df4e1))
- **http:** add connection pooling support for Node.js ([53040ad](https://github.com/webcoderspeed/reixo/commit/53040ad7023e8e306122543e76307c7482ac0aa1))
- **metrics:** add request metrics collection to HTTP client ([d2f73da](https://github.com/webcoderspeed/reixo/commit/d2f73da31f1567f20f1a949bf5e6fcd1abab6780))
- **resilience:** implement circuit breaker fallback and retry policies ([e005a3f](https://github.com/webcoderspeed/reixo/commit/e005a3fb2e50a53f2b16d3c22286d6c94cf86b9f))

### [1.1.1](https://github.com/webcoderspeed/reixo/compare/v1.1.0...v1.1.1) (2026-01-28)

## 1.1.0 (2026-01-28)

### Features

- add comprehensive test coverage and browser utilities ([6cba19f](https://github.com/webcoderspeed/reixo/commit/6cba19f8556757e16a711a6a7e970d2c97714942))
- add integration tests, browser utils, and npm config ([9152cd5](https://github.com/webcoderspeed/reixo/commit/9152cd5f8a5ab8830611bab50c2f3f9c1cac60b0))
- add progress events, improve queue deduplication, add tests and demo ([2428bee](https://github.com/webcoderspeed/reixo/commit/2428beeb96c50d3a057e36f1045f693cbf85c156))
- add timing utils, queue dependencies, and download progress ([6056516](https://github.com/webcoderspeed/reixo/commit/6056516f7a918319662ee09f9f32768313c26a6d))
- **http-client:** expose timing utilities on HTTPClient and HTTPBuilder ([02fce67](https://github.com/webcoderspeed/reixo/commit/02fce67d014d90ad28691d1546fd8b4fc9458c6e))
- implement advanced resilience features and apply best practices ([04aabde](https://github.com/webcoderspeed/reixo/commit/04aabdecf2636f9c1ca7b14f7956f275b4160b87))
- init project with retry and http client ([2a8a11c](https://github.com/webcoderspeed/reixo/commit/2a8a11c759b00be43570306780d94250eee357e0))

### Bug Fixes

- use unknown instead of any in BatchProcessor ([f088712](https://github.com/webcoderspeed/reixo/commit/f0887124a4acc4cb1eccf8bf21a0d4593cab43b7))
