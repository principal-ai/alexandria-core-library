/**
 * WorkspaceManager - Manages workspaces and their memberships
 *
 * CORE LIBRARY RESPONSIBILITY:
 * - Store and retrieve workspace definitions
 * - Manage repository-workspace memberships
 * - Handle repository identity resolution (entry → repository ID)
 * - Cascade deletions when repositories are removed
 * - Provide query methods for UI consumption
 */

import { FileSystemAdapter } from "../pure-core/abstractions/filesystem";
import { AlexandriaEntry } from "../pure-core/types/repository";
import { idGenerator } from "../pure-core/utils/idGenerator";
import { ProjectRegistryStore } from "./ProjectRegistryStore";
import {
  Workspace,
  WorkspaceMembership,
  WorkspacesData,
  WorkspaceMembershipsData,
} from "./types";

export class WorkspaceManager {
  private fs: FileSystemAdapter;
  private workspacesPath: string;
  private membershipsPath: string;

  constructor(
    private readonly registryPath: string,
    private readonly fsAdapter: FileSystemAdapter,
  ) {
    this.fs = fsAdapter;
    this.workspacesPath = this.fs.join(registryPath, "workspaces.json");
    this.membershipsPath = this.fs.join(
      registryPath,
      "workspace-memberships.json",
    );
  }

  // ===== Private Storage Methods =====

  /**
   * Ensure the registry directory exists
   */
  private ensureRegistryDir(): void {
    if (!this.fs.exists(this.registryPath)) {
      this.fs.createDir(this.registryPath);
    }
  }

  /**
   * Load workspaces from disk
   */
  private loadWorkspaces(): WorkspacesData {
    this.ensureRegistryDir();

    if (!this.fs.exists(this.workspacesPath)) {
      return {
        version: "1.0.0",
        workspaces: [],
      };
    }

    try {
      const content = this.fs.readFile(this.workspacesPath);
      return JSON.parse(content) as WorkspacesData;
    } catch {
      return {
        version: "1.0.0",
        workspaces: [],
      };
    }
  }

  /**
   * Save workspaces to disk
   */
  private saveWorkspaces(data: WorkspacesData): void {
    this.ensureRegistryDir();
    this.fs.writeFile(this.workspacesPath, JSON.stringify(data, null, 2));
  }

  /**
   * Load memberships from disk
   */
  private loadMemberships(): WorkspaceMembershipsData {
    this.ensureRegistryDir();

    if (!this.fs.exists(this.membershipsPath)) {
      return {
        version: "1.0.0",
        memberships: [],
      };
    }

    try {
      const content = this.fs.readFile(this.membershipsPath);
      return JSON.parse(content) as WorkspaceMembershipsData;
    } catch {
      return {
        version: "1.0.0",
        memberships: [],
      };
    }
  }

  /**
   * Save memberships to disk
   */
  private saveMemberships(data: WorkspaceMembershipsData): void {
    this.ensureRegistryDir();
    this.fs.writeFile(this.membershipsPath, JSON.stringify(data, null, 2));
  }

  // ===== Repository ID Resolution =====

  /**
   * Extract repository ID from an entry or string
   * Returns github.id if available, otherwise entry.name
   *
   * @internal
   */
  private getRepositoryId(repository: AlexandriaEntry | string): string {
    if (typeof repository === "string") {
      return repository;
    }

    // Primary: use GitHub identity
    if (repository.github?.id) {
      return repository.github.id; // "owner/name"
    }

    // Fallback: local-only repos without GitHub metadata
    return repository.name;
  }

  // ===== Workspace CRUD =====

  /**
   * Create a new workspace
   * Generates unique ID and timestamps
   */
  async createWorkspace(
    workspace: Omit<Workspace, "id" | "createdAt" | "updatedAt">,
  ): Promise<Workspace> {
    const data = this.loadWorkspaces();

    const now = Date.now();
    const newWorkspace: Workspace = {
      ...workspace,
      id: idGenerator.generate("ws"),
      createdAt: now,
      updatedAt: now,
    };

    // If this is marked as default, unset other defaults
    if (newWorkspace.isDefault) {
      data.workspaces.forEach((ws) => {
        ws.isDefault = false;
      });
    }

    data.workspaces.push(newWorkspace);
    this.saveWorkspaces(data);

    return newWorkspace;
  }

