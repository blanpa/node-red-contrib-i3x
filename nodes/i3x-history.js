/**
 * i3x-history – Query historical values from the i3X API.
 */
"use strict";

const { bindServer, parseIds, safeSend, statusError, clampMaxDepth } = require("../lib/node-utils");

/**
 * Resolve relative time strings like "-1h", "-7d", "-30m" to ISO 8601.
 * @param {string} input
 * @returns {string|undefined} ISO 8601 timestamp
 */
function resolveTime(input) {
    if (!input) return undefined;
    const rel = /^-(\d+)([smhdw])$/i.exec(input.trim());
    if (!rel) return input;
    const amount = parseInt(rel[1], 10);
    const unit = rel[2].toLowerCase();
    const ms = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
    return new Date(Date.now() - amount * (ms[unit] || 0)).toISOString();
}

module.exports = function (RED) {
    function I3XHistoryNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.elementIds = config.elementIds || "";
        node.startTime = config.startTime || "";
        node.endTime = config.endTime || "";
        node.maxDepth = clampMaxDepth(config.maxDepth);

        if (!bindServer(node, RED, config.server)) return;

        node.on("input", async function (msg, send, done) {
            send = safeSend(node, send);
            const client = node.server.client;

            const ids = parseIds(msg.elementIds || msg.nodeIds || node.elementIds);
            if (ids.length === 0) {
                const err = new Error("elementIds is required");
                if (done) done(err); else node.error(err, msg);
                return;
            }

            const startTime = resolveTime(msg.startTime || node.startTime);
            const endTime = resolveTime(msg.endTime || node.endTime);
            const maxDepth = msg.maxDepth !== undefined ? clampMaxDepth(msg.maxDepth) : node.maxDepth;

            node.status({ fill: "blue", shape: "dot", text: "querying..." });

            try {
                const result = await client.readHistory(ids, { startTime, endTime, maxDepth });
                msg.payload = result;
                const count = Array.isArray(result) ? result.length : 1;
                node.status({ fill: "green", shape: "dot", text: count + " record" + (count !== 1 ? "s" : "") });
                send(msg);
                if (done) done();
            } catch (err) {
                node.status({ fill: "red", shape: "ring", text: statusError(err.message) });
                if (done) done(err); else node.error(err, msg);
            }
        });
    }

    RED.nodes.registerType("i3x-history", I3XHistoryNode);
};
