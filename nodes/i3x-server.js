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
};
