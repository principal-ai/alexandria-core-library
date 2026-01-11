/**
 * Pure ProjectRegistryStore - Platform-agnostic project registry management
 *
 * Manages a registry of local project paths with their git remotes
 */

import { FileSystemAdapter } from "../pure-core/abstractions/filesystem";
import { ValidatedRepositoryPath } from "../pure-core/types";
import { AlexandriaEntry } from "../pure-core/types/repository";
import { ProjectRegistryData } from "./types";
import {
  extractPurlFromRemoteUrl,
  createLocalRepoPurl,
  type Purl,
} from "../pure-core/utils/purl.js";

export class ProjectRegistryStore {
  private fs: FileSystemAdapter;
  private registryPath: string;

  constructor(fileSystemAdapter: FileSystemAdapter, homeDir: string) {
    this.fs = fileSystemAdapter;
    this.registryPath = this.fs.join(homeDir, ".alexandria", "projects.json");
  }

  /**
   * Ensure the registry directory exists
   */
  private ensureRegistryDir(): void {
    const registryDir = this.fs.dirname(this.registryPath);
    if (!this.fs.exists(registryDir)) {
      this.fs.createDir(registryDir);
    }
  }

  /**
   * Load the project registry
   */
  private loadRegistry(): ProjectRegistryData {
    this.ensureRegistryDir();

    if (!this.fs.exists(this.registryPath)) {
      return {
        version: "1.0.0",
        projects: [],
      };
    }

    try {
      const content = this.fs.readFile(this.registryPath);
      return JSON.parse(content) as ProjectRegistryData;
    } catch {
      return {
        version: "1.0.0",
        projects: [],
      };
    }
  }

  /**
   * Save the project registry
   */
  private saveRegistry(registry: ProjectRegistryData): void {
    this.ensureRegistryDir();
    this.fs.writeFile(this.registryPath, JSON.stringify(registry, null, 2));
  }

