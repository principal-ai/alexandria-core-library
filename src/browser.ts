/**
 * @principal-ai/alexandria-core-library/browser
 *
 * Browser-specific adapters for the Alexandria ecosystem.
 * These adapters work in browser environments using localStorage.
 */

// Filesystem adapter for browser localStorage
export {
  LocalStorageFileSystemAdapter,
  type LocalStorageFileSystemAdapterOptions,
  type StorageProvider,
} from "./browser-adapters/LocalStorageFileSystemAdapter";

// Re-export the adapter interfaces for convenience
export type { FileSystemAdapter } from "./pure-core/abstractions/filesystem";

// Re-export workspace types that are commonly used with browser storage
export type {
  Workspace,
  WorkspaceMembership,
  WorkspacesData,
  WorkspaceMembershipsData,
} from "./projects-core/types";

// Re-export WorkspaceManager for direct usage
export { WorkspaceManager } from "./projects-core/WorkspaceManager";
