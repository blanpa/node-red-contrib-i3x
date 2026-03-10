/**
 * i3x-read – Read last known values from one or more i3X objects.
 */
"use strict";

const { bindServer, parseIds, safeSend, statusError, clampMaxDepth } = require("../lib/node-utils");

module.exports = function (RED) {
    function I3XReadNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.elementIds = config.elementIds || "";
        node.maxDepth = clampMaxDepth(config.maxDepth);

        if (!bindServer(node, RED, config.server)) return;

        node.on("input", async function (msg, send, done) {
            send = safeSend(node, send);
            const client = node.server.client;

            const ids = parseIds(msg.elementIds || msg.nodeIds || node.elementIds);
            if (ids.length === 0) {
                const err = new Error("elementIds is required (string, comma-separated, or array)");
                if (done) done(err); else node.error(err, msg);
                return;
            }

            const maxDepth = msg.maxDepth !== undefined ? clampMaxDepth(msg.maxDepth) : node.maxDepth;

            node.status({ fill: "blue", shape: "dot", text: "requesting..." });

            try {
                const result = await client.readValues(ids, { maxDepth });
                msg.payload = result;
                const count = Array.isArray(result) ? result.length : 1;
                node.status({ fill: "green", shape: "dot", text: count + " value" + (count !== 1 ? "s" : "") });
                send(msg);
                if (done) done();
            } catch (err) {
                node.status({ fill: "red", shape: "ring", text: statusError(err.message) });
                if (done) done(err); else node.error(err, msg);
            }
        });
    }

    RED.nodes.registerType("i3x-read", I3XReadNode);
};
