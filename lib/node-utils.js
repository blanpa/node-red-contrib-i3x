/**
 * Shared utilities for i3x Node-RED nodes.
 * Eliminates boilerplate for server binding and status management.
 */
"use strict";

/**
 * Bind an operation node to its i3x-server config node.
 * Sets up connection status indicators and returns false if no server is configured.
 *
 * @param {object} node  – the Node-RED node instance
 * @param {object} RED   – the Node-RED runtime
 * @param {string} serverId – config.server
 * @returns {boolean} true if server is available, false otherwise
 */
function bindServer(node, RED, serverId) {
    node.server = RED.nodes.getNode(serverId);

    if (!node.server) {
        node.status({ fill: "red", shape: "ring", text: "no server configured" });
        return false;
    }

    node.server.on("connected", () => {
        node.status({ fill: "green", shape: "dot", text: "connected" });
    });
    node.server.on("disconnected", () => {
        node.status({ fill: "red", shape: "ring", text: "disconnected" });
    });

    if (node.server.connected) {
        node.status({ fill: "green", shape: "dot", text: "connected" });
    }

    return true;
}

/**
 * Parse a value that may be a comma-separated string or an array into an array of strings.
 * @param {string|string[]} input
 * @returns {string[]}
 */
function parseIds(input) {
    if (Array.isArray(input)) return input;
    if (typeof input === "string") {
        return input.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return [];
}

/**
 * Backwards-compatible send helper for Node-RED < 1.0.
 * @param {object} node
 * @param {function|undefined} send
 * @returns {function}
 */
function safeSend(node, send) {
    return send || function () { node.send.apply(node, arguments); };
}

/**
 * Truncate an error message for node status display.
 * Keeps up to 48 characters and appends "..." if truncated.
 * @param {string} msg
 * @returns {string}
 */
function statusError(msg) {
    if (!msg) return "error";
    if (msg.length <= 48) return msg;
    return msg.substring(0, 45) + "...";
}

/**
 * Clamp maxDepth to a valid range (0–100).
 * @param {number} val
 * @param {number} [fallback=1]
 * @returns {number}
 */
function clampMaxDepth(val, fallback) {
    if (fallback === undefined) fallback = 1;
    var n = parseInt(val, 10);
    if (isNaN(n) || n < 0) return fallback;
    if (n > 100) return 100;
    return n;
}

/**
 * Flatten a `POST /objects/related` response into a plain list of object
 * records for the editor's browse tree.
 *
 * A conformant 1.0 server answers with a bulk envelope – one entry per
 * requested elementId, each carrying a `result` array of
 * `{sourceRelationship, object}` edges. Pre-1.0 servers returned the objects
 * flat; both shapes are accepted.
 *
 * @param {*} response – unwrapped body of POST /objects/related
 * @param {string} [sourceElementId] – the queried element, excluded from the result
 * @returns {Array<object>} object records, de-duplicated by elementId
 */
function flattenRelated(response, sourceElementId) {
    const out = [];
    const seen = new Set();
    const push = (obj, sourceRelationship) => {
        if (!obj || typeof obj !== "object") return;
        const eid = obj.elementId || obj.id;
        if (!eid || eid === sourceElementId || seen.has(eid)) return;
        seen.add(eid);
        out.push(sourceRelationship ? Object.assign({ sourceRelationship }, obj) : obj);
    };
    for (const entry of Array.isArray(response) ? response : []) {
        if (!entry || typeof entry !== "object") continue;
        if (Array.isArray(entry.result)) {
            // Bulk entry: result is a list of related-object edges
            for (const edge of entry.result) {
                if (edge && typeof edge === "object" && edge.object) {
                    push(edge.object, edge.sourceRelationship);
                } else {
                    push(edge);
                }
            }
        } else if (entry.object && typeof entry.object === "object") {
            push(entry.object, entry.sourceRelationship);
        } else if (entry.result && typeof entry.result === "object") {
            push(entry.result);
        } else {
            push(entry);
        }
    }
    return out;
}

/**
 * Flatten a `POST /objects/value` response into `{elementId, value, quality,
 * timestamp}` records for the editor's live-value widget.
 *
 * A conformant 1.0 server nests the VQT under `result`; pre-1.0 servers put the
 * fields directly on the bulk entry. Composition children reported under
 * `result.components` are included as their own records.
 *
 * @param {*} response – unwrapped body of POST /objects/value
 * @returns {Array<{elementId:string, value:*, quality:*, timestamp:*}>}
 */
function flattenValues(response) {
    const out = [];
    const push = (elementId, vqt) => {
        if (!elementId || !vqt || typeof vqt !== "object") return;
        out.push({
            elementId,
            value: vqt.value,
            quality: vqt.quality,
            timestamp: vqt.timestamp,
        });
    };
    for (const entry of Array.isArray(response) ? response : []) {
        if (!entry || typeof entry !== "object") continue;
        const eid = entry.elementId || entry.id;
        const vqt = entry.result && typeof entry.result === "object" ? entry.result : entry;
        push(eid, vqt);
        const components = vqt && vqt.components;
        if (components && typeof components === "object" && !Array.isArray(components)) {
            for (const [childId, childVqt] of Object.entries(components)) push(childId, childVqt);
        }
    }
    return out;
}

module.exports = { bindServer, parseIds, safeSend, statusError, clampMaxDepth, flattenRelated, flattenValues };
