# i3X Reference Mock Server

A dependency-free, in-memory reference implementation of the **CESMII i3X API
1.0 Release** (finalized 2026-06-09). It exists so the `node-red-contrib-i3x`
nodes can be exercised end-to-end without access to a real i3X server.

It passes the official [i3X 1.0 Conformance Test Suite](https://github.com/cesmii/i3X/tree/1.0/conformance-tests)
with a verdict of **Full 1.0 Compliance** (55 passed, 0 failed, 3 not applicable);
the two advisory warnings are the expected ones for a local dev server (plain
HTTP, no authentication). Run it yourself with `npm run test:conformance` — CI
does the same on every push.

> Not shipped in the npm package — this is a dev/demo tool only.

## What it implements

The full 1.0 endpoint surface, with the spec-faithful response envelope
(`{success, result}` / `{success, results:[…]}`) and error envelope
(`{success:false, responseDetail:{title,status,detail}}`):

| Area | Endpoints |
|------|-----------|
| Info | `GET /info` (advertises `capabilities`) |
| Explore | `GET /namespaces`, `GET /objecttypes`, `POST /objecttypes/query`, `GET /relationshiptypes`, `POST /relationshiptypes/query`, `GET /objects`, `POST /objects/list`, `POST /objects/related` |
| Query | `POST /objects/value`, `POST /objects/history` |
| Update | `PUT /objects/value`, `PUT /objects/history` (bulk, VQT) |
| Subscribe | `POST /subscriptions{,/list,/register,/unregister,/sync,/stream,/delete}` |

Behaviour highlights:

- **ISA-95 sample model** — Enterprise → Site → Area → Line → Machine → Sensor
  (14 objects, 9 types, 3 namespaces).
- **Bulk semantics** — every bulk endpoint answers one entry per requested id,
  in request order, with per-item `404` `responseDetail`s; the top-level
  `success` is `false` as soon as any item failed.
- **Typed values** — sensors are typed (`AnalogSensor` / `StateSensor` /
  `BooleanSensor`) and their values validate against the type's JSON Schema.
- **Relationship graph** — every relationship type has a registered, symmetric
  `reverseOf`, edges are stored bidirectionally, and the containment hierarchy
  is traversable through `POST /objects/related`.
- **Live values** — sensors return time-varying values (sine / enum / boolean),
  so repeated reads and subscriptions feel "live".
- **Compositions** — `maxDepth > 1` (0 = infinite) returns child values under
  `components`, for both current values and history.
- **History** — synthesizes a 30-point series across the requested time range;
  written history points are merged in. `startTime` and `endTime` are required
  and must be RFC 3339 UTC (`400` otherwise), as in the spec.
- **Writes stick** — `PUT /objects/value` overrides are reflected in later reads.
- **Subscriptions** — SSE streaming **and** sync polling. `clientId` is required
  on every subscription endpoint (400 otherwise) and scopes the subscription:
  another client sees `404`. Opening a second stream closes the first cleanly.
- **gzip** — responses are compressed when the client sends
  `Accept-Encoding: gzip`.
- **Poll-only mode** — set `I3X_STREAM=off` and `/subscriptions/stream` returns
  `501`, so you can demo the nodes' automatic polling fallback.
- An optional version prefix (`/v1/…`) is tolerated.

## Run

Standalone:

```bash
node mock-server/server.js          # listens on :8080 (PORT env to change)
I3X_STREAM=off node mock-server/server.js   # poll-only (SSE → 501)
```

Via Docker Compose (brings up the mock **and** a Node-RED preloaded with a demo
flow wired to it):

```bash
docker compose up i3x-mock node-red-mock
```

- Node-RED editor: <http://localhost:18881>
- Mock API (host): <http://localhost:18810/info>
- Inside the Node-RED container the mock is reachable at `http://i3x-mock:8080`
  (already configured in the demo flow's i3X server config).

Open the **i3X Mock** server config to see the capability banner, and open the
**browse** node to try the namespace / type / relationship-type pickers.

## Conformance

```bash
npm run test:conformance             # full run against the bundled mock
npm run test:conformance -- --quiet  # failures and summary only
```

The suite is fetched on demand into `.conformance/` (gitignored) from the
CESMII spec repository, pinned to the `1.0` branch. Override with
`I3X_SPEC_REF` / `I3X_SPEC_REPO`, or change the mock's port with
`I3X_MOCK_PORT`.
