/**
 * i3X Reference Mock Server – i3X API 1.0 Release
 *
 * A dependency-free, in-memory reference implementation of the CESMII i3X API
 * (1.0 Release, finalized 2026-06-09). It implements the full endpoint surface
 * so that the node-red-contrib-i3x nodes can be exercised end-to-end without a
 * real server.
 *
 *   - Spec response envelope: SuccessResponse {success,result} /
 *     BulkResponse {success,results:[{success,elementId,result,responseDetail}]}
 *     Bulk results mirror the request one-to-one, in order, with per-item 404s.
 *   - Error envelope: {success:false, responseDetail:{title,status,detail}}
 *   - ISA-95-style sample model (Enterprise → Site → Area → Line → Machine → Sensor)
 *   - Bidirectional relationship graph; every relationship type has a registered,
 *     symmetric reverseOf, and the hierarchy is traversable via /objects/related
 *   - Live, time-varying sensor values (sine / enum / boolean generators) whose
 *     values validate against their Object Type's JSON Schema
 *   - Historical series generation between start/end (startTime and endTime are
 *     required, as in the spec), with composition support via maxDepth
 *   - Subscriptions with SSE streaming AND sync polling; subscriptions are
 *     scoped to their clientId (another client sees 404)
 *   - gzip content encoding when the client asks for it
 *   - GET /info advertising capabilities (toggle SSE via I3X_STREAM=off → 501)
 *
 * Verified against the official i3X 1.0 Conformance Test Suite
 * (https://github.com/cesmii/i3X/tree/1.0/conformance-tests).
 *
 * Run: node server.js        (PORT env, default 8080)
 * No external dependencies – Node built-in http/zlib only.
 */
"use strict";

const http = require("http");
const zlib = require("zlib");

const PORT = parseInt(process.env.PORT, 10) || 8080;
const STREAM_ENABLED = (process.env.I3X_STREAM || "on").toLowerCase() !== "off";
const SPEC_VERSION = "1.0";
const SERVER_VERSION = "i3x-mock 1.0.0";
const SERVER_NAME = "i3X Reference Mock (Acme Manufacturing)";

// RFC 3339, UTC only – the Implementation Guide requires timestamps in UTC
// with no timezone offset.
const UTC_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// ── Information model ──────────────────────────────────────────────────

const NS_SAMPLE = "https://cesmii.org/i3x/sample/";
const NS_ISA95 = "http://www.isa.org/ISA95/";
const NS_OPCUA = "http://opcfoundation.org/UA/";

const namespaces = [
    { uri: NS_OPCUA, displayName: "OPC UA Base" },
    { uri: NS_ISA95, displayName: "ISA-95 Equipment Hierarchy" },
    { uri: NS_SAMPLE, displayName: "i3X Sample Factory" },
];

const MACHINE_STATES = ["Running", "Idle", "Cleaning", "Fault"];

/**
 * Object type schemas describe the shape of an Object's *value*. Container
 * types are compositions and describe their component tree; sensor types are
 * scalar and must match the value their generator produces (see QRY-03).
 */
const objectTypes = [
    mkType("type-enterprise", "Enterprise", NS_ISA95, {
        type: "object",
        properties: { sites: { type: "array", items: { type: "string" } } },
    }),
    mkType("type-site", "Site", NS_ISA95, {
        type: "object",
        properties: { areas: { type: "array", items: { type: "string" } } },
    }),
    mkType("type-area", "Area", NS_ISA95, {
        type: "object",
        properties: { equipment: { type: "array", items: { type: "string" } } },
    }),
    mkType("type-line", "ProductionLine", NS_ISA95, {
        type: "object",
        properties: { machines: { type: "array", items: { type: "string" } } },
    }),
    mkType("type-machine", "Machine", NS_SAMPLE, {
        type: "object",
        properties: {
            Temperature: { type: "number" },
            Speed: { type: "number" },
            State: { type: "string", enum: MACHINE_STATES },
        },
    }),
    mkType("type-tank", "Tank", NS_SAMPLE, {
        type: "object",
        properties: { Level: { type: "number" }, pH: { type: "number" } },
    }),
    mkType("type-sensor-analog", "AnalogSensor", NS_SAMPLE, { type: "number" }),
    mkType("type-sensor-state", "StateSensor", NS_SAMPLE, { type: "string", enum: MACHINE_STATES }),
    mkType("type-sensor-boolean", "BooleanSensor", NS_SAMPLE, { type: "boolean" }),
];

