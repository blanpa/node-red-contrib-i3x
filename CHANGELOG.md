# Changelog

## 0.0.7 (2026-06-22)

Editor UX improvements, a bundled reference mock server, and local Docker
tooling. No client API changes; still feature-complete against the **i3X API
1.0 Release**.

### Added

- **Capability banner in the server config dialog** – the "Test Connection"
  area now surfaces `GET /info`: server name, spec/server version, and the
  reported capabilities (`subscribe.stream`, `query.history`,
  `update.current`, `update.history`) as badges. When SSE streaming is not
  supported it hints that subscribe nodes will fall back to polling. Loaded
  automatically when reopening a deployed server. New admin endpoint
  `GET /i3x-server/:id/info`.
- **Dropdown pickers in the browse node** – `Namespace`, `Type ID`, and
  `Rel. Type` are now populated from the live server instead of free-text
  entry, each with a refresh button. New admin endpoints
  `GET /i3x-server/:id/browse/namespaces` and `.../browse/relationshiptypes`.
  Saved values are preserved even when the server is undeployed or the value
  is no longer known, and `msg`-based runtime overrides are unaffected.
- **Bundled i3X reference mock server** (`mock-server/`, dev-only, not
  published) – a dependency-free in-memory implementation of the full 1.0
  endpoint surface with an ISA-95 sample model, live time-varying values,
  history generation, and subscriptions over both SSE and sync polling
  (`clientId` enforced; `I3X_STREAM=off` makes it poll-only via 501). New
  Docker Compose services `i3x-mock` and `node-red-mock` plus a demo flow
  (`examples/i3x-mock-demo.json`) bring up a turnkey local environment.
  The mock now also sends permissive CORS headers (and answers `OPTIONS`
  preflight) so browser-based i3X clients can call it directly.
