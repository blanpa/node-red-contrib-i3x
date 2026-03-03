"use strict";

const { expect } = require("chai");
const I3XClient = require("../../lib/i3x-client");

const LIVE_URL = process.env.I3X_BASE_URL || "https://i3x.cesmii.net";

describe("Integration: i3X Live API (" + LIVE_URL + ")", function () {
    let client;

    before(function () {
        client = new I3XClient({ baseUrl: LIVE_URL, timeout: 15000 });
    });

    after(function () {
        client.destroy();
    });

    // ── Connectivity ───────────────────────────────────────────────

    describe("connectivity", function () {
        it("should pass testConnection()", async function () {
            const ok = await client.testConnection();
            expect(ok).to.equal(true);
        });
    });

    // ── Explore ────────────────────────────────────────────────────

    describe("explore", function () {
        it("should return namespaces", async function () {
            const ns = await client.getNamespaces();
            expect(ns).to.be.an("array").with.length.greaterThan(0);
            expect(ns[0]).to.have.property("uri");
            expect(ns[0]).to.have.property("displayName");
        });

        it("should return object types", async function () {
            const types = await client.getObjectTypes();
            expect(types).to.be.an("array").with.length.greaterThan(0);
            expect(types[0]).to.have.property("elementId");
            expect(types[0]).to.have.property("displayName");
            expect(types[0]).to.have.property("namespaceUri");
            expect(types[0]).to.have.property("schema");
        });

        it("should query object types by elementId", async function () {
            const allTypes = await client.getObjectTypes();
            const firstId = allTypes[0].elementId;
            const result = await client.queryObjectTypes([firstId]);
            expect(result).to.be.an("array").with.length.greaterThan(0);
            expect(result[0].elementId).to.equal(firstId);
        });

        it("should return relationship types", async function () {
            const types = await client.getRelationshipTypes();
            expect(types).to.be.an("array").with.length.greaterThan(0);
            expect(types[0]).to.have.property("elementId");
            expect(types[0]).to.have.property("displayName");
            expect(types[0]).to.have.property("reverseOf");
        });

        it("should return objects", async function () {
            const objects = await client.getObjects();
            expect(objects).to.be.an("array").with.length.greaterThan(0);
            expect(objects[0]).to.have.property("elementId");
            expect(objects[0]).to.have.property("displayName");
            expect(objects[0]).to.have.property("typeId");
            expect(objects[0]).to.have.property("namespaceUri");
        });

        it("should return objects with metadata", async function () {
            const objects = await client.getObjects({ includeMetadata: true });
            expect(objects).to.be.an("array").with.length.greaterThan(0);
        });

        it("should list objects by elementId", async function () {
            const all = await client.getObjects();
            const firstId = all[0].elementId;
            const result = await client.listObjects([firstId]);
            expect(result).to.be.an("array").with.length.greaterThan(0);
            expect(result[0].elementId).to.equal(firstId);
        });

        it("should query related objects", async function () {
            const all = await client.getObjects();
            const withChildren = all.find((o) => o.isComposition) || all[0];
            const result = await client.getRelatedObjects([withChildren.elementId]);
            expect(result).to.be.an("array");
        });
    });

    // ── Query ──────────────────────────────────────────────────────

    describe("query", function () {
        it("should read last known values", async function () {
            const objects = await client.getObjects();
            const id = objects[0].elementId;
            const result = await client.readValues([id]);
            expect(result).to.be.an("object");
            expect(result).to.have.property(id);
            expect(result[id]).to.have.property("data");
        });

        it("should read values with maxDepth=0 (recursive)", async function () {
            const objects = await client.getObjects();
            const comp = objects.find((o) => o.isComposition);
            if (!comp) return this.skip();

            const result = await client.readValues([comp.elementId], { maxDepth: 0 });
            expect(result).to.be.an("object");
            const entry = result[comp.elementId];
            expect(entry).to.have.property("data");
            const keys = Object.keys(entry);
            expect(keys.length).to.be.greaterThan(1);
        });

        it("should query historical values", async function () {
            const objects = await client.getObjects();
            const id = objects[0].elementId;
            const result = await client.readHistory([id], {
                startTime: new Date(Date.now() - 86400000).toISOString(),
            });
            expect(result).to.be.an("object");
            expect(result).to.have.property(id);
        });
    });

    // ── Subscribe lifecycle ────────────────────────────────────────

    describe("subscribe lifecycle", function () {
        let subscriptionId;

        it("should create a subscription", async function () {
            const sub = await client.createSubscription();
            expect(sub).to.have.property("subscriptionId");
            expect(sub).to.have.property("message");
            subscriptionId = sub.subscriptionId;
        });

        it("should list subscriptions", async function () {
            const subs = await client.listSubscriptions();
            expect(subs).to.have.property("subscriptionIds");
            expect(subs.subscriptionIds).to.be.an("array");
        });

        it("should register monitored items", async function () {
            const objects = await client.getObjects();
            const id = objects[0].elementId;
            const result = await client.registerMonitoredItems(subscriptionId, [id]);
            expect(result).to.exist;
        });

        it("should get subscription details", async function () {
            const detail = await client.getSubscription(subscriptionId);
            expect(detail).to.exist;
        });

        it("should sync subscription (poll)", async function () {
            const data = await client.syncSubscription(subscriptionId);
            expect(data).to.be.an("array");
        });

        it("should unregister monitored items", async function () {
            const objects = await client.getObjects();
            const id = objects[0].elementId;
            const result = await client.unregisterMonitoredItems(subscriptionId, [id]);
            expect(result).to.exist;
        });

        it("should delete subscription", async function () {
            const result = await client.deleteSubscription(subscriptionId);
            expect(result).to.exist;
        });
    });
});
