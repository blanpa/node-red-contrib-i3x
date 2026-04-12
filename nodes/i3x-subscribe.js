/**
 * i3x-subscribe – Subscribe to value changes via SSE streaming or polling fallback.
 */
"use strict";

const { bindServer, parseIds, statusError, clampMaxDepth } = require("../lib/node-utils");

module.exports = function (RED) {
    function I3XSubscribeNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.elementIds = config.elementIds || "";
        node.mode = config.mode || "sse";
        node.pollingInterval = Math.max(1000, parseInt(config.pollingInterval, 10) || 5000);
        node.maxDepth = clampMaxDepth(config.maxDepth);

        node._subscriptionId = null;
        node._sseHandle = null;
        node._pollTimer = null;
        node._closing = false;

        if (!bindServer(node, RED, config.server)) return;

        async function setup() {
            const client = node.server.client;
            const ids = parseIds(node.elementIds);
            if (ids.length === 0) {
                node.status({ fill: "yellow", shape: "ring", text: "no element IDs" });
                return;
            }

            node.status({ fill: "yellow", shape: "dot", text: "subscribing..." });

            try {
                const sub = await client.createSubscription();
                node._subscriptionId = sub.subscriptionId;
                await client.registerMonitoredItems(node._subscriptionId, ids, node.maxDepth);

                if (node.mode === "sse") {
                    startSSE(client);
                } else {
                    startPolling(client);
                }
            } catch (err) {
                node.status({ fill: "red", shape: "ring", text: statusError(err.message) });
                node.error("Subscription setup failed: " + err.message);

                if (node.mode === "sse" && !node._closing) {
                    node.warn("SSE setup failed, falling back to polling");
                    fallbackToPolling(client, ids);
                }
            }
        }

        async function fallbackToPolling(client, ids) {
            try {
                if (!node._subscriptionId) {
                    const sub = await client.createSubscription();
                    node._subscriptionId = sub.subscriptionId;
                    await client.registerMonitoredItems(node._subscriptionId, ids, node.maxDepth);
                }
                startPolling(client);
            } catch (pollErr) {
                node.status({ fill: "red", shape: "ring", text: "failed" });
                node.error("Polling fallback also failed: " + pollErr.message);
            }
        }

        function startSSE(client) {
            node.status({ fill: "green", shape: "dot", text: "streaming (SSE)" });

            node._sseHandle = client.streamSubscription(node._subscriptionId, {
                onData: (event) => {
                    if (node._closing) return;
                    node.send({ payload: event, topic: "i3x/subscription" });
                },
                onError: (err) => {
                    if (node._closing) return;
                    node.status({ fill: "red", shape: "ring", text: "stream error" });
                    node.error("SSE stream error: " + err.message);
                },
                onReconnect: (attempt) => {
                    if (node._closing) return;
                    node.status({ fill: "yellow", shape: "dot", text: "reconnecting (" + attempt + ")..." });
                    node.warn("SSE stream reconnecting, attempt " + attempt);
                },
            });
        }

        function startPolling(client) {
            node.status({ fill: "green", shape: "dot", text: "polling (" + node.pollingInterval + "ms)" });

            async function poll() {
                if (node._closing) return;
                try {
                    const data = await client.syncSubscription(node._subscriptionId);
                    if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
                        node.send({ payload: data, topic: "i3x/subscription" });
                    }
                } catch (err) {
                    if (!node._closing) {
                        node.status({ fill: "red", shape: "ring", text: "poll error" });
                        node.error("Polling error: " + err.message);
                    }
                }
            }

            poll();
            node._pollTimer = setInterval(poll, node.pollingInterval);
        }

        async function teardown(done) {
            node._closing = true;

            if (node._pollTimer) {
                clearInterval(node._pollTimer);
                node._pollTimer = null;
            }

            if (node._sseHandle) {
                node._sseHandle.close();
                node._sseHandle = null;
            }

            if (node._subscriptionId && node.server && node.server.client) {
                try {
                    await node.server.client.deleteSubscriptions([node._subscriptionId]);
                } catch (_) {
                    // best-effort cleanup
                }
                node._subscriptionId = null;
            }

            done();
        }

        if (node.server.connected) {
            setup();
        }
        node.server.on("connected", () => {
            if (!node._closing) {
                // Clean up stale state from a previous connection
                if (node._pollTimer) { clearInterval(node._pollTimer); node._pollTimer = null; }
                if (node._sseHandle) { node._sseHandle.close(); node._sseHandle = null; }
                node._subscriptionId = null;
                setup();
            }
        });

        node.on("close", teardown);
    }

    RED.nodes.registerType("i3x-subscribe", I3XSubscribeNode);
};
