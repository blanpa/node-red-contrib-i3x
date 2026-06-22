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
 *   - Error envelope: {success:false, responseDetail:{title,status,detail}}
 *   - ISA-95-style sample model (Enterprise → Site → Area → Line → Machine → Sensor)
 *   - Live, time-varying sensor values (sine / enum / boolean generators)
 *   - Historical series generation between start/end
 *   - Subscriptions with SSE streaming AND sync polling (clientId enforced)
 *   - GET /info advertising capabilities (toggle SSE via I3X_STREAM=off → 501)
 *
 * Run: node server.js        (PORT env, default 8080)
 * No external dependencies – Node 18+ built-in http only.
 */
"use strict";

const http = require("http");

const PORT = parseInt(process.env.PORT, 10) || 8080;
const STREAM_ENABLED = (process.env.I3X_STREAM || "on").toLowerCase() !== "off";
const SPEC_VERSION = "1.0";
const SERVER_VERSION = "i3x-mock 1.0.0";
const SERVER_NAME = "i3X Reference Mock (Acme Manufacturing)";

// ── Information model ──────────────────────────────────────────────────

const NS_SAMPLE = "https://cesmii.org/i3x/sample/";
const NS_ISA95 = "http://www.isa.org/ISA95/";
const NS_OPCUA = "http://opcfoundation.org/UA/";

const namespaces = [
    { uri: NS_OPCUA, displayName: "OPC UA Base" },
    { uri: NS_ISA95, displayName: "ISA-95 Equipment Hierarchy" },
    { uri: NS_SAMPLE, displayName: "i3X Sample Factory" },
];

const objectTypes = [
    mkType("type-enterprise", "Enterprise", NS_ISA95),
    mkType("type-site", "Site", NS_ISA95),
    mkType("type-area", "Area", NS_ISA95),
    mkType("type-line", "ProductionLine", NS_ISA95),
    mkType("type-machine", "Machine", NS_SAMPLE),
    mkType("type-tank", "Tank", NS_SAMPLE),
    mkType("type-sensor", "Sensor", NS_SAMPLE),
];

function mkType(elementId, displayName, namespaceUri) {
    return {
        elementId,
        displayName,
        namespaceUri,
        sourceTypeId: elementId,
        version: "1.0",
        schema: { type: "object" },
        related: null,
    };
}

const relationshipTypes = [
    { elementId: "rel-contains", displayName: "Contains", namespaceUri: NS_ISA95, relationshipId: "rel-contains", reverseOf: "isContainedIn" },
    { elementId: "rel-hasChild", displayName: "HasChild", namespaceUri: NS_SAMPLE, relationshipId: "rel-hasChild", reverseOf: "hasParent" },
    { elementId: "rel-feeds", displayName: "Feeds", namespaceUri: NS_SAMPLE, relationshipId: "rel-feeds", reverseOf: "isFedBy" },
];

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
    sensor("sensor-state-1", "State", "mach-1", { kind: "enum", states: ["Running", "Idle", "Cleaning", "Fault"], unit: null }),
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
    return { elementId, displayName, typeElementId: "type-sensor", parentId, isComposition: false, gen };
}

const objectsById = new Map(objectDefs.map((o) => [o.elementId, o]));
const typesById = new Map(objectTypes.map((t) => [t.elementId, t]));

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
        base.metadata = {
            typeNamespaceUri: type ? type.namespaceUri : null,
            sourceTypeId: o.typeElementId,
            description: o.gen ? `${o.displayName} sensor` : `${o.displayName} container`,
            relationships: { children: childrenOf(o.elementId).map((c) => c.elementId) },
            schemaExtensions: o.gen && o.gen.unit ? { engineeringUnit: o.gen.unit } : null,
            system: { isComposition: o.isComposition },
        };
    }
    return base;
}

// ── Subscriptions ──────────────────────────────────────────────────────

let subCounter = 0;
const subscriptions = new Map(); // subscriptionId -> { clientId, displayName, items:Set, seq, streams:Set }

function newSubscription(clientId, displayName) {
    const subscriptionId = "sub-" + ++subCounter;
    subscriptions.set(subscriptionId, {
        clientId,
        displayName: displayName || null,
        items: new Set(),
        seq: 0,
        streams: new Set(),
    });
    return subscriptionId;
}

function subUpdates(sub) {
    const updates = [];
    for (const eid of sub.items) {
        const o = objectsById.get(eid);
        if (!o) continue;
        const vqt = currentVQT(o);
        updates.push({ elementId: eid, value: vqt.value, quality: vqt.quality, timestamp: vqt.timestamp });
    }
    return updates;
}

// ── HTTP helpers ───────────────────────────────────────────────────────

