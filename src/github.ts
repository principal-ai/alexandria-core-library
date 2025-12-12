/**
 * GitHub Adapters Export
 *
 * Use this entry point to import GitHub-specific adapters
 * for using a GitHub repository as a storage backend.
 *
 * Usage:
 * ```typescript
 * import {
 *   GitHubFileSystemAdapter,
 *   WorkspaceManager,
 * } from '@principal-ai/alexandria-core-library/github';
 *
 * const adapter = new GitHubFileSystemAdapter({
 *   owner: 'principal-ai',
 *   repo: 'curated-collections',
 *   token: process.env.GITHUB_TOKEN, // optional for public repos
 *   branch: 'main',
 *   basePath: 'collections', // optional subdirectory
 * });
 *
 * // Preload data for sync access
 * await adapter.preloadDirectory('/');
 *
 * // Use with WorkspaceManager
 * const workspaces = new WorkspaceManager('/', adapter);
 * const collections = await workspaces.getWorkspaces();
 * ```
 */

export {
  GitHubFileSystemAdapter,
  type GitHubFileSystemAdapterOptions,
} from "./github-adapters/GitHubFileSystemAdapter";

export type { FileSystemAdapter } from "./pure-core/abstractions/filesystem";

export type {
  Workspace,
  WorkspaceMembership,
  WorkspacesData,
  WorkspaceMembershipsData,
} from "./projects-core/types";

export { WorkspaceManager } from "./projects-core/WorkspaceManager";
