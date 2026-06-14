// Type definitions for the shared i3X (CESMII) HTTP client.
// Targets the i3X API 1.0 Release specification.
// Project: https://github.com/blanpa/node-red-contrib-i3x

/// <reference types="node" />

import { EventEmitter } from "events";

export interface TlsOptions {
    rejectUnauthorized?: boolean;
    ca?: string | Buffer | Array<string | Buffer>;
    cert?: string | Buffer;
    key?: string | Buffer;
}

export interface I3XClientConfig {
    /** Root URL of the i3X server, e.g. "https://i3x.cesmii.net". */
    baseUrl: string;
    /** Optional path prefix, e.g. "v1". */
    apiVersion?: string;
    authType?: "none" | "basic" | "bearer" | "apikey";
    username?: string;
    password?: string;
    token?: string;
    apiKey?: string;
    tlsOptions?: TlsOptions;
    /** HTTP timeout in milliseconds (default 10000). */
    timeout?: number;
    /** Client identifier; required by the 1.0 spec on all subscription endpoints. */
    clientId?: string;
}

/** Value-Quality-Timestamp record. */
export interface VQT {
    value: unknown;
    quality?: string;
    timestamp?: string;
}

export interface ValueUpdate {
    elementId: string;
    value: unknown;
}

export interface ServerInfo {
    specVersion: string;
    serverVersion: string;
    serverName: string;
    capabilities: Record<string, unknown>;
}

export interface Namespace {
    uri: string;
    displayName: string;
}

export interface Subscription {
    subscriptionId: string;
    clientId?: string;
    displayName?: string;
}

export interface StreamCallbacks {
    onData: (event: unknown) => void;
    onError?: (err: Error) => void;
    onReconnect?: (attempt: number) => void;
}

export interface StreamOptions {
    clientId?: string;
    maxReconnects?: number;
}

export interface StreamHandle {
    close: () => void;
}

/** Normalised error thrown by client requests. */
export interface I3XError extends Error {
    _i3x: true;
    statusCode?: number;
    statusText?: string;
    body?: unknown;
    code?: string;
}

export default class I3XClient extends EventEmitter {
    baseUrl: string;
    apiVersion: string;
    authType: string;
    timeout: number;
    clientId: string;

    constructor(config: I3XClientConfig);

    // Server info
    getInfo(): Promise<ServerInfo>;

    // Explore
    getNamespaces(): Promise<Namespace[]>;
    getObjectTypes(options?: { namespaceUri?: string }): Promise<unknown[]>;
    queryObjectTypes(elementIds: string[]): Promise<unknown[]>;
    getRelationshipTypes(options?: { namespaceUri?: string }): Promise<unknown[]>;
    queryRelationshipTypes(elementIds: string[]): Promise<unknown[]>;
    getObjects(options?: {
        typeElementId?: string;
        typeId?: string;
        includeMetadata?: boolean;
        root?: boolean;
    }): Promise<unknown[]>;
    listObjects(elementIds: string[], options?: { includeMetadata?: boolean }): Promise<unknown[]>;
    getRelatedObjects(
        elementIds: string[],
        options?: { relationshipType?: string; includeMetadata?: boolean }
    ): Promise<unknown[]>;

    // Query
    readValues(elementIds: string[], options?: { maxDepth?: number }): Promise<unknown[]>;
    readHistory(
        elementIds: string[],
        options?: { startTime?: string; endTime?: string; maxDepth?: number }
    ): Promise<unknown[] & { _partial?: boolean }>;
    /** @deprecated Delegates to {@link readHistory}; the per-element endpoint was removed in 1.0. */
    getHistory(
        elementId: string,
        options?: { startTime?: string; endTime?: string; maxDepth?: number }
    ): Promise<unknown[]>;

    // Update (bulk-only in 1.0)
    writeValue(elementId: string, value: unknown): Promise<unknown>;
    writeValues(updates: ValueUpdate[]): Promise<unknown>;
    writeHistory(elementId: string, data: VQT | VQT[] | unknown): Promise<unknown>;

    // Subscribe
    createSubscription(options?: { clientId?: string; displayName?: string }): Promise<Subscription>;
    listSubscriptions(subscriptionIds: string[], options?: { clientId?: string }): Promise<unknown[]>;
    deleteSubscriptions(subscriptionIds: string[], options?: { clientId?: string }): Promise<unknown>;
    registerMonitoredItems(
        subscriptionId: string,
        elementIds: string[],
        options?: { maxDepth?: number; clientId?: string } | number
    ): Promise<unknown>;
    unregisterMonitoredItems(
        subscriptionId: string,
        elementIds: string[],
        options?: { clientId?: string }
    ): Promise<unknown>;
    streamSubscription(
        subscriptionId: string,
        callbacks: StreamCallbacks | ((event: unknown) => void),
        options?: StreamOptions | number
    ): StreamHandle;
    syncSubscription(
        subscriptionId: string,
        options?: { lastSequenceNumber?: number; clientId?: string }
    ): Promise<unknown>;

    // Utility
    testConnection(): Promise<boolean>;
    destroy(): void;
}