function mkType(elementId, displayName, namespaceUri, schema) {
    return {
        elementId,
        displayName,
        namespaceUri,
        sourceTypeId: elementId,
        version: "1.0",
        schema,
        related: null,
    };
}

/**
 * Every relationship type declares a reverseOf that is itself registered here,
 * and the pair is symmetric (EXP-10). Edges are stored bidirectionally so the
 * graph is traversable from either end (EXP-20).
 */
const relationshipTypes = [
    mkRel("rel-hasComponent", "HasComponent", NS_ISA95, "rel-componentOf"),
    mkRel("rel-componentOf", "ComponentOf", NS_ISA95, "rel-hasComponent"),
    mkRel("rel-feeds", "Feeds", NS_SAMPLE, "rel-isFedBy"),
    mkRel("rel-isFedBy", "IsFedBy", NS_SAMPLE, "rel-feeds"),
];

function mkRel(elementId, displayName, namespaceUri, reverseOf) {
    return { elementId, displayName, namespaceUri, relationshipId: elementId, reverseOf };
}

// Objects: containers (isComposition) and sensors (leaf values).
// gen: value generator config for sensors.
const objectDefs = [
    obj("ent-1", "Acme Manufacturing", "type-enterprise", null),
    obj("site-1", "Plant Hamburg", "type-site", "ent-1"),
    obj("area-1", "Packaging", "type-area", "site-1"),
    obj("line-1", "Line A", "type-line", "area-1"),
    obj("mach-1", "Filler 01", "type-machine", "line-1"),
    sensor("sensor-temp-1", "Temperature", "mach-1", { kind: "sine", base: 72, amp: 6, period: 12000, unit: "°C" }),
    sensor("sensor-speed-1", "Speed", "mach-1", { kind: "sine", base: 120, amp: 25, period: 9000, unit: "units/min" }),
    sensor("sensor-state-1", "State", "mach-1", { kind: "enum", states: MACHINE_STATES, unit: null }),
    obj("mach-2", "Capper 01", "type-machine", "line-1"),
    sensor("sensor-torque-1", "Torque", "mach-2", { kind: "sine", base: 8.5, amp: 1.2, period: 7000, unit: "Nm" }),
    sensor("sensor-running-1", "Running", "mach-2", { kind: "bool", period: 8000, unit: null }),
    obj("tank-1", "Mixing Tank", "type-tank", "area-1"),
    sensor("sensor-level-1", "Level", "tank-1", { kind: "sine", base: 65, amp: 15, period: 20000, unit: "%" }),
    sensor("sensor-ph-1", "pH", "tank-1", { kind: "sine", base: 7.0, amp: 0.4, period: 15000, unit: "pH" }),
];

function obj(elementId, displayName, typeElementId, parentId) {
    return { elementId, displayName, typeElementId, parentId, isComposition: true, gen: null };
}
function sensor(elementId, displayName, parentId, gen) {
    const typeElementId =
        gen.kind === "enum" ? "type-sensor-state" : gen.kind === "bool" ? "type-sensor-boolean" : "type-sensor-analog";
    return { elementId, displayName, typeElementId, parentId, isComposition: false, gen };
}

const objectsById = new Map(objectDefs.map((o) => [o.elementId, o]));
const typesById = new Map(objectTypes.map((t) => [t.elementId, t]));
const relsById = new Map(relationshipTypes.map((r) => [r.elementId, r]));

// ── Relationship graph ─────────────────────────────────────────────────

/**
 * Directed edges, stored bidirectionally: every edge added here also gets its
 * reverse (using the relationship type's registered reverseOf).
 * @type {Map<string, Array<{relationshipType:string, target:string}>>}
 */
