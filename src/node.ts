/**
 * @principal-ai/alexandria-core-library/node
 *
 * Node.js-specific adapters for the Alexandria ecosystem.
 * These adapters require Node.js runtime and dependencies like globby.
 */

// Filesystem adapter for Node.js
export { NodeFileSystemAdapter } from "./node-adapters/NodeFileSystemAdapter";

// Glob adapter for pattern matching in Node.js
export { NodeGlobAdapter } from "./node-adapters/NodeGlobAdapter";

// Re-export the adapter interfaces for convenience
export type { FileSystemAdapter } from "./pure-core/abstractions/filesystem";
export type { GlobAdapter, GlobOptions } from "./pure-core/abstractions/glob";
