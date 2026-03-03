# Changelog

## 0.0.1 (2026-03-03)

Initial pre-alpha release targeting the [i3X API Prototype v0.0.1](https://i3x.cesmii.net/docs).

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
- Unit tests (63 tests) and integration tests against the live API
- Docker Compose setup for testing and local Node-RED development
