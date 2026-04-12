"use strict";

const helper = require("node-red-node-test-helper");
const { expect } = require("chai");
const nock = require("nock");

const serverNode = require("../../nodes/i3x-server");
const browseNode = require("../../nodes/i3x-browse");
const readNode = require("../../nodes/i3x-read");
const writeNode = require("../../nodes/i3x-write");
const historyNode = require("../../nodes/i3x-history");
const subscribeNode = require("../../nodes/i3x-subscribe");

const BASE = "https://i3x-test.example.com";

helper.init(require.resolve("node-red"));

describe("i3x Node-RED Nodes", function () {
    beforeEach(function (done) {
        helper.startServer(done);
    });

    afterEach(function (done) {
        nock.cleanAll();
        helper.unload().then(() => helper.stopServer(done));
    });

    function serverConfig(overrides) {
        return Object.assign(
            {
                id: "server1",
                type: "i3x-server",
                name: "Test Server",
                baseUrl: BASE,
                apiVersion: "",
                authType: "none",
                timeout: "5000",
            },
            overrides
        );
    }

    // ── i3x-server ─────────────────────────────────────────────────

    describe("i3x-server", function () {
        it("should load config node", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);
            const flow = [serverConfig()];
            helper.load(serverNode, flow, function () {
                const n = helper.getNode("server1");
                expect(n).to.exist;
                expect(n.name).to.equal("Test Server");
                expect(n.client).to.exist;
                done();
            });
        });

        it("should create client with correct baseUrl", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);
            const flow = [serverConfig()];
            helper.load(serverNode, flow, function () {
                const n = helper.getNode("server1");
                expect(n.client.baseUrl).to.equal(BASE);
                done();
            });
        });

        it("should set connected=true on successful test", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);
            const flow = [serverConfig()];
            helper.load(serverNode, flow, function () {
                const n = helper.getNode("server1");
                n.on("connected", () => {
                    expect(n.connected).to.equal(true);
                    done();
                });
                if (n.connected) done();
            });
        });

        it("should handle connection failure gracefully", function (done) {
            nock(BASE).get("/namespaces").reply(500, "fail");
            const flow = [serverConfig()];
            helper.load(serverNode, flow, function () {
                const n = helper.getNode("server1");
                n.on("disconnected", () => {
                    expect(n.connected).to.equal(false);
                    done();
                });
            });
        });
    });

    // ── i3x-browse ─────────────────────────────────────────────────

    describe("i3x-browse", function () {
        it("should load node", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);
            const flow = [
                serverConfig(),
                {
                    id: "browse1",
                    type: "i3x-browse",
                    name: "Test Browse",
                    server: "server1",
                    browseTarget: "namespaces",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, browseNode], flow, function () {
                const n = helper.getNode("browse1");
                expect(n).to.exist;
                expect(n.name).to.equal("Test Browse");
                done();
            });
        });

        it("should browse namespaces", function (done) {
            const data = [{ uri: "https://test.com", displayName: "Test" }];
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE).get("/namespaces").reply(200, data);

            const flow = [
                serverConfig(),
                {
                    id: "browse1",
                    type: "i3x-browse",
                    server: "server1",
                    browseTarget: "namespaces",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, browseNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function (msg) {
                    expect(msg.payload).to.deep.equal(data);
                    done();
                });
                const n = helper.getNode("browse1");
                n.receive({});
            });
        });

        it("should browse objects", function (done) {
            const data = [{ elementId: "obj1", displayName: "Pump" }];
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE).get("/objects").reply(200, data);

            const flow = [
                serverConfig(),
                {
                    id: "browse1",
                    type: "i3x-browse",
                    server: "server1",
                    browseTarget: "objects",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, browseNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function (msg) {
                    expect(msg.payload).to.deep.equal(data);
                    done();
                });
                helper.getNode("browse1").receive({});
            });
        });

        it("should override browseTarget via msg", function (done) {
            const data = [{ elementId: "rt1" }];
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE).get("/relationshiptypes").reply(200, data);

            const flow = [
                serverConfig(),
                {
                    id: "browse1",
                    type: "i3x-browse",
                    server: "server1",
                    browseTarget: "namespaces",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, browseNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function (msg) {
                    expect(msg.payload).to.deep.equal(data);
                    done();
                });
                helper.getNode("browse1").receive({
                    browseTarget: "relationshiptypes",
                });
            });
        });

        it("should query related objects with elementId", function (done) {
            const data = [{ elementId: "child1" }];
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE)
                .post("/objects/related", { elementIds: ["parent1"] })
                .reply(200, data);

            const flow = [
                serverConfig(),
                {
                    id: "browse1",
                    type: "i3x-browse",
                    server: "server1",
                    browseTarget: "related",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, browseNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function (msg) {
                    expect(msg.payload).to.deep.equal(data);
                    done();
                });
                helper.getNode("browse1").receive({ elementId: "parent1" });
            });
        });

        it("should show error status on failure", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE).get("/namespaces").reply(500, "fail");

            const flow = [
                serverConfig(),
                {
                    id: "browse1",
                    type: "i3x-browse",
                    server: "server1",
                    browseTarget: "namespaces",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, browseNode], flow, function () {
                const n = helper.getNode("browse1");
                n.on("call:error", () => {
                    done();
                });
                n.receive({});
            });
        });
    });

    // ── i3x-read ───────────────────────────────────────────────────

    describe("i3x-read", function () {
        it("should read values with elementIds from config", function (done) {
            const data = { obj1: { data: [{ value: 42 }] } };
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE)
                .post("/objects/value", { elementIds: ["obj1"], maxDepth: 1 })
                .reply(200, data);

            const flow = [
                serverConfig(),
                {
                    id: "read1",
                    type: "i3x-read",
                    server: "server1",
                    elementIds: "obj1",
                    maxDepth: "1",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, readNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function (msg) {
                    expect(msg.payload).to.deep.equal(data);
                    done();
                });
                helper.getNode("read1").receive({});
            });
        });

        it("should accept elementIds from msg", function (done) {
            const data = { a: {}, b: {} };
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE)
                .post("/objects/value", { elementIds: ["a", "b"], maxDepth: 1 })
                .reply(200, data);

            const flow = [
                serverConfig(),
                {
                    id: "read1",
                    type: "i3x-read",
                    server: "server1",
                    elementIds: "",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, readNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function (msg) {
                    expect(msg.payload).to.deep.equal(data);
                    done();
                });
                helper.getNode("read1").receive({ elementIds: ["a", "b"] });
            });
        });

        it("should accept comma-separated elementIds string from msg", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE)
                .post("/objects/value", { elementIds: ["x", "y"], maxDepth: 1 })
                .reply(200, {});

            const flow = [
                serverConfig(),
                {
                    id: "read1",
                    type: "i3x-read",
                    server: "server1",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, readNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function () {
                    done();
                });
                helper.getNode("read1").receive({ elementIds: "x, y" });
            });
        });

        it("should error when no elementIds provided", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);

            const flow = [
                serverConfig(),
                {
                    id: "read1",
                    type: "i3x-read",
                    server: "server1",
                    elementIds: "",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, readNode], flow, function () {
                const n = helper.getNode("read1");
                n.on("call:error", () => done());
                n.receive({});
            });
        });
    });

    // ── i3x-write ──────────────────────────────────────────────────

    describe("i3x-write", function () {
        it("should write value to elementId", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE)
                .put("/objects/sensor-001/value", { value: 99.5 })
                .reply(200, { status: "ok" });

            const flow = [
                serverConfig(),
                {
                    id: "write1",
                    type: "i3x-write",
                    server: "server1",
                    elementId: "sensor-001",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, writeNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function (msg) {
                    expect(msg.payload).to.deep.equal({ status: "ok" });
                    expect(msg.elementId).to.equal("sensor-001");
                    done();
                });
                helper.getNode("write1").receive({ payload: { value: 99.5 } });
            });
        });

        it("should override elementId via msg", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE)
                .put("/objects/override-id/value", (body) => body === 42)
                .reply(200, { status: "ok" });

            const flow = [
                serverConfig(),
                {
                    id: "write1",
                    type: "i3x-write",
                    server: "server1",
                    elementId: "configured-id",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, writeNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function (msg) {
                    expect(msg.elementId).to.equal("override-id");
                    done();
                });
                helper.getNode("write1").receive({
                    payload: 42,
                    elementId: "override-id",
                });
            });
        });

        it("should error when no elementId", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);

            const flow = [
                serverConfig(),
                {
                    id: "write1",
                    type: "i3x-write",
                    server: "server1",
                    elementId: "",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, writeNode], flow, function () {
                const n = helper.getNode("write1");
                n.on("call:error", () => done());
                n.receive({ payload: 123 });
            });
        });

        it("should error when no payload", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);

            const flow = [
                serverConfig(),
                {
                    id: "write1",
                    type: "i3x-write",
                    server: "server1",
                    elementId: "x",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, writeNode], flow, function () {
                const n = helper.getNode("write1");
                n.on("call:error", () => done());
                n.receive({ payload: undefined });
            });
        });

        it("should write history when writeTarget is 'history'", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);
            const histData = [{ value: 68.2, quality: "GOOD", timestamp: "2025-06-01T10:00:00Z" }];
            nock(BASE)
                .put("/objects/sensor-001/history", (body) => {
                    return Array.isArray(body) && body[0].value === 68.2;
                })
                .reply(200, { status: "ok" });

            const flow = [
                serverConfig(),
                {
                    id: "write1",
                    type: "i3x-write",
                    server: "server1",
                    elementId: "sensor-001",
                    writeTarget: "history",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, writeNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function (msg) {
                    expect(msg.payload).to.deep.equal({ status: "ok" });
                    expect(msg.elementId).to.equal("sensor-001");
                    done();
                });
                helper.getNode("write1").receive({ payload: histData });
            });
        });

        it("should override writeTarget via msg", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE)
                .put("/objects/sensor-001/history", (body) => body === 99)
                .reply(200, { status: "ok" });

            const flow = [
                serverConfig(),
                {
                    id: "write1",
                    type: "i3x-write",
                    server: "server1",
                    elementId: "sensor-001",
                    writeTarget: "value",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, writeNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function (msg) {
                    expect(msg.payload).to.deep.equal({ status: "ok" });
                    done();
                });
                helper.getNode("write1").receive({
                    payload: 99,
                    writeTarget: "history",
                });
            });
        });
    });

    // ── i3x-history ────────────────────────────────────────────────

    describe("i3x-history", function () {
        it("should query history with time range", function (done) {
            const data = { obj1: { data: [{ timestamp: "2025-01-01", value: 1 }] } };
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE)
                .post("/objects/history", (body) => {
                    return (
                        body.elementIds[0] === "obj1" &&
                        body.startTime &&
                        !body.endTime
                    );
                })
                .reply(200, data);

            const flow = [
                serverConfig(),
                {
                    id: "hist1",
                    type: "i3x-history",
                    server: "server1",
                    elementIds: "obj1",
                    startTime: "-1h",
                    endTime: "",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, historyNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function (msg) {
                    expect(msg.payload).to.deep.equal(data);
                    done();
                });
                helper.getNode("hist1").receive({});
            });
        });

        it("should accept msg overrides for time range", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE)
                .post("/objects/history", (body) => {
                    return (
                        body.elementIds[0] === "obj2" &&
                        body.startTime === "2025-06-01T00:00:00Z" &&
                        body.endTime === "2025-06-02T00:00:00Z"
                    );
                })
                .reply(200, {});

            const flow = [
                serverConfig(),
                {
                    id: "hist1",
                    type: "i3x-history",
                    server: "server1",
                    elementIds: "obj1",
                    startTime: "-1h",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, historyNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function () {
                    done();
                });
                helper.getNode("hist1").receive({
                    elementIds: "obj2",
                    startTime: "2025-06-01T00:00:00Z",
                    endTime: "2025-06-02T00:00:00Z",
                });
            });
        });

        it("should parse relative time strings", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE)
                .post("/objects/history", (body) => {
                    const st = new Date(body.startTime);
                    const diff = Date.now() - st.getTime();
                    return diff >= 3500000 && diff <= 3700000;
                })
                .reply(200, {});

            const flow = [
                serverConfig(),
                {
                    id: "hist1",
                    type: "i3x-history",
                    server: "server1",
                    elementIds: "obj1",
                    startTime: "-1h",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, historyNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function () {
                    done();
                });
                helper.getNode("hist1").receive({});
            });
        });
    });

    // ── i3x-subscribe ──────────────────────────────────────────────

    describe("i3x-subscribe", function () {
        it("should load node", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);

            const flow = [
                serverConfig(),
                {
                    id: "sub1",
                    type: "i3x-subscribe",
                    name: "Test Sub",
                    server: "server1",
                    elementIds: "",
                    mode: "poll",
                    pollingInterval: "60000",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, subscribeNode], flow, function () {
                const n = helper.getNode("sub1");
                expect(n).to.exist;
                expect(n.name).to.equal("Test Sub");
                done();
            });
        });

        it("should create subscription and poll on connected", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE)
                .post("/subscriptions", {})
                .reply(200, { subscriptionId: "99", message: "ok" });
            nock(BASE)
                .post("/subscriptions/register", {
                    subscriptionId: "99",
                    elementIds: ["a"],
                    maxDepth: 1,
                })
                .reply(200, { status: "ok" });
            nock(BASE)
                .post("/subscriptions/sync", { subscriptionId: "99" })
                .reply(200, [{ elementId: "a", value: 1 }]);
            nock(BASE)
                .post("/subscriptions/delete", { subscriptionIds: ["99"] })
                .reply(200, {});

            const flow = [
                serverConfig(),
                {
                    id: "sub1",
                    type: "i3x-subscribe",
                    server: "server1",
                    elementIds: "a",
                    mode: "poll",
                    pollingInterval: "60000",
                    maxDepth: "1",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, subscribeNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function (msg) {
                    expect(msg.payload).to.deep.equal([
                        { elementId: "a", value: 1 },
                    ]);
                    expect(msg.topic).to.equal("i3x/subscription");
                    done();
                });
            });
        });
    });

    // ── msg passthrough ────────────────────────────────────────────

    describe("msg passthrough", function () {
        it("should preserve original msg properties on read", function (done) {
            nock(BASE).get("/namespaces").reply(200, []);
            nock(BASE).post("/objects/value").reply(200, { val: 1 });

            const flow = [
                serverConfig(),
                {
                    id: "read1",
                    type: "i3x-read",
                    server: "server1",
                    elementIds: "x",
                    wires: [["out1"]],
                },
                { id: "out1", type: "helper" },
            ];
            helper.load([serverNode, readNode], flow, function () {
                const out = helper.getNode("out1");
                out.on("input", function (msg) {
                    expect(msg.topic).to.equal("my/topic");
                    expect(msg.custom).to.equal("preserved");
                    done();
                });
                helper.getNode("read1").receive({
                    topic: "my/topic",
                    custom: "preserved",
                });
            });
        });
    });
});