const edgesByObject = new Map();

function addEdge(from, relationshipType, to) {
    if (!edgesByObject.has(from)) edgesByObject.set(from, []);
    edgesByObject.get(from).push({ relationshipType, target: to });
}

function addBidirectionalEdge(from, relationshipType, to) {
    addEdge(from, relationshipType, to);
    addEdge(to, relsById.get(relationshipType).reverseOf, from);
}

// Hierarchy: parent —HasComponent→ child (and child —ComponentOf→ parent).
for (const o of objectDefs) {
    if (o.parentId) addBidirectionalEdge(o.parentId, "rel-hasComponent", o.elementId);
}
// A process edge that is not part of the containment hierarchy.
addBidirectionalEdge("tank-1", "rel-feeds", "mach-1");

function edgesOf(elementId) {
    return edgesByObject.get(elementId) || [];
}

// Manual write overrides (writeValue → sticky until overwritten).
const valueOverrides = new Map();
// Written history points keyed by elementId.
const historyWrites = new Map();

// ── Value generation ───────────────────────────────────────────────────

function computeValue(o, atMs) {
    const g = o.gen;
    if (!g) return { value: null, quality: "GoodNoData" };
    if (g.kind === "enum") {
        return { value: g.states[Math.floor(atMs / 5000) % g.states.length], quality: "Good" };
    }
    if (g.kind === "bool") {
        return { value: Math.floor(atMs / (g.period || 8000)) % 2 === 0, quality: "Good" };
    }
    const v = g.base + g.amp * Math.sin(atMs / (g.period || 10000));
    return { value: Math.round(v * 1000) / 1000, quality: "Good" };
}

function currentVQT(o) {
    if (valueOverrides.has(o.elementId)) return valueOverrides.get(o.elementId);
    const now = Date.now();
    const { value, quality } = computeValue(o, now);
    return { value, quality, timestamp: new Date(now).toISOString() };
}

function historyVQTs(o, startMs, endMs, points) {
    const out = [];
    if (!o.gen) return out;
    const step = (endMs - startMs) / points;
    for (let i = 0; i <= points; i++) {
        const t = Math.round(startMs + i * step);
        const { value, quality } = computeValue(o, t);
        out.push({ value, quality, timestamp: new Date(t).toISOString() });
    }
    const written = historyWrites.get(o.elementId) || [];
    for (const w of written) {
        const t = Date.parse(w.timestamp);
        if (t >= startMs && t <= endMs) out.push(w);
    }
    out.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    return out;
}

// ── Hierarchy helpers ──────────────────────────────────────────────────

function childrenOf(elementId) {
    return objectDefs.filter((o) => o.parentId === elementId);
}

/**
 * Flatten a composition tree into the child elementIds reachable within the
 * given depth. maxDepth follows the spec: 0 = infinite, 1 = no recursion.
 */
function descendantsOf(elementId, maxDepth) {
    const out = [];
    const walk = (id, depth) => {
        if (depth === 1) return;
        for (const child of childrenOf(id)) {
            out.push(child);
            walk(child.elementId, depth === 0 ? 0 : depth - 1);
        }
    };
    walk(elementId, maxDepth);
    return out;
}

function serializeObject(o, includeMetadata) {
    const base = {
        elementId: o.elementId,
        displayName: o.displayName,
        typeElementId: o.typeElementId,
        parentId: o.parentId,
        isComposition: o.isComposition,
        isExtended: false,
    };
    if (includeMetadata) {
        const type = typesById.get(o.typeElementId);
        // Relationships are keyed by relationship type display name, listing the
        // elementIds reachable over that relationship.
        const relationships = {};
        for (const edge of edgesOf(o.elementId)) {
            const rel = relsById.get(edge.relationshipType);
            const key = rel ? rel.displayName : edge.relationshipType;
            if (!relationships[key]) relationships[key] = [];
            relationships[key].push(edge.target);
        }
        base.metadata = {
            typeNamespaceUri: type ? type.namespaceUri : null,
            sourceTypeId: o.typeElementId,
            description: o.gen ? `${o.displayName} sensor` : `${o.displayName} container`,
            relationships,
            schemaExtensions: o.gen && o.gen.unit ? { engineeringUnit: o.gen.unit } : null,
            system: { isComposition: o.isComposition },
        };
    }
    return base;
}

