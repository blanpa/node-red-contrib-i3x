/**
 * i3x-server – Config node providing a shared I3XClient instance.
 */
"use strict";

const I3XClient = require("../lib/i3x-client");

module.exports = function (RED) {
    function I3XServerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.name = config.name;
        node.baseUrl = config.baseUrl;
        node.apiVersion = config.apiVersion || "";
        node.authType = config.authType || "none";
        node.timeout = parseInt(config.timeout, 10) || 10000;
        node.tlsConfigId = config.tlsConfig;

        const clientConfig = {
            baseUrl: node.baseUrl,
            apiVersion: node.apiVersion,
            authType: node.authType,
            timeout: node.timeout,
        };

        if (node.credentials) {
            clientConfig.username = node.credentials.username;
            clientConfig.password = node.credentials.password;
            clientConfig.token = node.credentials.token;
            clientConfig.apiKey = node.credentials.apiKey;
        }

        if (node.tlsConfigId) {
            const tlsNode = RED.nodes.getNode(node.tlsConfigId);
            if (tlsNode && tlsNode.addTLSOptions) {
                const tlsOpts = {};
                tlsNode.addTLSOptions(tlsOpts);
                if (tlsOpts.ca || tlsOpts.cert || tlsOpts.key || tlsOpts.rejectUnauthorized !== undefined) {
                    clientConfig.tlsOptions = tlsOpts;
                }
            }
        }

        node.client = new I3XClient(clientConfig);
        node.setMaxListeners(0);

        // Warn if credentials are sent over plain HTTP
        if (node.client._httpsWarning) {
            node.warn(node.client._httpsWarning);
        }

        node.client.testConnection()
            .then(() => {
                node.connected = true;
                node.emit("connected");
                node.log("Connected to i3X server: " + node.baseUrl);
            })
            .catch((err) => {
                node.connected = false;
                node.emit("disconnected", err);
                node.warn("i3X connection test failed: " + err.message);
            });

        node.on("close", function (done) {
            node.client.destroy();
            node.connected = false;
            done();
        });
    }

    RED.nodes.registerType("i3x-server", I3XServerNode, {
        credentials: {
            username: { type: "text" },
            password: { type: "password" },
            token: { type: "password" },
            apiKey: { type: "password" },
        },
    });

    // ── Admin browse endpoints for editor treeview ─────────────────────

    RED.httpAdmin.get("/i3x-server/:id/browse/objecttypes", async function (req, res) {
        const node = RED.nodes.getNode(req.params.id);
        if (!node || !node.client) {
            return res.status(404).json({ error: "Server not found – please deploy first" });
        }
        try {
            const result = await node.client.getObjectTypes({
                namespaceUri: req.query.namespaceUri || undefined,
            });
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    RED.httpAdmin.get("/i3x-server/:id/browse/objects", async function (req, res) {
        const node = RED.nodes.getNode(req.params.id);
        if (!node || !node.client) {
            return res.status(404).json({ error: "Server not found – please deploy first" });
        }
        try {
            const opts = {};
            if (req.query.typeId) opts.typeId = req.query.typeId;
            if (req.query.includeMetadata === "true") opts.includeMetadata = true;
            const result = await node.client.getObjects(opts);
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    RED.httpAdmin.get("/i3x-server/:id/browse/related/:elementId", async function (req, res) {
        const node = RED.nodes.getNode(req.params.id);
        if (!node || !node.client) {
            return res.status(404).json({ error: "Server not found – please deploy first" });
        }
        try {
            const result = await node.client.getRelatedObjects(
                [req.params.elementId],
                { includeMetadata: true }
            );
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── Server-side search across all objects ──────────────────────────
    RED.httpAdmin.get("/i3x-server/:id/browse/search", async function (req, res) {
        const node = RED.nodes.getNode(req.params.id);
        if (!node || !node.client) {
            return res.status(404).json({ error: "Server not found – please deploy first" });
        }
        try {
            const q = (req.query.q || "").toLowerCase();
            if (!q || q.length < 2) {
                return res.json([]);
            }
            // Fetch all object types then all objects per type, filter by query
            const types = await node.client.getObjectTypes({});
            const results = [];
            const MAX_RESULTS = 50;
            for (const type of (Array.isArray(types) ? types : [])) {
                const tid = type.elementId || type.id;
                const objects = await node.client.getObjects({ typeId: tid });
                for (const obj of (Array.isArray(objects) ? objects : [])) {
                    const eid = obj.elementId || obj.id || "";
                    const name = obj.displayName || "";
                    if (name.toLowerCase().includes(q) || eid.toLowerCase().includes(q)) {
                        results.push({
                            elementId: eid,
                            displayName: name,
                            typeName: type.displayName || tid,
                            typeId: tid,
                        });
                        if (results.length >= MAX_RESULTS) break;
                    }
                }
                if (results.length >= MAX_RESULTS) break;
            }
            res.json(results);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── Read live values for browser widget ────────────────────────────
    RED.httpAdmin.post("/i3x-server/:id/browse/values", async function (req, res) {
        const node = RED.nodes.getNode(req.params.id);
        if (!node || !node.client) {
            return res.status(404).json({ error: "Server not found – please deploy first" });
        }
        try {
            const elementIds = req.body && req.body.elementIds;
            if (!Array.isArray(elementIds) || elementIds.length === 0) {
                return res.json([]);
            }
            // Limit batch size to prevent abuse
            const ids = elementIds.slice(0, 50);
            const result = await node.client.readValues(ids, { maxDepth: 1 });
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── Connection status check ───────────────────────────────────────
    RED.httpAdmin.get("/i3x-server/:id/status", function (req, res) {
        const node = RED.nodes.getNode(req.params.id);
        if (!node) {
            return res.status(404).json({ connected: false, error: "Node not found" });
        }
        res.json({ connected: !!node.connected });
    });
};
