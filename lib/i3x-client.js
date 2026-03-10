/**
 * I3XClient – Shared HTTP client for the i3X (CESMII) API.
 *
 * Wraps all REST endpoints described in the i3X OpenAPI v0.0.1 spec.
 * Used by every node-red-contrib-i3x node via the i3x-server config node.
 *
 * @see https://i3x.cesmii.net/docs
 */
"use strict";

const axios = require("axios");
const { EventEmitter } = require("events");

const RETRY_STATUS_CODES = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const DEFAULT_CACHE_TTL_MS = 60000; // 1 minute
const RATE_LIMIT_WINDOW_MS = 60000; // 60 seconds
const RATE_LIMIT_MAX_REQUESTS = 100;

class TTLCache {
    constructor(ttl = DEFAULT_CACHE_TTL_MS) {
        this._ttl = ttl;
        this._store = new Map();
    }

    get(key) {
        const entry = this._store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expires) {
            this._store.delete(key);
            return undefined;
        }
        return entry.value;
    }

    set(key, value) {
        this._store.set(key, { value, expires: Date.now() + this._ttl });
    }

    clear() {
        this._store.clear();
    }
}

class RateLimiter {
    constructor(maxRequests = RATE_LIMIT_MAX_REQUESTS, windowMs = RATE_LIMIT_WINDOW_MS) {
        this._maxRequests = maxRequests;
        this._windowMs = windowMs;
        this._timestamps = [];
    }

    async acquire() {
        const now = Date.now();
        this._timestamps = this._timestamps.filter((t) => now - t < this._windowMs);
        if (this._timestamps.length >= this._maxRequests) {
            const oldest = this._timestamps[0];
            const waitMs = this._windowMs - (now - oldest);
            await new Promise((r) => setTimeout(r, waitMs));
            return this.acquire();
        }
        this._timestamps.push(Date.now());
    }
}

class I3XClient extends EventEmitter {
    /**
     * @param {object} config
     * @param {string} config.baseUrl       – e.g. "https://i3x.cesmii.net"
     * @param {string} [config.apiVersion]  – path prefix, default ""
     * @param {string} [config.authType]    – "none"|"basic"|"bearer"|"apikey"
     * @param {string} [config.username]
     * @param {string} [config.password]
     * @param {string} [config.token]
     * @param {string} [config.apiKey]
     * @param {object} [config.tlsOptions]  – { rejectUnauthorized, ca, cert, key }
     * @param {number} [config.timeout]     – ms, default 10000
     */
    constructor(config) {
        super();
        this.baseUrl = (config.baseUrl || "").replace(/\/+$/, "");
        this.apiVersion = config.apiVersion || "";
        this.authType = config.authType || "none";
        this.timeout = config.timeout || 10000;

        // Warn if credentials are sent over plain HTTP (not localhost)
        if (this.authType !== "none" && this.baseUrl && !this.baseUrl.startsWith("https://")) {
            const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(this.baseUrl);
            if (!isLocal) {
                this._httpsWarning = "Credentials sent over plain HTTP – use HTTPS in production";
            }
        }

        const axiosConfig = {
            baseURL: this._prefix(),
            timeout: this.timeout,
            headers: { "Content-Type": "application/json", Accept: "application/json" },
        };

        if (this.authType === "basic" && config.username) {
            axiosConfig.auth = { username: config.username, password: config.password || "" };
        } else if (this.authType === "bearer" && config.token) {
            axiosConfig.headers["Authorization"] = `Bearer ${config.token}`;
        } else if (this.authType === "apikey" && config.apiKey) {
            axiosConfig.headers["X-API-Key"] = config.apiKey;
        }

        if (config.tlsOptions) {
            const https = require("https");
            const tlsOpts = { rejectUnauthorized: true, ...config.tlsOptions };
            axiosConfig.httpsAgent = new https.Agent(tlsOpts);
        }

        this.http = axios.create(axiosConfig);
        this._activeSubscriptions = new Map();
        this._cache = new TTLCache();
        this._rateLimiter = new RateLimiter();
    }

    // ── Explore ────────────────────────────────────────────────────────