- **Dockerized i3X Explorer GUI** (`i3x-explorer/`, dev-only, not published) –
  a Docker Compose service `i3x-explorer` that builds the official
  [i3X Explorer](https://github.com/ace-technologies-inc/i3X-Explorer)
  web bundle and serves it via nginx, pre-pointed at the bundled mock
  (`http://localhost:18810/v1`). Browse a full i3X server in a standalone GUI
  at <http://localhost:18820> — no Node-RED, no Electron.

### Fixed

- **"Expand all" in the browser widget did nothing on an unexpanded tree** –
  the tree is lazy-loaded, but the button only toggled CSS without triggering
  the per-node loaders. It now recursively opens every node and waits for the
  async child loads to settle (tracked via an in-flight load counter) before
  finishing, so the whole hierarchy is fetched and expanded.

## 0.0.6 (2026-06-14)

Tooling and developer-experience release. No functional changes to node
behaviour since 0.0.5; the package remains feature-complete against the
**i3X API 1.0 Release** specification (finalized 2026-06-09).

### Added

- TypeScript type definitions for the shared client (`lib/i3x-client.d.ts`,
  exposed via the package `types` field)
- ESLint flat config and `npm run lint` / `lint:fix` scripts; CI now runs a
  lint job before the test matrix
- Coverage tooling via c8 (`npm run test:coverage`)
- `CONTRIBUTING.md`, GitHub issue forms, and a pull-request template
- README badges and an architecture section with schematic diagrams

### Changed

- **Minimum Node.js raised to 18** (`engines.node` was incorrectly `>=14`;
  CI and `axios ^1.15` already required 18+)
- Documentation links now consistently point at the 1.0 (`/v1`) API docs

## 0.0.5 (2026-06-12)

Migration to the **i3X API 1.0 Release** specification (finalized 2026-06-09). See the
[official i3X changelog](https://github.com/cesmii/i3X/blob/1.0/CHANGELOG.md) for the
spec-side deltas this release adopts.

### Breaking (spec-mandated)

- **Bulk write endpoints** – `PUT /objects/{elementId}/value` and `PUT /objects/{elementId}/history`
  were removed from the spec. `writeValue()` / `writeHistory()` now use the bulk endpoints
  `PUT /objects/value` and `PUT /objects/history` with `{"updates": [{"elementId", "value"}]}`
  bodies. Values are normalised to VQT objects (`{value, quality, timestamp}`); history writes
  default missing `quality` to `"Good"` and missing `timestamp` to the current UTC time.
- **`clientId` required on all subscription endpoints** – create, list, delete, register,
  unregister, stream, and sync now always send a `clientId` (1.0 servers reject requests
  without one with 400). The i3x-server config node derives a stable `clientId` from its
  node id; it can be overridden per call or via the `I3XClient` constructor.
- **`GET /objects/{elementId}/history` removed** – `getHistory()` is deprecated and now
  delegates to the bulk `POST /objects/history` endpoint, returning its bulk result array.

### Added

- `writeValues(updates)` – bulk-write current values of multiple objects in one request
- Sync acknowledgement – the subscribe node tracks batch `sequenceNumber`s and acknowledges
  received updates via `lastSequenceNumber` on the next poll; `lastSequenceNumber = -1`
  (acknowledge all) is supported by the client
- Poll-only server support – servers may answer `/subscriptions/stream` with HTTP 501;
  the subscribe node now detects this and falls back to sync polling automatically

### Changed

- Sync responses are handled in the new batched format `[{sequenceNumber, updates: [...]}]`
  (flat pre-1.0 responses are still tolerated); the subscribe node emits the flattened updates
- Error details are read from the new `responseDetail` envelope field (with fallback to
  the older `problemDetail` and `error` shapes) and appended to error messages
- Write payload sanitization now validates against the VQT fields (`value`, `quality`,
  `timestamp`); unknown fields are rejected to avoid silent data loss
- README and node help texts updated to the 1.0 Release endpoint set

## 0.0.4 (2026-04-12)

Migration to i3X API 1.0-Beta specification with enhanced query capabilities and improved API alignment.

### Added

- **Server Info Endpoint** – New `getInfo()` method retrieves server metadata (spec version, server version, capabilities) from `GET /info` endpoint with TTL caching
- **Single-Object History Query** – New `getHistory(elementId, options)` method for `GET /objects/{elementId}/history` endpoint
- **Partial Response Handling** – History queries now detect HTTP 206 status and set `_partial: true` flag on results when server returns incomplete data
- **Root Objects Filter** – `getObjects()` now supports `root: true` parameter to retrieve only root-level objects
- **Enhanced Subscribe Options** – Subscribe node now supports `maxDepth`, `includeMetadata`, and `returnMode` parameters for fine-grained control

### Changed

- **API Version Update** – Updated from i3X v0.0.1 to 1.0-Beta specification
- **API Documentation URL** – Changed from `https://i3x.cesmii.net/docs` to `https://api.i3x.dev/v1/docs`
- **Parameter Naming** – `typeId` parameter renamed to `typeElementId` in `getObjects()` (legacy `typeId` still supported as alias)
- **Relationship Type Parameter** – Fixed casing from `relationshiptype` to `relationshipType` in `getRelatedObjects()`
- **History Query Implementation** – `getHistoryBulk()` now uses `_requestRaw()` to access HTTP status codes for partial response detection

### Tests

- Updated all test cases to reflect 1.0-Beta API changes
- Added tests for new `getInfo()` endpoint
- Added tests for single-object history query
- Added tests for partial response handling (HTTP 206)
- Updated integration tests for new parameter names

## 0.0.3 (2026-03-10)

Hardening, security improvements, and new browser widget features.

### Added

- **Live Values in Browser Widget** – The tree view now displays the current value, quality, and timestamp next to each element. Values are fetched automatically when expanding types or children, and on search results. Hover to see full value with quality and timestamp.
- **Test Connection Button** – Server config panel now includes a "Test Connection" button to verify connectivity without deploying
- **New admin endpoint** `POST /i3x-server/:id/browse/values` – Batch-reads live values for up to 50 elements (used by browser widget)
- **`statusError()` utility** – Smarter error message truncation (48 chars with `...`) replacing the hard `substring(0, 32)` cut across all nodes
- **`clampMaxDepth()` utility** – Validates and clamps `maxDepth` to 0–100 range, preventing negative or excessively large values

### Security

- **HTTPS warning** – Nodes now warn at startup when credentials are sent over plain HTTP to non-localhost servers
- **Error response sanitization** – `_wrapError()` strips sensitive fields (`token`, `password`, `apiKey`, `secret`) from API error response bodies to prevent accidental credential leakage in logs

### Fixed

- **SSE auth header duplication** – `streamSubscription()` now copies all configured headers cleanly via spread instead of manually duplicating individual auth headers
- **Poll interval minimum** – Increased from 500ms to 1000ms to prevent accidental API overload

### Changed

- Error status messages across all nodes now show up to 48 characters (was 32)
- `maxDepth` is validated on all nodes that accept it (read, history, subscribe)

## 0.0.2 (2026-03-05)

Compliance improvements based on [i3X Client Developer Guidelines](https://www.i3x.dev/sdk/category/client-developers).

### Added

- **TTL Caching** – Namespace and object type responses are cached for 60 seconds to reduce API load
- **Rate Limiting** – Client-side sliding-window throttle (100 requests per 60-second window) to proactively stay within API limits
- **Retry-After Header Support** – Respects server-provided `Retry-After` headers (both seconds and HTTP-date formats) instead of only using fixed exponential backoff
- **Input Sanitization** – Allowlist validation on write payloads (`writeValue`, `writeHistory`) to prevent injection of unexpected fields
- **New tests** – 12 additional unit tests covering caching, Retry-After, input sanitization, and rate limiting (75 tests total)

### Fixed

- **`testConnection()` bypassed cache** – Health check now performs a real HTTP round-trip instead of returning stale cached data
- **SSE stream missing auth headers** – Bearer tokens and API keys are now explicitly propagated to SSE stream requests (previously only `headers.common` was copied, which could miss auth headers)
- **TLS `rejectUnauthorized` default** – Now defaults to `true` per i3X security guidelines; can still be overridden via TLS config node

### Changed

- Updated API docs URL from `https://i3x.cesmii.net/docs` to `https://api.i3x.dev/v0/docs`

## 0.0.1 (2026-03-03)

Initial pre-alpha release targeting the [i3X API Prototype v0.0.1](https://api.i3x.dev/v0/docs).

### Nodes

- **i3x-server** – Config node for shared connection settings (URL, auth, TLS, timeout)
- **i3x-browse** – Explore namespaces, object types, relationship types, objects, and related objects
- **i3x-read** – Read last known values (`POST /objects/value`)
- **i3x-write** – Write current values (`PUT /objects/{id}/value`) or historical data (`PUT /objects/{id}/history`)
- **i3x-history** – Query historical time-series data with absolute or relative time ranges
- **i3x-subscribe** – Subscribe to value changes via SSE streaming with automatic polling fallback

### Features

- Full coverage of all 20 i3X API endpoints
- Shared HTTP client (`lib/i3x-client.js`) with retry logic, error wrapping, and SSE reconnection
- Dynamic configuration via `msg` properties (all node settings can be overridden at runtime)
- Example flow demonstrating all features against the public CESMII demo server
- Unit tests and integration tests against the live API
- Docker Compose setup for testing and local Node-RED development