  /**
   * Extract owner/name from GitHub URL
   * @returns GitHub ID in format "owner/repo" or null if not a GitHub URL
   */
  private extractGitHubId(remoteUrl: string): string | null {
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/);
    if (!match) return null;
    return `${match[1]}/${match[2]}`;
  }

  /**
   * Register a new project
   */
  public registerProject(
    name: string,
    projectPath: ValidatedRepositoryPath,
    remoteUrl?: string,
  ): void {
    const registry = this.loadRegistry();

    // Check if name already exists
    if (registry.projects.some((p) => p.name === name)) {
      throw new Error(`Project with name '${name}' already exists`);
    }

    // Check if path already registered
    const existingProject = registry.projects.find(
      (p) => p.path === projectPath,
    );
    if (existingProject) {
      throw new Error(`Path already registered as '${existingProject.name}'`);
    }

    const entry: AlexandriaEntry = {
      name,
      path: projectPath,
      remoteUrl,
      registeredAt: new Date().toISOString(),
      github: undefined, // Will be populated when fetching from GitHub
      hasViews: false, // Will be updated when scanning for views
      viewCount: 0,
      views: [],
    };

    registry.projects.push(entry);

    this.saveRegistry(registry);
  }

  /**
   * Register a project with auto-detected name from GitHub URL
   * Uses owner/name format for GitHub repos to avoid name collisions
   * Also generates PURL for canonical identification
   * @param projectPath - Local path to the repository
   * @param remoteUrl - Git remote URL (optional)
   * @param customName - Override auto-detected name (optional)
   * @returns The registered AlexandriaEntry
   */
  public registerWithGitHubName(
    projectPath: ValidatedRepositoryPath,
    remoteUrl?: string,
    customName?: string,
  ): AlexandriaEntry {
    let name: string;
    let purl: Purl | undefined;

    // Extract PURL from remote URL if available
    if (remoteUrl) {
      purl = extractPurlFromRemoteUrl(remoteUrl) || undefined;
    } else {
      // Generate path-based PURL for local repos without remote
      purl = createLocalRepoPurl(projectPath);
    }

    if (customName) {
      name = customName;
    } else if (remoteUrl) {
      const githubId = this.extractGitHubId(remoteUrl);
      if (githubId) {
        name = githubId; // Use "owner/repo" format
      } else {
        // Fallback to last component of path
        name = projectPath.split("/").pop() || "unknown";
      }
    } else {
      // No remote URL, use last component of path
      name = projectPath.split("/").pop() || "unknown";
    }

    this.registerProject(name, projectPath, remoteUrl);

    // Update with PURL if we generated one
    if (purl) {
      this.updateProject(name, { purl });
    }

    const entry = this.getProject(name);
    if (!entry) {
      throw new Error(`Failed to register project at ${projectPath}`);
    }
    return entry;
  }

  /**
   * Find all projects that share the same GitHub repository
   * (multiple local clones of the same repo)
   * @param githubId - GitHub ID in format "owner/repo"
   * @returns Array of AlexandriaEntry instances
   */
  public findClonesByGitHubId(githubId: string): AlexandriaEntry[] {
    const registry = this.loadRegistry();
    return registry.projects.filter((p) => p.github?.id === githubId);
  }

  /**
   * Find all projects that share the same PURL
   * (multiple local clones or worktrees of the same repo)
   * @param purl - Package URL identifier
   * @returns Array of AlexandriaEntry instances
   */
  public findClonesByPurl(purl: Purl): AlexandriaEntry[] {
    const registry = this.loadRegistry();
    return registry.projects.filter((p) => p.purl === purl);
  }

  /**
   * List all registered projects
   */
  public listProjects(): AlexandriaEntry[] {
    const registry = this.loadRegistry();
    return registry.projects;
  }

  /**
   * Get a project by name
   */
  public getProject(name: string): AlexandriaEntry | undefined {
    const registry = this.loadRegistry();
    return registry.projects.find((p) => p.name === name);
  }

  /**
   * Remove a project from the registry
   */
  public removeProject(name: string): boolean {
    const registry = this.loadRegistry();
    const initialLength = registry.projects.length;
    registry.projects = registry.projects.filter((p) => p.name !== name);

    if (registry.projects.length < initialLength) {
      this.saveRegistry(registry);
      return true;
    }

    return false;
  }

  /**
   * Update a project's metadata
   */
  public updateProject(
    name: string,
    updates: Partial<Omit<AlexandriaEntry, "name" | "registeredAt">>,
  ): void {
    const registry = this.loadRegistry();
    const projectIndex = registry.projects.findIndex((p) => p.name === name);

    if (projectIndex === -1) {
      throw new Error(`Project '${name}' not found`);
    }

    const project = registry.projects[projectIndex];

    // Special handling for path changes
    if (updates.path && updates.path !== project.path) {
      // Check if new path is already registered
      const existingWithPath = registry.projects.find(
        (p) => p.path === updates.path && p.name !== name,
      );
      if (existingWithPath) {
        throw new Error(
          `Path already registered as '${existingWithPath.name}'`,
        );
      }
    }

    // Apply all updates
    registry.projects[projectIndex] = {
      ...project,
      ...updates,
      // Preserve immutable fields
      name: project.name,
      registeredAt: project.registeredAt,
    };

    this.saveRegistry(registry);
  }

  /**
   * Migrate all projects to use PURLs
   * Generates PURLs from remoteUrl or github.id for projects that don't have them
   */
  public migrateToPurl(): number {
    const registry = this.loadRegistry();
    let migratedCount = 0;

    for (const project of registry.projects) {
      if (project.purl) {
        // Already has PURL, skip
        continue;
      }

      let purl: Purl | undefined;

      // Try to extract PURL from remote URL
      if (project.remoteUrl) {
        purl = extractPurlFromRemoteUrl(project.remoteUrl) || undefined;
      }

      // Fallback: Convert github.id to PURL
      if (!purl && project.github?.id) {
        try {
          purl = extractPurlFromRemoteUrl(
            `https://github.com/${project.github.id}.git`,
          ) || undefined;
        } catch {
          // Ignore errors
        }
      }

      // Update if we generated a PURL
      if (purl) {
        project.purl = purl;
        migratedCount++;
      }
    }

    if (migratedCount > 0) {
      this.saveRegistry(registry);
    }

    return migratedCount;
  }
}
