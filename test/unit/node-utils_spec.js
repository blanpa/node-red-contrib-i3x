"use strict";

const { expect } = require("chai");
const { flattenRelated, flattenValues } = require("../../lib/node-utils");

describe("node-utils", function () {
    describe("flattenRelated()", function () {
        it("should flatten the 1.0 bulk shape into plain object records", function () {
            const bulk = [
                {
                    success: true,
                    elementId: "mach-1",
                    result: [
                        { sourceRelationship: "rel-hasComponent", object: { elementId: "sensor-1", displayName: "Temp" } },
                        { sourceRelationship: "rel-componentOf", object: { elementId: "line-1", displayName: "Line A" } },
                    ],
                },
            ];
            const flat = flattenRelated(bulk, "mach-1");
            expect(flat.map((o) => o.elementId)).to.deep.equal(["sensor-1", "line-1"]);
            expect(flat[0].displayName).to.equal("Temp");
            expect(flat[0].sourceRelationship).to.equal("rel-hasComponent");
        });

        it("should exclude the queried element and de-duplicate", function () {
            const bulk = [
                {
                    success: true,
                    elementId: "a",
                    result: [
                        { sourceRelationship: "r", object: { elementId: "a" } },
                        { sourceRelationship: "r", object: { elementId: "b" } },
                        { sourceRelationship: "r2", object: { elementId: "b" } },
                    ],
                },
            ];
            expect(flattenRelated(bulk, "a").map((o) => o.elementId)).to.deep.equal(["b"]);
        });

        it("should tolerate a pre-1.0 flat array of objects", function () {
            const flat = flattenRelated([{ elementId: "x", displayName: "X" }], "parent");
            expect(flat).to.deep.equal([{ elementId: "x", displayName: "X" }]);
        });

        it("should return an empty array for unusable input", function () {
            expect(flattenRelated(null, "a")).to.deep.equal([]);
            expect(flattenRelated({ nope: true }, "a")).to.deep.equal([]);
            expect(flattenRelated([{ success: false, elementId: "a", result: null }], "a")).to.deep.equal([]);
        });
    });

    describe("flattenValues()", function () {
        it("should read the VQT out of the 1.0 bulk result field", function () {
            const bulk = [
                {
                    success: true,
                    elementId: "sensor-1",
                    result: { isComposition: false, value: 42, quality: "Good", timestamp: "2026-01-01T00:00:00Z" },
                },
            ];
            expect(flattenValues(bulk)).to.deep.equal([
                { elementId: "sensor-1", value: 42, quality: "Good", timestamp: "2026-01-01T00:00:00Z" },
            ]);
        });

        it("should include composition children from the components map", function () {
            const bulk = [
                {
                    success: true,
                    elementId: "mach-1",
                    result: {
                        isComposition: true,
                        value: null,
                        quality: "GoodNoData",
                        timestamp: "2026-01-01T00:00:00Z",
                        components: {
                            "sensor-1": { value: 1, quality: "Good", timestamp: "2026-01-01T00:00:01Z" },
                        },
                    },
                },
            ];
            const flat = flattenValues(bulk);
            expect(flat.map((v) => v.elementId)).to.deep.equal(["mach-1", "sensor-1"]);
            expect(flat[1].value).to.equal(1);
        });

        it("should tolerate a pre-1.0 flat bulk entry", function () {
            const bulk = [{ elementId: "sensor-1", value: 7, quality: "Good", timestamp: "2026-01-01T00:00:00Z" }];
            expect(flattenValues(bulk)[0].value).to.equal(7);
        });

        it("should return an empty array for unusable input", function () {
            expect(flattenValues(undefined)).to.deep.equal([]);
            expect(flattenValues([null, 5])).to.deep.equal([]);
        });
    });
});