    /** @returns {Promise<Array<{uri:string, displayName:string}>>} */
    async getNamespaces() {
        const cacheKey = "namespaces";
        const cached = this._cache.get(cacheKey);
        if (cached) return cached;
        const result = await this._get("/namespaces");
        this._cache.set(cacheKey, result);
        return result;
    }

    /**
     * @param {object} [options]
     * @param {string} [options.namespaceUri]
     */
    async getObjectTypes(options = {}) {
        const params = {};
        if (options.namespaceUri) params.namespaceUri = options.namespaceUri;
        const cacheKey = "objecttypes:" + (options.namespaceUri || "");
        const cached = this._cache.get(cacheKey);
        if (cached) return cached;
        const result = await this._get("/objecttypes", params);
        this._cache.set(cacheKey, result);
        return result;
    }

    /** @param {string[]} elementIds */
    async queryObjectTypes(elementIds) {
        return this._post("/objecttypes/query", { elementIds });
    }

    /**
     * @param {object} [options]
     * @param {string} [options.namespaceUri]
     */
    async getRelationshipTypes(options = {}) {
        const params = {};
        if (options.namespaceUri) params.namespaceUri = options.namespaceUri;
        return this._get("/relationshiptypes", params);
    }

    /** @param {string[]} elementIds */
    async queryRelationshipTypes(elementIds) {
        return this._post("/relationshiptypes/query", { elementIds });
    }

    /**
     * @param {object} [options]
     * @param {string}  [options.typeId]
     * @param {boolean} [options.includeMetadata]
     */
    async getObjects(options = {}) {
        const params = {};
        if (options.typeId) params.typeId = options.typeId;
        if (options.includeMetadata) params.includeMetadata = true;
        return this._get("/objects", params);
    }

    /**
     * @param {string[]} elementIds
     * @param {object}   [options]
     * @param {boolean}  [options.includeMetadata]
     */
    async listObjects(elementIds, options = {}) {
        const body = { elementIds };
        if (options.includeMetadata) body.includeMetadata = true;
        return this._post("/objects/list", body);
    }

    /**
     * @param {string[]} elementIds
     * @param {object}   [options]
     * @param {string}   [options.relationshipType]
     * @param {boolean}  [options.includeMetadata]
     */
    async getRelatedObjects(elementIds, options = {}) {
        const body = { elementIds };
        if (options.relationshipType) body.relationshiptype = options.relationshipType;
        if (options.includeMetadata) body.includeMetadata = true;
        return this._post("/objects/related", body);
    }

    // ── Query ──────────────────────────────────────────────────────────

    /**
     * @param {string[]} elementIds
     * @param {object}   [options]
     * @param {number}   [options.maxDepth] – 0 = infinite, 1 = no recursion
     */
    async readValues(elementIds, options = {}) {
        const body = { elementIds };
        if (options.maxDepth !== undefined) body.maxDepth = options.maxDepth;
        return this._post("/objects/value", body);
    }

    /**
     * @param {string[]} elementIds
     * @param {object}   [options]
     * @param {string}   [options.startTime] – ISO 8601
     * @param {string}   [options.endTime]   – ISO 8601
     * @param {number}   [options.maxDepth]
     */
    async readHistory(elementIds, options = {}) {
        const body = { elementIds };
        if (options.startTime) body.startTime = options.startTime;
        if (options.endTime) body.endTime = options.endTime;
        if (options.maxDepth !== undefined) body.maxDepth = options.maxDepth;
        return this._post("/objects/history", body);
    }

    // ── Update ─────────────────────────────────────────────────────────

    /**
     * @param {string} elementId
     * @param {*}      value
     */
    async writeValue(elementId, value) {
        I3XClient._validateWritePayload(value);
        return this._put(`/objects/${encodeURIComponent(elementId)}/value`, value);
    }

    /**
     * @param {string} elementId
     * @param {*}      data – historical data payload
     */
    async writeHistory(elementId, data) {
        I3XClient._validateWritePayload(data);
        return this._put(`/objects/${encodeURIComponent(elementId)}/history`, data);
    }

    static _WRITE_ALLOWED_FIELDS = new Set([
        "value", "timestamp", "quality", "displayName", "attributes", "metadata",
        "startTime", "endTime", "values", "elementId", "status",
    ]);