function sendJSON(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(json) });
    res.end(json);
}
const ok = (result) => ({ success: true, result });
const okBulk = (results) => ({ success: true, results });
function errEnv(res, status, title, detail) {
    sendJSON(res, status, { success: false, responseDetail: { title, status, detail } });
}
function bulkEntry(elementId, result) {
    return { success: true, elementId, subscriptionId: null, result, responseDetail: null };
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
            return sendJSON(res, 200, ok({
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
            return sendJSON(res, 200, ok(namespaces));
        }
        if (method === "GET" && path === "/objecttypes") {
            const ns = q.get("namespaceUri");
            const list = ns ? objectTypes.filter((t) => t.namespaceUri === ns) : objectTypes;
            return sendJSON(res, 200, ok(list));
        }
        if (method === "POST" && path === "/objecttypes/query") {
            const ids = body.elementIds || [];
            return sendJSON(res, 200, ok(objectTypes.filter((t) => ids.includes(t.elementId))));
        }
        if (method === "GET" && path === "/relationshiptypes") {
            const ns = q.get("namespaceUri");
            const list = ns ? relationshipTypes.filter((t) => t.namespaceUri === ns) : relationshipTypes;
            return sendJSON(res, 200, ok(list));
        }
        if (method === "POST" && path === "/relationshiptypes/query") {
            const ids = body.elementIds || [];
            return sendJSON(res, 200, ok(relationshipTypes.filter((t) => ids.includes(t.elementId))));
        }
        if (method === "GET" && path === "/objects") {
            const typeFilter = q.get("typeElementId") || q.get("typeId");
            const includeMetadata = q.get("includeMetadata") === "true";
            const rootOnly = q.get("root") === "true";
            let list = objectDefs;
            if (typeFilter) list = list.filter((o) => o.typeElementId === typeFilter);
            if (rootOnly) list = list.filter((o) => o.parentId === null);
            return sendJSON(res, 200, ok(list.map((o) => serializeObject(o, includeMetadata))));
        }
        if (method === "POST" && path === "/objects/list") {
            const ids = body.elementIds || [];
            const includeMetadata = !!body.includeMetadata;
            const list = ids.map((id) => objectsById.get(id)).filter(Boolean);
            return sendJSON(res, 200, ok(list.map((o) => serializeObject(o, includeMetadata))));
        }
        if (method === "POST" && path === "/objects/related") {
            const ids = body.elementIds || [];
            const includeMetadata = !!body.includeMetadata;
            const seen = new Set();
            const related = [];
            for (const id of ids) {
                for (const child of childrenOf(id)) {
                    if (seen.has(child.elementId)) continue;
                    seen.add(child.elementId);
                    related.push(serializeObject(child, includeMetadata));
                }
            }
            return sendJSON(res, 200, ok(related));
        }

        // ── Query: current values ──
        if (method === "POST" && path === "/objects/value") {
            const ids = body.elementIds || [];
            const maxDepth = body.maxDepth === undefined ? 1 : body.maxDepth;
            const results = [];
            const expand = (id, depth) => {
                const o = objectsById.get(id);
                if (!o) {
                    results.push({ success: false, elementId: id, subscriptionId: null, result: null,
                        responseDetail: { title: "Not Found", status: 404, detail: `Unknown elementId: ${id}` } });
                    return;
                }
                const vqt = currentVQT(o);
                const result = { value: vqt.value, quality: vqt.quality, timestamp: vqt.timestamp, isComposition: o.isComposition };
                // Flat fields (elementId/value/quality/timestamp) included for editor live-value widget.
                results.push(Object.assign(bulkEntry(id, result), vqt));
                if (depth !== 1) {
                    for (const child of childrenOf(id)) expand(child.elementId, depth === 0 ? 0 : depth - 1);
                }
            };
            ids.forEach((id) => expand(id, maxDepth));
            return sendJSON(res, 200, okBulk(results));
        }

        // ── Query: history ──
        if (method === "POST" && path === "/objects/history") {
            const ids = body.elementIds || [];
            const parseTs = (v, fallback) => {
                const t = v ? Date.parse(v) : NaN;
                return Number.isNaN(t) ? fallback : t;
            };
            const end = parseTs(body.endTime, Date.now());
            const start = parseTs(body.startTime, end - 3600000);
            const result = ids.map((id) => {
                const o = objectsById.get(id);
                if (!o) return { elementId: id, values: [] };
                return { elementId: id, values: historyVQTs(o, start, end, 30) };
            });
            return sendJSON(res, 200, ok(result));
        }

        // ── Update: current values (bulk) ──
        if (method === "PUT" && path === "/objects/value") {
            const updates = body.updates || [];
            const results = updates.map((up) => {
                const o = objectsById.get(up.elementId);
                if (!o) {
                    return { success: false, elementId: up.elementId, subscriptionId: null, result: null,
                        responseDetail: { title: "Not Found", status: 404, detail: `Unknown elementId: ${up.elementId}` } };
                }
                const v = up.value || {};
                valueOverrides.set(up.elementId, {
                    value: v.value,
                    quality: v.quality || "Good",
                    timestamp: v.timestamp || new Date().toISOString(),
                });
                return bulkEntry(up.elementId, null);
            });
            return sendJSON(res, 200, okBulk(results));
        }

        // ── Update: history (bulk) ──
        if (method === "PUT" && path === "/objects/history") {
            const updates = body.updates || [];
            const results = updates.map((up) => {
                const o = objectsById.get(up.elementId);
                if (!o) {
                    return { success: false, elementId: up.elementId, subscriptionId: null, result: null,
                        responseDetail: { title: "Not Found", status: 404, detail: `Unknown elementId: ${up.elementId}` } };
                }
                const arr = historyWrites.get(up.elementId) || [];
                const v = up.value || {};
                arr.push({ value: v.value, quality: v.quality || "Good", timestamp: v.timestamp || new Date().toISOString() });
                historyWrites.set(up.elementId, arr);
                return bulkEntry(up.elementId, null);
            });
            return sendJSON(res, 200, okBulk(results));
        }

        // ── Subscriptions (clientId required on every endpoint) ──
        if (path.startsWith("/subscriptions")) {
            if (method !== "POST") return errEnv(res, 405, "Method Not Allowed", `${method} ${path}`);
            if (!body.clientId) {
                return errEnv(res, 400, "Bad Request", "clientId is required on all subscription endpoints");
            }

            if (path === "/subscriptions") {
                const id = newSubscription(body.clientId, body.displayName);
                return sendJSON(res, 200, ok({ subscriptionId: id, clientId: body.clientId, displayName: body.displayName || null }));
            }
            if (path === "/subscriptions/list") {
                const ids = body.subscriptionIds || [];
                const list = ids
                    .filter((id) => subscriptions.has(id))
                    .map((id) => {
                        const s = subscriptions.get(id);
                        return { subscriptionId: id, clientId: s.clientId, displayName: s.displayName,
                            monitoredItems: Array.from(s.items) };
                    });
                return sendJSON(res, 200, ok(list));
            }
            if (path === "/subscriptions/delete") {
                const ids = body.subscriptionIds || [];
                ids.forEach((id) => {
                    const s = subscriptions.get(id);
                    if (s) { s.streams.forEach((fn) => fn()); subscriptions.delete(id); }
                });
                return sendJSON(res, 200, ok({ deleted: ids }));
            }

            const sub = subscriptions.get(body.subscriptionId);
            if (!sub && path !== "/subscriptions") {
                return errEnv(res, 404, "Not Found", `Unknown subscriptionId: ${body.subscriptionId}`);
            }

            if (path === "/subscriptions/register") {
                (body.elementIds || []).forEach((id) => sub.items.add(id));
                return sendJSON(res, 200, ok({ subscriptionId: body.subscriptionId, monitoredItems: Array.from(sub.items) }));
            }
            if (path === "/subscriptions/unregister") {
                (body.elementIds || []).forEach((id) => sub.items.delete(id));
                return sendJSON(res, 200, ok({ subscriptionId: body.subscriptionId, monitoredItems: Array.from(sub.items) }));
            }
            if (path === "/subscriptions/sync") {
                // lastSequenceNumber acknowledges; we always generate a fresh batch.
                sub.seq += 1;
                const batch = { sequenceNumber: sub.seq, updates: subUpdates(sub) };
                return sendJSON(res, 200, ok([batch]));
            }
            if (path === "/subscriptions/stream") {
                if (!STREAM_ENABLED) {
                    return errEnv(res, 501, "Not Implemented", "SSE streaming is disabled; use /subscriptions/sync polling");
                }
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
                const cleanup = () => { clearInterval(interval); sub.streams.delete(cleanup); };
                sub.streams.add(cleanup);
                req.on("close", cleanup);
                return; // keep the connection open
            }
            return errEnv(res, 404, "Not Found", `Unknown subscription endpoint: ${path}`);
        }

        return errEnv(res, 404, "Not Found", `No route for ${method} ${path}`);
    } catch (err) {
        return errEnv(res, 500, "Internal Server Error", err.message);
    }
});

server.listen(PORT, () => {
    /* eslint-disable no-console */
    console.log(`i3X reference mock server listening on http://0.0.0.0:${PORT}`);
    console.log(`  spec ${SPEC_VERSION} · SSE streaming: ${STREAM_ENABLED ? "enabled" : "disabled (501)"}`);
    console.log(`  ${objectDefs.length} objects, ${objectTypes.length} types, ${namespaces.length} namespaces`);
});