  /**
   * Get a workspace by ID
   */
  async getWorkspace(id: string): Promise<Workspace | null> {
    const data = this.loadWorkspaces();
    return data.workspaces.find((ws) => ws.id === id) || null;
  }

  /**
   * Get all workspaces
   */
  async getWorkspaces(): Promise<Workspace[]> {
    const data = this.loadWorkspaces();
    return data.workspaces;
  }

  /**
   * Update workspace properties
   */
  async updateWorkspace(
    id: string,
    updates: Partial<Omit<Workspace, "id" | "createdAt">>,
  ): Promise<Workspace> {
    const data = this.loadWorkspaces();
    const workspace = data.workspaces.find((ws) => ws.id === id);

    if (!workspace) {
      throw new Error(`Workspace with id '${id}' not found`);
    }

    // If setting this as default, unset other defaults
    if (updates.isDefault === true) {
      data.workspaces.forEach((ws) => {
        ws.isDefault = false;
      });
    }

    Object.assign(workspace, updates, {
      updatedAt: Date.now(),
    });

    this.saveWorkspaces(data);
    return workspace;
  }

  /**
   * Delete a workspace and all its memberships
   */
  async deleteWorkspace(id: string): Promise<boolean> {
    const data = this.loadWorkspaces();
    const index = data.workspaces.findIndex((ws) => ws.id === id);

    if (index === -1) {
      return false;
    }

    data.workspaces.splice(index, 1);
    this.saveWorkspaces(data);

    // Clean up memberships
    const membershipsData = this.loadMemberships();
    membershipsData.memberships = membershipsData.memberships.filter(
      (m) => m.workspaceId !== id,
    );
    this.saveMemberships(membershipsData);

    return true;
  }

  // ===== Membership Management =====

  /**
   * Add a repository to a workspace
   * Accepts either an entry or a repository ID
   *
   * @param repository - AlexandriaEntry or repository ID string ("owner/name")
   * @param workspaceId - Workspace identifier
   * @param metadata - Optional workspace-specific metadata
   */
  async addRepositoryToWorkspace(
    repository: AlexandriaEntry | string,
    workspaceId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const repositoryId = this.getRepositoryId(repository);
    const data = this.loadMemberships();

    // Check if already exists
    const exists = data.memberships.some(
      (m) => m.repositoryId === repositoryId && m.workspaceId === workspaceId,
    );

    if (exists) {
      // Update metadata if provided
      if (metadata !== undefined) {
        const membership = data.memberships.find(
          (m) =>
            m.repositoryId === repositoryId && m.workspaceId === workspaceId,
        );
        if (membership) {
          membership.metadata = metadata;
          this.saveMemberships(data);
        }
      }
      return;
    }

    const membership: WorkspaceMembership = {
      repositoryId,
      workspaceId,
      addedAt: Date.now(),
      metadata,
    };

    data.memberships.push(membership);
    this.saveMemberships(data);
  }

  /**
   * Remove a repository from a workspace
   *
   * @param repository - AlexandriaEntry or repository ID string
   * @param workspaceId - Workspace identifier
   */
  async removeRepositoryFromWorkspace(
    repository: AlexandriaEntry | string,
    workspaceId: string,
  ): Promise<void> {
    const repositoryId = this.getRepositoryId(repository);
    const data = this.loadMemberships();

    data.memberships = data.memberships.filter(
      (m) =>
        !(m.repositoryId === repositoryId && m.workspaceId === workspaceId),
    );

    this.saveMemberships(data);
  }

  /**
   * Get all memberships for a workspace
   */
  async getWorkspaceMemberships(
    workspaceId: string,
  ): Promise<WorkspaceMembership[]> {
    const data = this.loadMemberships();
    return data.memberships.filter((m) => m.workspaceId === workspaceId);
  }

  /**
   * Get all workspaces that contain a repository
   *
   * @param repository - AlexandriaEntry or repository ID string
   */
  async getRepositoryWorkspaces(
    repository: AlexandriaEntry | string,
  ): Promise<Workspace[]> {
    const repositoryId = this.getRepositoryId(repository);
    const membershipsData = this.loadMemberships();
    const workspaceIds = membershipsData.memberships
      .filter((m) => m.repositoryId === repositoryId)
      .map((m) => m.workspaceId);

    const workspacesData = this.loadWorkspaces();
    return workspacesData.workspaces.filter((ws) =>
      workspaceIds.includes(ws.id),
    );
  }

  // ===== Query Methods =====

