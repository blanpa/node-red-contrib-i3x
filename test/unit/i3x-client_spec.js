"use strict";

const { expect } = require("chai");
const sinon = require("sinon");
const nock = require("nock");
const I3XClient = require("../../lib/i3x-client");

const BASE = "https://i3x-test.example.com";

describe("I3XClient", function () {
    let client;

    afterEach(function () {
        nock.cleanAll();
        if (client) client.destroy();
    });

    // ── Constructor ────────────────────────────────────────────────

    describe("constructor", function () {
        it("should strip trailing slashes from baseUrl", function () {
            client = new I3XClient({ baseUrl: BASE + "///" });
            expect(client.baseUrl).to.equal(BASE);
        });

        it("should default timeout to 10000", function () {
            client = new I3XClient({ baseUrl: BASE });
            expect(client.timeout).to.equal(10000);
        });

        it("should accept custom timeout", function () {
            client = new I3XClient({ baseUrl: BASE, timeout: 5000 });
            expect(client.timeout).to.equal(5000);
        });

        it("should set basic auth header", function () {
            client = new I3XClient({
                baseUrl: BASE,
                authType: "basic",
                username: "user",
                password: "pass",
            });
            expect(client.http.defaults.auth).to.deep.equal({
                username: "user",
                password: "pass",
            });
        });

        it("should set bearer token header", function () {
            client = new I3XClient({
                baseUrl: BASE,
                authType: "bearer",
                token: "tok123",
            });
            expect(client.http.defaults.headers["Authorization"]).to.equal(
                "Bearer tok123"
            );
        });

        it("should set API key header", function () {
            client = new I3XClient({
                baseUrl: BASE,
                authType: "apikey",
                apiKey: "key456",
            });
            expect(client.http.defaults.headers["X-API-Key"]).to.equal("key456");
        });

        it("should prepend apiVersion to base URL", function () {
            client = new I3XClient({ baseUrl: BASE, apiVersion: "v0" });
            expect(client.http.defaults.baseURL).to.equal(BASE + "/v0");
        });
    });

    // ── Explore endpoints ──────────────────────────────────────────

    describe("getNamespaces()", function () {
        it("should GET /namespaces", async function () {
            const data = [{ uri: "https://example.com", displayName: "Test" }];
            nock(BASE).get("/namespaces").reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getNamespaces();
            expect(result).to.deep.equal(data);
        });
    });

    describe("getObjectTypes()", function () {
        it("should GET /objecttypes without filter", async function () {
            const data = [{ elementId: "t1", displayName: "Type1" }];
            nock(BASE).get("/objecttypes").reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getObjectTypes();
            expect(result).to.deep.equal(data);
        });

        it("should pass namespaceUri as query param", async function () {
            const data = [];
            nock(BASE)
                .get("/objecttypes")
                .query({ namespaceUri: "https://ns.example.com" })
                .reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getObjectTypes({
                namespaceUri: "https://ns.example.com",
            });
            expect(result).to.deep.equal(data);
        });
    });

    describe("queryObjectTypes()", function () {
        it("should POST /objecttypes/query with elementIds", async function () {
            const data = [{ elementId: "t1" }];
            nock(BASE)
                .post("/objecttypes/query", { elementIds: ["t1"] })
                .reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.queryObjectTypes(["t1"]);
            expect(result).to.deep.equal(data);
        });
    });

    describe("getRelationshipTypes()", function () {
        it("should GET /relationshiptypes", async function () {
            const data = [{ elementId: "r1", displayName: "HasChild" }];
            nock(BASE).get("/relationshiptypes").reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getRelationshipTypes();
            expect(result).to.deep.equal(data);
        });
    });

    describe("getObjects()", function () {
        it("should GET /objects", async function () {
            const data = [{ elementId: "obj1", displayName: "Pump" }];
            nock(BASE).get("/objects").reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getObjects();
            expect(result).to.deep.equal(data);
        });

        it("should pass typeId filter as typeElementId", async function () {
            nock(BASE)
                .get("/objects")
                .query({ typeElementId: "sensor-type" })
                .reply(200, []);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getObjects({ typeId: "sensor-type" });
            expect(result).to.deep.equal([]);
        });
    });

    describe("listObjects()", function () {
        it("should POST /objects/list", async function () {
            const data = [{ elementId: "obj1" }];
            nock(BASE)
                .post("/objects/list", { elementIds: ["obj1"] })
                .reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.listObjects(["obj1"]);
            expect(result).to.deep.equal(data);
        });
    });

    describe("getRelatedObjects()", function () {
        it("should POST /objects/related", async function () {
            const data = [{ elementId: "child1" }];
            nock(BASE)
                .post("/objects/related", { elementIds: ["parent1"] })
                .reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getRelatedObjects(["parent1"]);
            expect(result).to.deep.equal(data);
        });

        it("should pass relationship type filter", async function () {
            nock(BASE)
                .post("/objects/related", {
                    elementIds: ["p1"],
                    relationshipType: "HasChildren",
                })
                .reply(200, []);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getRelatedObjects(["p1"], {
                relationshipType: "HasChildren",
            });
            expect(result).to.deep.equal([]);
        });
    });

    // ── Query endpoints ────────────────────────────────────────────

    describe("readValues()", function () {
        it("should POST /objects/value", async function () {
            const data = { obj1: { data: [{ value: 42 }] } };
            nock(BASE)
                .post("/objects/value", { elementIds: ["obj1"] })
                .reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.readValues(["obj1"]);
            expect(result).to.deep.equal(data);
        });

        it("should pass maxDepth option", async function () {
            nock(BASE)
                .post("/objects/value", { elementIds: ["obj1"], maxDepth: 0 })
                .reply(200, {});

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.readValues(["obj1"], { maxDepth: 0 });
            expect(result).to.deep.equal({});
        });
    });

    describe("readHistory()", function () {
        it("should POST /objects/history", async function () {
            const data = { obj1: { data: [] } };
            nock(BASE)
                .post("/objects/history", { elementIds: ["obj1"] })
                .reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.readHistory(["obj1"]);
            expect(result).to.deep.equal(data);
        });

        it("should pass time range options", async function () {
            nock(BASE)
                .post("/objects/history", {
                    elementIds: ["obj1"],
                    startTime: "2025-01-01T00:00:00Z",
                    endTime: "2025-01-02T00:00:00Z",
                })
                .reply(200, {});

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.readHistory(["obj1"], {
                startTime: "2025-01-01T00:00:00Z",
                endTime: "2025-01-02T00:00:00Z",
            });
            expect(result).to.deep.equal({});
        });
    });

    // ── Update endpoints ───────────────────────────────────────────

    describe("writeValue()", function () {
        it("should PUT /objects/value with bulk updates body", async function () {
            nock(BASE)
                .put("/objects/value", {
                    updates: [{ elementId: "sensor-001", value: { value: 99.5 } }],
                })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.writeValue("sensor-001", { value: 99.5 });
            expect(result).to.deep.equal({ status: "ok" });
        });

        it("should wrap primitive values into a VQT", async function () {
            nock(BASE)
                .put("/objects/value", {
                    updates: [{ elementId: "id with spaces", value: { value: "test" } }],
                })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.writeValue("id with spaces", "test");
            expect(result).to.deep.equal({ status: "ok" });
        });
    });

    describe("writeValues()", function () {
        it("should write multiple objects in one request", async function () {
            nock(BASE)
                .put("/objects/value", {
                    updates: [
                        { elementId: "a", value: { value: 1 } },
                        { elementId: "b", value: { value: 2, quality: "Good" } },
                    ],
                })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.writeValues([
                { elementId: "a", value: 1 },
                { elementId: "b", value: { value: 2, quality: "Good" } },
            ]);
            expect(result).to.deep.equal({ status: "ok" });
        });

        it("should reject an empty updates array", async function () {
            client = new I3XClient({ baseUrl: BASE });
            try {
                await client.writeValues([]);
                expect.fail("should have thrown");
            } catch (err) {
                expect(err.message).to.include("non-empty array");
            }
        });

        it("should reject updates without elementId", async function () {
            client = new I3XClient({ baseUrl: BASE });
            try {
                await client.writeValues([{ value: 1 }]);
                expect.fail("should have thrown");
            } catch (err) {
                expect(err.message).to.include("elementId");
            }
        });
    });

    describe("writeHistory()", function () {
        it("should PUT /objects/history with one update per VQT", async function () {
            nock(BASE)
                .put("/objects/history", {
                    updates: [
                        {
                            elementId: "obj1",
                            value: { value: 1, quality: "Good", timestamp: "2026-01-01T00:00:00Z" },
                        },
                        {
                            elementId: "obj1",
                            value: { value: 2, quality: "Bad", timestamp: "2026-01-01T00:01:00Z" },
                        },
                    ],
                })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.writeHistory("obj1", [
                { value: 1, quality: "Good", timestamp: "2026-01-01T00:00:00Z" },
                { value: 2, quality: "Bad", timestamp: "2026-01-01T00:01:00Z" },
            ]);
            expect(result).to.deep.equal({ status: "ok" });
        });

        it("should default quality to Good and timestamp to now", async function () {
            nock(BASE)
                .put("/objects/history", (body) => {
                    const u = body.updates[0];
                    return (
                        u.elementId === "obj1" &&
                        u.value.value === 7 &&
                        u.value.quality === "Good" &&
                        /^\d{4}-\d{2}-\d{2}T.*Z$/.test(u.value.timestamp)
                    );
                })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.writeHistory("obj1", 7);
            expect(result).to.deep.equal({ status: "ok" });
        });
    });

    // ── Subscribe endpoints (1.0: clientId required) ─────────────

    describe("createSubscription()", function () {
        it("should POST /subscriptions with the client-level clientId", async function () {
            const data = { subscriptionId: "42" };
            nock(BASE)
                .post("/subscriptions", { clientId: "test-client" })
                .reply(200, data);

            client = new I3XClient({ baseUrl: BASE, clientId: "test-client" });
            const result = await client.createSubscription();
            expect(result).to.deep.equal(data);
        });

        it("should send a default clientId when none is configured", async function () {
            nock(BASE)
                .post("/subscriptions", (body) => typeof body.clientId === "string" && body.clientId.length > 0)
                .reply(200, { subscriptionId: "1" });

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.createSubscription();
            expect(result).to.have.property("subscriptionId", "1");
        });

        it("should allow overriding clientId and sending displayName", async function () {
            nock(BASE)
                .post("/subscriptions", { clientId: "my-app", displayName: "My App" })
                .reply(200, { subscriptionId: "2" });

            client = new I3XClient({ baseUrl: BASE, clientId: "test-client" });
            const result = await client.createSubscription({
                clientId: "my-app",
                displayName: "My App",
            });
            expect(result).to.have.property("subscriptionId", "2");
        });
    });

    describe("listSubscriptions()", function () {
        it("should POST /subscriptions/list with clientId and subscriptionIds", async function () {
            const data = [{ subscriptionId: "42", monitoredObjects: [] }];
            nock(BASE)
                .post("/subscriptions/list", { clientId: "test-client", subscriptionIds: ["42"] })
                .reply(200, data);

            client = new I3XClient({ baseUrl: BASE, clientId: "test-client" });
            const result = await client.listSubscriptions(["42"]);
            expect(result).to.deep.equal(data);
        });

        it("should allow overriding clientId per call", async function () {
            nock(BASE)
                .post("/subscriptions/list", { clientId: "app1", subscriptionIds: ["42"] })
                .reply(200, []);

            client = new I3XClient({ baseUrl: BASE, clientId: "test-client" });
            const result = await client.listSubscriptions(["42"], { clientId: "app1" });
            expect(result).to.deep.equal([]);
        });
    });

    describe("registerMonitoredItems()", function () {
        it("should POST /subscriptions/register with clientId and subscriptionId in body", async function () {
            nock(BASE)
                .post("/subscriptions/register", {
                    clientId: "test-client",
                    subscriptionId: "42",
                    elementIds: ["obj1"],
                    maxDepth: 1,
                })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE, clientId: "test-client" });
            const result = await client.registerMonitoredItems("42", ["obj1"]);
            expect(result).to.deep.equal({ status: "ok" });
        });

        it("should accept legacy positional maxDepth number", async function () {
            nock(BASE)
                .post("/subscriptions/register", {
                    clientId: "test-client",
                    subscriptionId: "42",
                    elementIds: ["obj1"],
                    maxDepth: 3,
                })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE, clientId: "test-client" });
            const result = await client.registerMonitoredItems("42", ["obj1"], 3);
            expect(result).to.deep.equal({ status: "ok" });
        });

        it("should accept options object with maxDepth and clientId", async function () {
            nock(BASE)
                .post("/subscriptions/register", {
                    clientId: "app1",
                    subscriptionId: "42",
                    elementIds: ["obj1"],
                    maxDepth: 2,
                })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE, clientId: "test-client" });
            const result = await client.registerMonitoredItems("42", ["obj1"], { maxDepth: 2, clientId: "app1" });
            expect(result).to.deep.equal({ status: "ok" });
        });
    });

    describe("unregisterMonitoredItems()", function () {
        it("should POST /subscriptions/unregister with clientId and subscriptionId in body", async function () {
            nock(BASE)
                .post("/subscriptions/unregister", {
                    clientId: "test-client",
                    subscriptionId: "42",
                    elementIds: ["obj1"],
                })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE, clientId: "test-client" });
            const result = await client.unregisterMonitoredItems("42", ["obj1"]);
            expect(result).to.deep.equal({ status: "ok" });
        });
    });

    describe("deleteSubscriptions()", function () {
        it("should POST /subscriptions/delete with clientId and subscriptionIds array", async function () {
            nock(BASE)
                .post("/subscriptions/delete", { clientId: "test-client", subscriptionIds: ["42"] })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE, clientId: "test-client" });
            const result = await client.deleteSubscriptions(["42"]);
            expect(result).to.deep.equal({ status: "ok" });
        });

        it("should delete multiple subscriptions at once", async function () {
            nock(BASE)
                .post("/subscriptions/delete", { clientId: "test-client", subscriptionIds: ["1", "2", "3"] })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE, clientId: "test-client" });
            const result = await client.deleteSubscriptions(["1", "2", "3"]);
            expect(result).to.deep.equal({ status: "ok" });
        });
    });

    describe("syncSubscription()", function () {
        it("should POST /subscriptions/sync with clientId and subscriptionId in body", async function () {
            // 1.0 Release: updates are grouped into sequence-numbered batches
            const data = [{ sequenceNumber: 1, updates: [{ elementId: "obj1", value: 123 }] }];
            nock(BASE)
                .post("/subscriptions/sync", { clientId: "test-client", subscriptionId: "42" })
                .reply(200, data);

            client = new I3XClient({ baseUrl: BASE, clientId: "test-client" });
            const result = await client.syncSubscription("42");
            expect(result).to.deep.equal(data);
        });

        it("should send lastSequenceNumber when provided", async function () {
            nock(BASE)
                .post("/subscriptions/sync", {
                    clientId: "test-client",
                    subscriptionId: "42",
                    lastSequenceNumber: 15,
                })
                .reply(200, [{ sequenceNumber: 16, updates: [{ elementId: "a", value: 1 }] }]);

            client = new I3XClient({ baseUrl: BASE, clientId: "test-client" });
            const result = await client.syncSubscription("42", { lastSequenceNumber: 15 });
            expect(result).to.deep.equal([{ sequenceNumber: 16, updates: [{ elementId: "a", value: 1 }] }]);
        });

        it("should support lastSequenceNumber = -1 (acknowledge all)", async function () {
            nock(BASE)
                .post("/subscriptions/sync", {
                    clientId: "test-client",
                    subscriptionId: "42",
                    lastSequenceNumber: -1,
                })
                .reply(200, []);

            client = new I3XClient({ baseUrl: BASE, clientId: "test-client" });
            const result = await client.syncSubscription("42", { lastSequenceNumber: -1 });
            expect(result).to.deep.equal([]);
        });
    });

    // ── testConnection ─────────────────────────────────────────────

    describe("testConnection()", function () {
        it("should resolve true on success", async function () {
            nock(BASE).get("/namespaces").reply(200, []);

            client = new I3XClient({ baseUrl: BASE });
            const ok = await client.testConnection();
            expect(ok).to.equal(true);
        });

        it("should reject on server error", async function () {
            nock(BASE).get("/namespaces").reply(500, "Internal Server Error");

            client = new I3XClient({ baseUrl: BASE });
            try {
                await client.testConnection();
                expect.fail("should have thrown");
            } catch (err) {
                expect(err.statusCode).to.equal(500);
            }
        });
    });

    // ── Retry logic ────────────────────────────────────────────────

    describe("retry logic", function () {
        it("should retry on 429 and succeed", async function () {
            nock(BASE).get("/namespaces").reply(429);
            nock(BASE).get("/namespaces").reply(200, [{ uri: "ok" }]);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getNamespaces();
            expect(result).to.deep.equal([{ uri: "ok" }]);
        });

        it("should retry on 503 and succeed", async function () {
            nock(BASE).get("/namespaces").reply(503);
            nock(BASE).get("/namespaces").reply(200, []);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getNamespaces();
            expect(result).to.deep.equal([]);
        });

        it("should give up after max retries", async function () {
            nock(BASE).get("/namespaces").times(4).reply(503);

            client = new I3XClient({ baseUrl: BASE });
            try {
                await client.getNamespaces();
                expect.fail("should have thrown");
            } catch (err) {
                expect(err.statusCode).to.equal(503);
            }
        });

        it("should not retry on 400", async function () {
            nock(BASE).get("/namespaces").reply(400, { detail: "bad request" });

            client = new I3XClient({ baseUrl: BASE });
            try {
                await client.getNamespaces();
                expect.fail("should have thrown");
            } catch (err) {
                expect(err.statusCode).to.equal(400);
            }
        });
    });

    // ── Error wrapping ─────────────────────────────────────────────

    describe("error wrapping", function () {
        it("should include statusCode and body on HTTP errors", async function () {
            nock(BASE)
                .get("/namespaces")
                .reply(422, { detail: [{ msg: "validation" }] });

            client = new I3XClient({ baseUrl: BASE });
            try {
                await client.getNamespaces();
                expect.fail("should have thrown");
            } catch (err) {
                expect(err._i3x).to.equal(true);
                expect(err.statusCode).to.equal(422);
                expect(err.body).to.deep.equal({
                    detail: [{ msg: "validation" }],
                });
            }
        });
    });

    // ── destroy ────────────────────────────────────────────────────

    describe("destroy()", function () {
        it("should clear active subscriptions", function () {
            client = new I3XClient({ baseUrl: BASE });
            const closeSpy = sinon.spy();
            client._activeSubscriptions.set("1", { close: closeSpy });
            client.destroy();
            expect(closeSpy.calledOnce).to.equal(true);
            expect(client._activeSubscriptions.size).to.equal(0);
        });

        it("should clear cache", function () {
            client = new I3XClient({ baseUrl: BASE });
            client._cache.set("test-key", [1, 2, 3]);
            expect(client._cache.get("test-key")).to.deep.equal([1, 2, 3]);
            client.destroy();
            expect(client._cache.get("test-key")).to.be.undefined;
        });
    });

    // ── Caching ─────────────────────────────────────────────────

    describe("caching", function () {
        it("should cache getNamespaces results", async function () {
            const data = [{ uri: "urn:cached", displayName: "Cached" }];
            const scope = nock(BASE).get("/namespaces").once().reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const r1 = await client.getNamespaces();
            const r2 = await client.getNamespaces();
            expect(r1).to.deep.equal(data);
            expect(r2).to.deep.equal(data);
            expect(scope.isDone()).to.be.true;
        });

        it("should cache getObjectTypes per namespaceUri", async function () {
            const data1 = [{ elementId: "t1" }];
            const data2 = [{ elementId: "t2" }];
            nock(BASE).get("/objecttypes").once().reply(200, data1);
            nock(BASE).get("/objecttypes").query({ namespaceUri: "urn:ns" }).once().reply(200, data2);

            client = new I3XClient({ baseUrl: BASE });
            const r1 = await client.getObjectTypes();
            const r2 = await client.getObjectTypes();
            const r3 = await client.getObjectTypes({ namespaceUri: "urn:ns" });
            const r4 = await client.getObjectTypes({ namespaceUri: "urn:ns" });
            expect(r1).to.deep.equal(data1);
            expect(r2).to.deep.equal(data1);
            expect(r3).to.deep.equal(data2);
            expect(r4).to.deep.equal(data2);
        });
    });

    // ── Retry-After header ──────────────────────────────────────

    describe("Retry-After header", function () {
        it("should respect Retry-After header in seconds", async function () {
            this.timeout(10000);
            nock(BASE).get("/namespaces").reply(429, {}, { "Retry-After": "1" });
            nock(BASE).get("/namespaces").reply(200, [{ uri: "urn:ok" }]);

            client = new I3XClient({ baseUrl: BASE });
            const start = Date.now();
            const result = await client.getNamespaces();
            const elapsed = Date.now() - start;
            expect(result).to.deep.equal([{ uri: "urn:ok" }]);
            expect(elapsed).to.be.at.least(900);
        });

        it("should fall back to exponential backoff without Retry-After", async function () {
            this.timeout(10000);
            nock(BASE).get("/namespaces").reply(503);
            nock(BASE).get("/namespaces").reply(200, []);

            client = new I3XClient({ baseUrl: BASE });
            const start = Date.now();
            const result = await client.getNamespaces();
            const elapsed = Date.now() - start;
            expect(result).to.deep.equal([]);
            expect(elapsed).to.be.at.least(900);
        });
    });

    // ── Input sanitization ──────────────────────────────────────

    describe("input sanitization", function () {
        it("should reject null payload in writeValue", async function () {
            client = new I3XClient({ baseUrl: BASE });
            try {
                await client.writeValue("obj1", null);
                expect.fail("should have thrown");
            } catch (err) {
                expect(err.message).to.include("must not be null");
            }
        });

        it("should reject undefined payload in writeHistory", async function () {
            client = new I3XClient({ baseUrl: BASE });
            try {
                await client.writeHistory("obj1", undefined);
                expect.fail("should have thrown");
            } catch (err) {
                expect(err.message).to.include("must not be null");
            }
        });

        it("should reject disallowed fields in object payload", async function () {
            client = new I3XClient({ baseUrl: BASE });
            try {
                await client.writeValue("obj1", { value: 1, malicious: "data" });
                expect.fail("should have thrown");
            } catch (err) {
                expect(err.message).to.include("Disallowed fields");
                expect(err.message).to.include("malicious");
            }
        });

        it("should allow valid VQT fields in object payload", async function () {
            nock(BASE)
                .put("/objects/value", {
                    updates: [{
                        elementId: "obj1",
                        value: { value: 42, quality: "Good", timestamp: "2025-01-01T00:00:00Z" },
                    }],
                })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.writeValue("obj1", {
                value: 42,
                timestamp: "2025-01-01T00:00:00Z",
                quality: "Good",
            });
            expect(result).to.deep.equal({ status: "ok" });
        });

        it("should allow primitive payloads (numbers, strings)", async function () {
            nock(BASE)
                .put("/objects/value", (body) => body.updates[0].value.value === 42)
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.writeValue("obj1", 42);
            expect(result).to.deep.equal({ status: "ok" });
        });

        it("should write array history payloads as one update per VQT", async function () {
            const payload = [{ value: 1, timestamp: "2025-01-01T00:00:00Z" }];
            nock(BASE)
                .put("/objects/history", {
                    updates: [{
                        elementId: "obj1",
                        value: { value: 1, quality: "Good", timestamp: "2025-01-01T00:00:00Z" },
                    }],
                })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.writeHistory("obj1", payload);
            expect(result).to.deep.equal({ status: "ok" });
        });
    });

    // ── Rate limiting ───────────────────────────────────────────

    describe("rate limiting", function () {
        it("should have a rate limiter instance", function () {
            client = new I3XClient({ baseUrl: BASE });
            expect(client._rateLimiter).to.exist;
        });
    });

    // ── GET /info ──────────────────────────────────────────────

    describe("getInfo()", function () {
        it("should GET /info", async function () {
            const data = {
                specVersion: "1.0-Beta",
                serverVersion: "2.1.0",
                serverName: "Test i3X Server",
                capabilities: { subscriptions: true, history: true },
            };
            nock(BASE).get("/info").reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getInfo();
            expect(result).to.deep.equal(data);
        });

        it("should cache getInfo results", async function () {
            const data = { specVersion: "1.0", serverName: "Cached" };
            const scope = nock(BASE).get("/info").once().reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const r1 = await client.getInfo();
            const r2 = await client.getInfo();
            expect(r1).to.deep.equal(data);
            expect(r2).to.deep.equal(data);
            expect(scope.isDone()).to.be.true;
        });
    });

    // ── HTTP 206 partial results ───────────────────────────────

    describe("readHistory() partial results", function () {
        it("should set _partial flag on 206 response", async function () {
            const data = { obj1: { data: [{ value: 1 }] } };
            nock(BASE)
                .post("/objects/history", { elementIds: ["obj1"] })
                .reply(206, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.readHistory(["obj1"]);
            expect(result).to.deep.equal({ obj1: { data: [{ value: 1 }] }, _partial: true });
            expect(result._partial).to.equal(true);
        });

        it("should not set _partial flag on 200 response", async function () {
            const data = { obj1: { data: [{ value: 1 }] } };
            nock(BASE)
                .post("/objects/history", { elementIds: ["obj1"] })
                .reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.readHistory(["obj1"]);
            expect(result._partial).to.be.undefined;
        });
    });

    // ── typeElementId support ──────────────────────────────────

    describe("getObjects() typeElementId", function () {
        it("should send typeElementId when typeElementId option is used", async function () {
            nock(BASE)
                .get("/objects")
                .query({ typeElementId: "sensor-type" })
                .reply(200, []);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getObjects({ typeElementId: "sensor-type" });
            expect(result).to.deep.equal([]);
        });

        it("should map legacy typeId option to typeElementId param", async function () {
            nock(BASE)
                .get("/objects")
                .query({ typeElementId: "pump-type" })
                .reply(200, []);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getObjects({ typeId: "pump-type" });
            expect(result).to.deep.equal([]);
        });

        it("should prefer typeElementId over typeId when both provided", async function () {
            nock(BASE)
                .get("/objects")
                .query({ typeElementId: "preferred-type" })
                .reply(200, []);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getObjects({
                typeElementId: "preferred-type",
                typeId: "legacy-type",
            });
            expect(result).to.deep.equal([]);
        });
    });

    // ── getObjects root parameter ─────────────────────────────

    describe("getObjects() root parameter", function () {
        it("should pass root=true as query param", async function () {
            nock(BASE)
                .get("/objects")
                .query({ root: "true" })
                .reply(200, [{ elementId: "root1" }]);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getObjects({ root: true });
            expect(result).to.deep.equal([{ elementId: "root1" }]);
        });
    });

    // ── getHistory (deprecated wrapper around POST /objects/history) ──

    describe("getHistory()", function () {
        it("should POST /objects/history with a single elementId", async function () {
            const data = [{ elementId: "obj1", values: [{ value: 42, timestamp: "2025-01-01T00:00:00Z" }] }];
            nock(BASE)
                .post("/objects/history", { elementIds: ["obj1"] })
                .reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getHistory("obj1");
            expect(result).to.deep.equal(data);
        });

        it("should pass startTime and endTime in the body", async function () {
            nock(BASE)
                .post("/objects/history", {
                    elementIds: ["obj1"],
                    startTime: "2025-01-01T00:00:00Z",
                    endTime: "2025-01-02T00:00:00Z",
                })
                .reply(200, []);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getHistory("obj1", {
                startTime: "2025-01-01T00:00:00Z",
                endTime: "2025-01-02T00:00:00Z",
            });
            expect(result).to.deep.equal([]);
        });

        it("should set _partial flag on 206 response", async function () {
            const data = [{ elementId: "obj1", values: [{ value: 1 }] }];
            nock(BASE).post("/objects/history", { elementIds: ["obj1"] }).reply(206, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.getHistory("obj1");
            expect(result._partial).to.equal(true);
        });
    });
});
