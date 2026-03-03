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

        it("should pass typeId filter", async function () {
            nock(BASE)
                .get("/objects")
                .query({ typeId: "sensor-type" })
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
                    relationshiptype: "HasChildren",
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
        it("should PUT /objects/{elementId}/value", async function () {
            nock(BASE)
                .put("/objects/sensor-001/value", { value: 99.5 })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.writeValue("sensor-001", { value: 99.5 });
            expect(result).to.deep.equal({ status: "ok" });
        });

        it("should URL-encode elementId", async function () {
            nock(BASE)
                .put("/objects/id%20with%20spaces/value")
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.writeValue("id with spaces", "test");
            expect(result).to.deep.equal({ status: "ok" });
        });
    });

    // ── Subscribe endpoints ────────────────────────────────────────

    describe("createSubscription()", function () {
        it("should POST /subscriptions", async function () {
            const data = { subscriptionId: "42", message: "created" };
            nock(BASE).post("/subscriptions", {}).reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.createSubscription();
            expect(result).to.deep.equal(data);
        });
    });

    describe("listSubscriptions()", function () {
        it("should GET /subscriptions", async function () {
            const data = { subscriptionIds: [] };
            nock(BASE).get("/subscriptions").reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.listSubscriptions();
            expect(result).to.deep.equal(data);
        });
    });

    describe("registerMonitoredItems()", function () {
        it("should POST /subscriptions/{id}/register", async function () {
            nock(BASE)
                .post("/subscriptions/42/register", {
                    elementIds: ["obj1"],
                    maxDepth: 1,
                })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.registerMonitoredItems("42", ["obj1"]);
            expect(result).to.deep.equal({ status: "ok" });
        });
    });

    describe("unregisterMonitoredItems()", function () {
        it("should POST /subscriptions/{id}/unregister", async function () {
            nock(BASE)
                .post("/subscriptions/42/unregister", { elementIds: ["obj1"] })
                .reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.unregisterMonitoredItems("42", ["obj1"]);
            expect(result).to.deep.equal({ status: "ok" });
        });
    });

    describe("deleteSubscription()", function () {
        it("should DELETE /subscriptions/{id}", async function () {
            nock(BASE).delete("/subscriptions/42").reply(200, { status: "ok" });

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.deleteSubscription("42");
            expect(result).to.deep.equal({ status: "ok" });
        });
    });

    describe("syncSubscription()", function () {
        it("should POST /subscriptions/{id}/sync", async function () {
            const data = [{ elementId: "obj1", value: 123 }];
            nock(BASE).post("/subscriptions/42/sync", {}).reply(200, data);

            client = new I3XClient({ baseUrl: BASE });
            const result = await client.syncSubscription("42");
            expect(result).to.deep.equal(data);
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
    });
});