// ── Subscriptions ──────────────────────────────────────────────────────

let subCounter = 0;
const subscriptions = new Map(); // subscriptionId -> { clientId, displayName, items:Map, seq, streams:Set }

function newSubscription(clientId, displayName) {
    const subscriptionId = "sub-" + ++subCounter;
    subscriptions.set(subscriptionId, {
        clientId,
        displayName: displayName || null,
        items: new Map(), // elementId -> maxDepth
        seq: 0,
        streams: new Set(),
    });
    return subscriptionId;
}

/** A subscription is only visible to the client that created it. */
function ownedSubscription(subscriptionId, clientId) {
    const sub = subscriptions.get(subscriptionId);
    return sub && sub.clientId === clientId ? sub : null;
}

function subUpdates(sub) {
    const updates = [];
    for (const eid of sub.items.keys()) {
        const o = objectsById.get(eid);
        if (!o) continue;
        const vqt = currentVQT(o);
        updates.push({ elementId: eid, value: vqt.value, quality: vqt.quality, timestamp: vqt.timestamp });
    }
    return updates;
}

// ── HTTP helpers ───────────────────────────────────────────────────────

/**
 * Send a JSON body, honouring Accept-Encoding: gzip – the spec requires
 * servers to compress when the client asks for it.
 */
function sendJSON(req, res, status, body) {
    const json = Buffer.from(JSON.stringify(body), "utf8");
    const accepts = String(req.headers["accept-encoding"] || "").toLowerCase();
    if (/\bgzip\b/.test(accepts)) {
        const gz = zlib.gzipSync(json);
        res.writeHead(status, {
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
            "Content-Length": gz.length,
            Vary: "Accept-Encoding",
        });
        return res.end(gz);
    }
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": json.length,
        Vary: "Accept-Encoding",
    });
    res.end(json);
}

const ok = (result) => ({ success: true, result });
/** Bulk envelope: top-level success is false as soon as any item failed. */
const okBulk = (results) => ({ success: results.every((r) => r.success !== false), results });

function errEnv(req, res, status, title, detail) {
    sendJSON(req, res, status, { success: false, responseDetail: { title, status, detail } });
}

function bulkOk(keyField, key, result) {
    const entry = { success: true, elementId: null, subscriptionId: null, result, responseDetail: null };
    entry[keyField] = key;
    return entry;
}

function bulkFail(keyField, key, status, title, detail) {
    const entry = {
        success: false,
        elementId: null,
        subscriptionId: null,
        result: null,
        responseDetail: { title, status, detail },
    };
    entry[keyField] = key;
    return entry;
}

const notFoundItem = (keyField, key, what) =>
    bulkFail(keyField, key, 404, "Not Found", `Unknown ${what}: ${key}`);

/**
 * Map requested ids to bulk entries, preserving request order and size.
 * `resolve` returns the result payload, or undefined for a per-item 404.
 */
function bulkMap(ids, what, resolve, keyField = "elementId") {
    return ids.map((id) => {
        const result = resolve(id);
        return result === undefined ? notFoundItem(keyField, id, what) : bulkOk(keyField, id, result);
    });
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (c) => {
            data += c;
            if (data.length > 5e6) reject(new Error("body too large"));
        });
        req.on("end", () => {
            if (!data) return resolve({});
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
        req.on("error", reject);
    });
}

