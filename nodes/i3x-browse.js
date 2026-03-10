/**
 * i3x-browse – Explore namespaces, object types, objects, and relationships.
 */
"use strict";

const { bindServer, parseIds, safeSend, statusError } = require("../lib/node-utils");

module.exports = function (RED) {
    function I3XBrowseNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.browseTarget = config.browseTarget || "objects";
        node.elementId = config.elementId || "";
        node.typeId = config.typeId || "";
        node.namespaceUri = config.namespaceUri || "";
        node.includeMetadata = config.includeMetadata || false;
        node.relationshipType = config.relationshipType || "";

        if (!bindServer(node, RED, config.server)) return;

        node.on("input", async function (msg, send, done) {
            send = safeSend(node, send);
            const client = node.server.client;

            const target = msg.browseTarget || node.browseTarget;
            const ids = parseIds(msg.elementId || node.elementId);
            const typeId = msg.typeId || node.typeId;
            const nsUri = msg.namespaceUri || node.namespaceUri;
            const inclMeta = msg.includeMetadata !== undefined ? msg.includeMetadata : node.includeMetadata;
            const relType = msg.relationshipType || node.relationshipType;

            node.status({ fill: "blue", shape: "dot", text: "browsing " + target + "..." });

            try {
                let result;
                switch (target) {
                    case "namespaces":
                        result = await client.getNamespaces();
                        break;
                    case "objecttypes":
                        if (ids.length) {
                            result = await client.queryObjectTypes(ids);
                        } else {
                            result = await client.getObjectTypes({ namespaceUri: nsUri || undefined });
                        }
                        break;
                    case "relationshiptypes":
                        if (ids.length) {
                            result = await client.queryRelationshipTypes(ids);
                        } else {
                            result = await client.getRelationshipTypes({ namespaceUri: nsUri || undefined });
                        }
                        break;
                    case "objects":
                        if (ids.length) {
                            result = await client.listObjects(ids, { includeMetadata: inclMeta });
                        } else {
                            result = await client.getObjects({ typeId: typeId || undefined, includeMetadata: inclMeta });
                        }
                        break;
                    case "related":
                        if (!ids.length) {
                            throw new Error("elementId is required for related objects query");
                        }
                        result = await client.getRelatedObjects(ids, {
                            relationshipType: relType || undefined,
                            includeMetadata: inclMeta,
                        });
                        break;
                    default:
                        throw new Error("Unknown browse target: " + target);
                }

                const count = Array.isArray(result) ? result.length : 1;
                msg.payload = result;
                node.status({ fill: "green", shape: "dot", text: count + " " + target });
                send(msg);
                if (done) done();
            } catch (err) {
                node.status({ fill: "red", shape: "ring", text: statusError(err.message) });
                if (done) done(err); else node.error(err, msg);
            }
        });
    }

    RED.nodes.registerType("i3x-browse", I3XBrowseNode);
};
