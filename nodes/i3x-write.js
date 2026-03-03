/**
 * i3x-write – Write a value or historical data to an i3X object.
 */
"use strict";

const { bindServer, safeSend } = require("../lib/node-utils");

module.exports = function (RED) {
    function I3XWriteNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.elementId = config.elementId || "";
        node.writeTarget = config.writeTarget || "value";

        if (!bindServer(node, RED, config.server)) return;

        node.on("input", async function (msg, send, done) {
            send = safeSend(node, send);
            const client = node.server.client;

            const elementId = msg.elementId || msg.nodeId || node.elementId;
            if (!elementId) {
                const err = new Error("elementId is required");
                if (done) done(err); else node.error(err, msg);
                return;
            }

            const value = msg.payload;
            if (value === undefined) {
                const err = new Error("msg.payload (value to write) is required");
                if (done) done(err); else node.error(err, msg);
                return;
            }

            const target = msg.writeTarget || node.writeTarget;
            node.status({ fill: "blue", shape: "dot", text: "writing..." });

            try {
                const result = target === "history"
                    ? await client.writeHistory(elementId, value)
                    : await client.writeValue(elementId, value);
                msg.payload = result;
                msg.elementId = elementId;
                node.status({ fill: "green", shape: "dot", text: "ok" });
                send(msg);
                if (done) done();
            } catch (err) {
                node.status({ fill: "red", shape: "ring", text: err.message.substring(0, 32) });
                if (done) done(err); else node.error(err, msg);
            }
        });
    }

    RED.nodes.registerType("i3x-write", I3XWriteNode);
};