// ── Router ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
    try {
        const u = new URL(req.url, "http://localhost");
        // Tolerate an optional version prefix (e.g. /v1/info)
        let path = u.pathname.replace(/\/+$/, "") || "/";
        path = path.replace(/^\/v\d+(?=\/)/, "");
        const q = u.searchParams;
        const method = req.method.toUpperCase();

        // CORS – the i3X Explorer (and any browser-based client) calls this API
        // directly from the browser, so cross-origin access must be allowed.
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
        res.setHeader("Access-Control-Max-Age", "86400");
        if (method === "OPTIONS") {
            res.writeHead(204);
            return res.end();
        }

        const body = method === "POST" || method === "PUT" ? await readBody(req).catch(() => ({})) : {};

        // ── Server info ──
        if (method === "GET" && path === "/info") {
            return sendJSON(req, res, 200, ok({
                specVersion: SPEC_VERSION,
                serverVersion: SERVER_VERSION,
                serverName: SERVER_NAME,
                capabilities: {
                    query: { history: true },
                    update: { current: true, history: true },
                    subscribe: { stream: STREAM_ENABLED },
                },
            }));
        }

        // ── Explore ──
        if (method === "GET" && path === "/namespaces") {
            return sendJSON(req, res, 200, ok(namespaces));
        }
        if (method === "GET" && path === "/objecttypes") {
            const ns = q.get("namespaceUri");
            const list = ns ? objectTypes.filter((t) => t.namespaceUri === ns) : objectTypes;
            return sendJSON(req, res, 200, ok(list));
        }
        if (method === "POST" && path === "/objecttypes/query") {
            const ids = body.elementIds || [];
            return sendJSON(req, res, 200, okBulk(bulkMap(ids, "objectType elementId", (id) => typesById.get(id))));
        }
        if (method === "GET" && path === "/relationshiptypes") {
            const ns = q.get("namespaceUri");
            const list = ns ? relationshipTypes.filter((t) => t.namespaceUri === ns) : relationshipTypes;
            return sendJSON(req, res, 200, ok(list));
        }
        if (method === "POST" && path === "/relationshiptypes/query") {
            const ids = body.elementIds || [];
            return sendJSON(req, res, 200, okBulk(bulkMap(ids, "relationshipType elementId", (id) => relsById.get(id))));
        }
        if (method === "GET" && path === "/objects") {
            const typeFilter = q.get("typeElementId") || q.get("typeId");
            const includeMetadata = q.get("includeMetadata") === "true";
            const rootOnly = q.get("root") === "true";
            let list = objectDefs;
            if (typeFilter) list = list.filter((o) => o.typeElementId === typeFilter);
            if (rootOnly) list = list.filter((o) => o.parentId === null);
            return sendJSON(req, res, 200, ok(list.map((o) => serializeObject(o, includeMetadata))));
        }
        if (method === "POST" && path === "/objects/list") {
            const ids = body.elementIds || [];
            const includeMetadata = !!body.includeMetadata;
            const results = bulkMap(ids, "elementId", (id) => {
                const o = objectsById.get(id);
                return o ? serializeObject(o, includeMetadata) : undefined;
            });
            return sendJSON(req, res, 200, okBulk(results));
        }
        if (method === "POST" && path === "/objects/related") {
            const ids = body.elementIds || [];
            const includeMetadata = !!body.includeMetadata;
            const filter = body.relationshipType || null;
            const results = bulkMap(ids, "elementId", (id) => {
                if (!objectsById.has(id)) return undefined;
                return edgesOf(id)
                    .filter((e) => !filter || e.relationshipType === filter)
                    .map((e) => ({
                        sourceRelationship: e.relationshipType,
                        object: serializeObject(objectsById.get(e.target), includeMetadata),
                    }));
            });
            return sendJSON(req, res, 200, okBulk(results));
        }

        // ── Query: current values ──
        if (method === "POST" && path === "/objects/value") {
            const ids = body.elementIds || [];
            const maxDepth = body.maxDepth === undefined ? 1 : body.maxDepth;
            const results = bulkMap(ids, "elementId", (id) => {
                const o = objectsById.get(id);
                if (!o) return undefined;
                const vqt = currentVQT(o);
                const result = {
                    isComposition: o.isComposition,
                    value: vqt.value,
                    quality: vqt.quality,
                    timestamp: vqt.timestamp,
                };
                // maxDepth > 1 (0 = infinite) returns the child values keyed by
                // elementId under "components".
                if (o.isComposition && maxDepth !== 1) {
                    const components = {};
                    for (const child of descendantsOf(id, maxDepth)) {
                        const cv = currentVQT(child);
                        components[child.elementId] = {
                            value: cv.value,
                            quality: cv.quality,
                            timestamp: cv.timestamp,
                        };
                    }
                    result.components = components;
                }
                return result;
            });
            return sendJSON(req, res, 200, okBulk(results));
        }

        // ── Query: history ──
        if (method === "POST" && path === "/objects/history") {
            // startTime and endTime are required and must be RFC 3339 UTC.
            for (const field of ["startTime", "endTime"]) {
                const v = body[field];
                if (v === undefined || v === null || v === "") {
                    return errEnv(req, res, 400, "Bad Request", `${field}: Field required`);
                }
                if (!UTC_TS_RE.test(String(v)) || Number.isNaN(Date.parse(String(v)))) {
                    return errEnv(
                        req, res, 400, "Bad Request",
                        `${field}: must be an RFC 3339 UTC timestamp (e.g. 2026-01-08T10:30:00Z), got ${JSON.stringify(v)}`
                    );
                }
            }
            const start = Date.parse(body.startTime);
            const end = Date.parse(body.endTime);
            const maxDepth = body.maxDepth === undefined ? 1 : body.maxDepth;
            const results = bulkMap(ids_(body), "elementId", (id) => {
                const o = objectsById.get(id);
                if (!o) return undefined;
                const result = {
                    isComposition: o.isComposition,
                    values: historyVQTs(o, start, end, 30),
                };
                if (o.isComposition && maxDepth !== 1) {
                    const components = {};
                    for (const child of descendantsOf(id, maxDepth)) {
                        components[child.elementId] = { values: historyVQTs(child, start, end, 30) };
                    }
                    result.components = components;
                }
                return result;
            });
            return sendJSON(req, res, 200, okBulk(results));
        }

        // ── Update: current values (bulk) ──
        if (method === "PUT" && path === "/objects/value") {
            const updates = body.updates || [];
            const results = updates.map((up) => {
                const o = objectsById.get(up && up.elementId);
                if (!o) return notFoundItem("elementId", up && up.elementId, "elementId");
                const v = up.value || {};
                valueOverrides.set(up.elementId, {
                    value: v.value,
                    quality: v.quality || "Good",
                    timestamp: v.timestamp || new Date().toISOString(),
                });
                return bulkOk("elementId", up.elementId, null);
            });
            return sendJSON(req, res, 200, okBulk(results));
        }

        // ── Update: history (bulk) ──
        if (method === "PUT" && path === "/objects/history") {
            const updates = body.updates || [];
            const results = updates.map((up) => {
                const o = objectsById.get(up && up.elementId);
                if (!o) return notFoundItem("elementId", up && up.elementId, "elementId");
                const arr = historyWrites.get(up.elementId) || [];
                const v = up.value || {};
                arr.push({ value: v.value, quality: v.quality || "Good", timestamp: v.timestamp || new Date().toISOString() });
                historyWrites.set(up.elementId, arr);
                return bulkOk("elementId", up.elementId, null);
            });
            return sendJSON(req, res, 200, okBulk(results));
        }

        // ── Subscriptions (clientId required on every endpoint) ──
        if (path.startsWith("/subscriptions")) {
            if (method !== "POST") return errEnv(req, res, 405, "Method Not Allowed", `${method} ${path}`);
            if (!body.clientId) {
                return errEnv(req, res, 400, "Bad Request", "clientId is required on all subscription endpoints");
            }
            const clientId = body.clientId;

            if (path === "/subscriptions") {
                const id = newSubscription(clientId, body.displayName);
                return sendJSON(req, res, 200, ok({
                    subscriptionId: id,
                    clientId,
                    displayName: body.displayName || null,
                }));
            }
            if (path === "/subscriptions/list") {
                const ids = body.subscriptionIds || [];
                const results = bulkMap(ids, "subscriptionId", (id) => {
                    const s = ownedSubscription(id, clientId);
                    if (!s) return undefined;
                    return {
                        subscriptionId: id,
                        displayName: s.displayName,
                        monitoredObjects: Array.from(s.items, ([elementId, maxDepth]) => ({ elementId, maxDepth })),
                    };
                }, "subscriptionId");
                return sendJSON(req, res, 200, okBulk(results));
            }
            if (path === "/subscriptions/delete") {
                const ids = body.subscriptionIds || [];
                const results = bulkMap(ids, "subscriptionId", (id) => {
                    const s = ownedSubscription(id, clientId);
                    if (!s) return undefined;
                    s.streams.forEach((fn) => fn());
                    subscriptions.delete(id);
                    return null;
                }, "subscriptionId");
                return sendJSON(req, res, 200, okBulk(results));
            }

            // The remaining endpoints act on a single subscription. A subscription
            // belonging to another client is indistinguishable from one that does
            // not exist.
            const sub = ownedSubscription(body.subscriptionId, clientId);
            if (!sub) {
                return errEnv(req, res, 404, "Not Found", `Unknown subscriptionId: ${body.subscriptionId}`);
            }

            if (path === "/subscriptions/register") {
                const ids = body.elementIds || [];
                const maxDepth = body.maxDepth === undefined || body.maxDepth === null ? 1 : body.maxDepth;
                const results = bulkMap(ids, "elementId", (id) => {
                    if (!objectsById.has(id)) return undefined;
                    sub.items.set(id, maxDepth);
                    return null;
                });
                return sendJSON(req, res, 200, okBulk(results));
            }
            if (path === "/subscriptions/unregister") {
                const ids = body.elementIds || [];
                const results = bulkMap(ids, "elementId", (id) => {
                    if (!sub.items.has(id)) return undefined;
                    sub.items.delete(id);
                    return null;
                });
                return sendJSON(req, res, 200, okBulk(results));
            }
            if (path === "/subscriptions/sync") {
                // lastSequenceNumber acknowledges; -1 clears the whole queue.
                sub.seq += 1;
                const batch = { sequenceNumber: sub.seq, updates: subUpdates(sub) };
                return sendJSON(req, res, 200, ok([batch]));
            }
            if (path === "/subscriptions/stream") {
                if (!STREAM_ENABLED) {
                    return errEnv(req, res, 501, "Not Implemented", "SSE streaming is disabled; use /subscriptions/sync polling");
                }
                // Only one stream per subscription: opening a new one closes the
                // existing stream cleanly (no error) before taking over.
                sub.streams.forEach((fn) => fn());
                res.writeHead(200, {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                });
                res.write(": connected\n\n");
                const tick = () => {
                    sub.seq += 1;
                    const batch = { sequenceNumber: sub.seq, updates: subUpdates(sub) };
                    res.write(`data: ${JSON.stringify(batch)}\n\n`);
                };
                const interval = setInterval(tick, 2000);
                const cleanup = () => {
                    clearInterval(interval);
                    sub.streams.delete(cleanup);
                    res.end();
                };
                sub.streams.add(cleanup);
                req.on("close", () => {
                    clearInterval(interval);
                    sub.streams.delete(cleanup);
                });
                return; // keep the connection open
            }
            return errEnv(req, res, 404, "Not Found", `Unknown subscription endpoint: ${path}`);
        }

        return errEnv(req, res, 404, "Not Found", `No route for ${method} ${path}`);
    } catch (err) {
        return errEnv(req, res, 500, "Internal Server Error", err.message);
    }
});

/** elementIds from a request body, defaulting to an empty list. */
function ids_(body) {
    return body.elementIds || [];
}

server.listen(PORT, () => {
    /* eslint-disable no-console */
    console.log(`i3X reference mock server listening on http://0.0.0.0:${PORT}`);
    console.log(`  spec ${SPEC_VERSION} · SSE streaming: ${STREAM_ENABLED ? "enabled" : "disabled (501)"}`);
    console.log(`  ${objectDefs.length} objects, ${objectTypes.length} types, ${namespaces.length} namespaces`);
});