    static _validateWritePayload(payload) {
        if (payload === null || payload === undefined) {
            throw new Error("Write payload must not be null or undefined");
        }
        if (typeof payload === "object" && !Array.isArray(payload)) {
            const keys = Object.keys(payload);
            const disallowed = keys.filter((k) => !I3XClient._WRITE_ALLOWED_FIELDS.has(k));
            if (disallowed.length > 0) {
                throw new Error("Disallowed fields in write payload: " + disallowed.join(", "));
            }
        }
    }

    // ── Subscribe ──────────────────────────────────────────────────────

    async listSubscriptions() {
        return this._get("/subscriptions");
    }

    /** @returns {Promise<{subscriptionId:string, message:string}>} */
    async createSubscription() {
        return this._post("/subscriptions", {});
    }

    /** @param {string} subscriptionId */
    async getSubscription(subscriptionId) {
        return this._get(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
    }

    /** @param {string} subscriptionId */
    async deleteSubscription(subscriptionId) {
        return this._delete(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
    }

    /**
     * @param {string}   subscriptionId
     * @param {string[]} elementIds
     * @param {number}   [maxDepth]
     */
    async registerMonitoredItems(subscriptionId, elementIds, maxDepth = 1) {
        const body = { elementIds, maxDepth };
        return this._post(
            `/subscriptions/${encodeURIComponent(subscriptionId)}/register`,
            body
        );
    }

    /**
     * @param {string}   subscriptionId
     * @param {string[]} elementIds
     */
    async unregisterMonitoredItems(subscriptionId, elementIds) {
        const body = { elementIds };
        return this._post(
            `/subscriptions/${encodeURIComponent(subscriptionId)}/unregister`,
            body
        );
    }

    /**
     * Open an SSE stream for the given subscription.
     * Supports automatic reconnection on stream errors.
     *
     * @param {string}   subscriptionId
     * @param {object}   callbacks
     * @param {function} callbacks.onData  – called with each parsed SSE event
     * @param {function} [callbacks.onError] – called on stream errors (instead of EventEmitter)
     * @param {function} [callbacks.onReconnect] – called when a reconnection attempt starts
     * @param {number}   [maxReconnects=5] – max consecutive reconnection attempts
     * @returns {{ close: function }} handle to close the stream
     */
    streamSubscription(subscriptionId, callbacks, maxReconnects = 5) {
        if (typeof callbacks === "function") {
            callbacks = { onData: callbacks };
        }
        const { onData, onError, onReconnect } = callbacks;

        const url = `${this._prefix()}/subscriptions/${encodeURIComponent(subscriptionId)}/stream`;
        let controller = new AbortController();
        let closed = false;
        let reconnectCount = 0;

        const headers = {
            ...this.http.defaults.headers.common,
            ...this.http.defaults.headers,
            Accept: "text/event-stream",
        };
        // Remove non-header axios defaults that got spread in
        delete headers.common;
        delete headers.get;
        delete headers.post;
        delete headers.put;
        delete headers.delete;
        delete headers.patch;
        delete headers.head;
        if (this.http.defaults.auth) {
            const b64 = Buffer.from(
                `${this.http.defaults.auth.username}:${this.http.defaults.auth.password}`
            ).toString("base64");
            headers["Authorization"] = `Basic ${b64}`;
        }

        const connect = async () => {
            if (closed) return;
            try {
                controller = new AbortController();
                const response = await axios({
                    method: "get",
                    url,
                    headers,
                    responseType: "stream",
                    signal: controller.signal,
                    timeout: 0,
                    httpsAgent: this.http.defaults.httpsAgent,
                });
                reconnectCount = 0;
                let buffer = "";
                response.data.on("data", (chunk) => {
                    buffer += chunk.toString();
                    const parts = buffer.split("\n\n");
                    buffer = parts.pop();
                    for (const part of parts) {
                        const dataLine = part
                            .split("\n")
                            .find((l) => l.startsWith("data:"));
                        if (dataLine) {
                            try {
                                onData(JSON.parse(dataLine.slice(5).trim()));
                            } catch (_) {
                                onData(dataLine.slice(5).trim());
                            }
                        }
                    }
                });
                response.data.on("end", () => {
                    if (!closed) reconnect();
                });
                response.data.on("error", (err) => {
                    if (!closed) reconnect(err);
                });
            } catch (err) {
                if (!closed) reconnect(err);
            }
        };

        const reconnect = (err) => {
            if (closed) return;
            reconnectCount++;
            if (reconnectCount > maxReconnects) {
                if (onError) onError(err || new Error("Max reconnection attempts reached"));
                return;
            }
            if (onReconnect) onReconnect(reconnectCount);
            const delay = Math.min(1000 * Math.pow(2, reconnectCount - 1), 30000);
            setTimeout(connect, delay);
        };

        connect();

        const handle = {
            close: () => {
                closed = true;
                controller.abort();
            },
        };
        this._activeSubscriptions.set(subscriptionId, handle);
        return handle;
    }

    /**
     * Poll-based sync: returns and clears queued updates.
     * @param {string} subscriptionId
     */
    async syncSubscription(subscriptionId) {
        return this._post(
            `/subscriptions/${encodeURIComponent(subscriptionId)}/sync`,
            {}
        );
    }

    // ── Utility ────────────────────────────────────────────────────────

    /**
     * Lightweight connectivity test.
     * Bypasses cache to ensure a real round-trip to the server.
     */
    async testConnection() {
        await this._request("get", "/namespaces", {});
        return true;
    }

    /** Close all active SSE streams and clean up. */
    destroy() {
        for (const [, handle] of this._activeSubscriptions) {
            handle.close();
        }
        this._activeSubscriptions.clear();
        this._cache.clear();
    }

    // ── Internal helpers ───────────────────────────────────────────────

    /** @private */
    _prefix() {
        const ver = this.apiVersion ? `/${this.apiVersion.replace(/^\//, "")}` : "";
        return `${this.baseUrl}${ver}`;
    }

    /** @private */
    async _get(path, params) {
        return this._request("get", path, { params });
    }

    /** @private */
    async _post(path, data) {
        return this._request("post", path, { data });
    }

    /** @private */
    async _put(path, data) {
        return this._request("put", path, { data });
    }

    /** @private */
    async _delete(path) {
        return this._request("delete", path);
    }

    /**
     * Central request dispatcher with retry logic, Retry-After support, and rate limiting.
     * @private
     */
    async _request(method, path, opts = {}) {
        await this._rateLimiter.acquire();
        let lastErr;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const res = await this.http.request({ method, url: path, ...opts });
                return res.data;
            } catch (err) {
                lastErr = err;
                const status = err.response && err.response.status;
                if (status && RETRY_STATUS_CODES.has(status) && attempt < MAX_RETRIES) {
                    const retryAfter = err.response.headers && err.response.headers["retry-after"];
                    let delay;
                    if (retryAfter) {
                        const seconds = parseInt(retryAfter, 10);
                        delay = isNaN(seconds)
                            ? Math.max(0, new Date(retryAfter).getTime() - Date.now())
                            : seconds * 1000;
                    } else {
                        delay = RETRY_DELAY_MS * Math.pow(2, attempt);
                    }
                    await new Promise((r) => setTimeout(r, delay));
                    continue;
                }
                throw this._wrapError(err);
            }
        }
        throw this._wrapError(lastErr);
    }

    /**
     * Produce a normalised error object.
     * @private
     */
    _wrapError(err) {
        if (err._i3x) return err;
        const wrapped = new Error(err.message);
        wrapped._i3x = true;
        if (err.response) {
            wrapped.statusCode = err.response.status;
            wrapped.statusText = err.response.statusText;
            // Sanitize response body to avoid leaking auth details
            const body = err.response.data;
            if (body && typeof body === "object") {
                const sanitized = { ...body };
                for (const key of ["authorization", "token", "apiKey", "api_key", "password", "secret"]) {
                    delete sanitized[key];
                }
                wrapped.body = sanitized;
            } else {
                wrapped.body = body;
            }
        } else if (err.code) {
            wrapped.code = err.code;
        }
        return wrapped;
    }
}

module.exports = I3XClient;
