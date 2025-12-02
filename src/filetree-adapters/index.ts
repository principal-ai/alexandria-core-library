/**
 * FileTree-based adapters for browser environments
 *
 * These adapters work with FileTree data from @principal-ai/repository-abstraction
 * to provide filesystem and glob operations without direct filesystem access.
 */

export { FileTreeFileSystemAdapter } from "./FileTreeFileSystemAdapter";
export type { FileTreeFileSystemAdapterOptions } from "./FileTreeFileSystemAdapter";

export { FileTreeGlobAdapter } from "./FileTreeGlobAdapter";
export type { FileTreeGlobAdapterOptions } from "./FileTreeGlobAdapter";
