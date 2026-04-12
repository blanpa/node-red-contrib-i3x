# Changelog

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
