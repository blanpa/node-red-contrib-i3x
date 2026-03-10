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

module.exports = { bindServer, parseIds, safeSend, statusError, clampMaxDepth };