  /**
   * Get all entries (local clones) for repositories in a workspace
   * This includes ALL local clones of matching repositories
   *
   * @param workspaceId - Workspace identifier
   * @param projectRegistry - ProjectRegistryStore instance for querying entries
   * @returns Array of AlexandriaEntry objects
   */
  async getRepositoriesInWorkspace(
    workspaceId: string,
    projectRegistry: ProjectRegistryStore,
  ): Promise<AlexandriaEntry[]> {
    // Get repository IDs in this workspace
    const memberships = await this.getWorkspaceMemberships(workspaceId);
    const repoIds = memberships.map((m) => m.repositoryId);

    // Find ALL entries matching these repository IDs
    const allEntries = projectRegistry.listProjects();
    return allEntries.filter((entry) => {
      const repoId = this.getRepositoryId(entry);
      return repoIds.includes(repoId);
    });
  }

  /**
   * Check if a repository is in a workspace
   *
   * @param repository - AlexandriaEntry or repository ID string
   * @param workspaceId - Workspace identifier
   */
  async isRepositoryInWorkspace(
    repository: AlexandriaEntry | string,
    workspaceId: string,
  ): Promise<boolean> {
    const repositoryId = this.getRepositoryId(repository);
    const data = this.loadMemberships();
    return data.memberships.some(
      (m) => m.repositoryId === repositoryId && m.workspaceId === workspaceId,
    );
  }

  /**
   * Get statistics about a workspace
   */
  async getWorkspaceStats(
    workspaceId: string,
    projectRegistry: ProjectRegistryStore,
  ): Promise<{
    repositoryCount: number;
    entryCount: number;
    lastUpdated: number;
  }> {
    const memberships = await this.getWorkspaceMemberships(workspaceId);
    const entries = await this.getRepositoriesInWorkspace(
      workspaceId,
      projectRegistry,
    );
    const workspace = await this.getWorkspace(workspaceId);

    return {
      repositoryCount: memberships.length,
      entryCount: entries.length,
      lastUpdated: workspace?.updatedAt || 0,
    };
  }

  // ===== Bulk Operations =====

  /**
   * Add multiple repositories to a workspace
   */
  async addRepositoriesToWorkspace(
    repositories: (AlexandriaEntry | string)[],
    workspaceId: string,
  ): Promise<void> {
    for (const repository of repositories) {
      await this.addRepositoryToWorkspace(repository, workspaceId);
    }
  }

  /**
   * Remove multiple repositories from a workspace
   */
  async removeRepositoriesFromWorkspace(
    repositories: (AlexandriaEntry | string)[],
    workspaceId: string,
  ): Promise<void> {
    const repositoryIds = repositories.map((r) => this.getRepositoryId(r));
    const data = this.loadMemberships();

    data.memberships = data.memberships.filter(
      (m) =>
        !(
          repositoryIds.includes(m.repositoryId) &&
          m.workspaceId === workspaceId
        ),
    );

    this.saveMemberships(data);
  }

  // ===== Default Workspace =====

  /**
   * Get the default workspace (for cloning)
   */
  async getDefaultWorkspace(): Promise<Workspace | null> {
    const data = this.loadWorkspaces();
    return data.workspaces.find((ws) => ws.isDefault === true) || null;
  }

  /**
   * Set a workspace as default
   * Unsets previous default
   */
  async setDefaultWorkspace(workspaceId: string): Promise<void> {
    const data = this.loadWorkspaces();
    const workspace = data.workspaces.find((ws) => ws.id === workspaceId);

    if (!workspace) {
      throw new Error(`Workspace with id '${workspaceId}' not found`);
    }

    // Unset all defaults
    data.workspaces.forEach((ws) => {
      ws.isDefault = false;
    });

    // Set new default
    workspace.isDefault = true;
    workspace.updatedAt = Date.now();

    this.saveWorkspaces(data);
  }

  // ===== Cleanup Methods =====

  /**
   * Clean up workspace memberships when a repository is removed
   * Called automatically by ProjectRegistryStore.removeProject()
   *
   * @param repositoryId - Repository ID to clean up
   * @internal
   */
  async cleanupRepositoryMemberships(repositoryId: string): Promise<void> {
    const data = this.loadMemberships();
    const originalLength = data.memberships.length;

    data.memberships = data.memberships.filter(
      (m) => m.repositoryId !== repositoryId,
    );

    // Only save if something changed
    if (data.memberships.length !== originalLength) {
      this.saveMemberships(data);
    }
  }
}
