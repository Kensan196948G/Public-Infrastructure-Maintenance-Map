// Sample-mode only: no adapter reachable from here touches node:https, so
// apps/api's Worker bundle (repo.ts → buildSampleSeed) never pulls in
// Node-only code. Real-source adapters (registry.ts, http.ts) are exposed
// via the '@pimm/source-adapters/registry' subpath for Node CLI use only —
// see ingest-cli.ts.
export * from './deterministic-id.js';
export * from './adapters/sample-bridges.js';
export * from './adapters/sample-rivers.js';
export * from './adapters/sample-facilities.js';
export * from './seed.js';
