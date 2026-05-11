/**
 * Pure ProjectRegistryStore - Platform-agnostic project registry management
 *
 * Identity model: `purl` is identity, `path` is a unique storage key,
 * `name` is a display label. Two clones of the same repo at different paths
 * are stored as sibling rows sharing a `purl` — name is never load-bearing.
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

  private ensureRegistryDir(): void {
    const registryDir = this.fs.dirname(this.registryPath);
    if (!this.fs.exists(registryDir)) {
      this.fs.createDir(registryDir);
    }
  }

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

  private saveRegistry(registry: ProjectRegistryData): void {
    this.ensureRegistryDir();
    this.fs.writeFile(this.registryPath, JSON.stringify(registry, null, 2));
  }

  private extractGitHubId(remoteUrl: string): string | null {
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/);
    if (!match) return null;
    return `${match[1]}/${match[2]}`;
  }

  private deriveDisplayName(
    projectPath: ValidatedRepositoryPath,
    remoteUrl?: string,
  ): string {
    if (remoteUrl) {
      const match = remoteUrl.match(
        /github\.com[:/][^/]+\/([^/.]+)(\.git)?$/,
      );
      if (match) return match[1];
    }
    return projectPath.split("/").pop() || "unknown";
  }

  private derivePurl(
    projectPath: ValidatedRepositoryPath,
    remoteUrl?: string,
  ): Purl {
    if (remoteUrl) {
      const fromRemote = extractPurlFromRemoteUrl(remoteUrl);
      if (fromRemote) return fromRemote;
    }
    return createLocalRepoPurl(projectPath);
  }

  /**
   * Register a project. Identity is `purl`; `name` is a display label only.
   *
   * - Same `path` already registered → returns the existing entry idempotently.
   * - Same `purl` at a different `path` → stored as a sibling row (no rename, no error).
   */
  public registerProject(
    projectPath: ValidatedRepositoryPath,
    remoteUrl?: string,
  ): AlexandriaEntry {
    const registry = this.loadRegistry();

    const existing = registry.projects.find((p) => p.path === projectPath);
    if (existing) return existing;

    const entry: AlexandriaEntry = {
      name: this.deriveDisplayName(projectPath, remoteUrl),
      path: projectPath,
      remoteUrl,
      purl: this.derivePurl(projectPath, remoteUrl),
      registeredAt: new Date().toISOString(),
      github: undefined,
      hasViews: false,
      viewCount: 0,
      views: [],
    };

    registry.projects.push(entry);
    this.saveRegistry(registry);

    return entry;
  }

  /**
   * Find all projects sharing the same GitHub repository.
   */
  public findClonesByGitHubId(githubId: string): AlexandriaEntry[] {
    const registry = this.loadRegistry();
    return registry.projects.filter((p) => p.github?.id === githubId);
  }

  /**
   * Find all projects sharing the same PURL identity.
   */
  public findClonesByPurl(purl: Purl): AlexandriaEntry[] {
    const registry = this.loadRegistry();
    return registry.projects.filter((p) => p.purl === purl);
  }

  public listProjects(): AlexandriaEntry[] {
    const registry = this.loadRegistry();
    return registry.projects;
  }

  /**
   * Look up a project by its unique path.
   */
  public getByPath(
    path: ValidatedRepositoryPath,
  ): AlexandriaEntry | undefined {
    const registry = this.loadRegistry();
    return registry.projects.find((p) => p.path === path);
  }

  /**
   * Remove the project at `path`.
   * @returns true if a row was removed, false if no row existed at that path.
   */
  public removeByPath(path: ValidatedRepositoryPath): boolean {
    const registry = this.loadRegistry();
    const initialLength = registry.projects.length;
    registry.projects = registry.projects.filter((p) => p.path !== path);

    if (registry.projects.length < initialLength) {
      this.saveRegistry(registry);
      return true;
    }

    return false;
  }

  /**
   * Remove every clone matching `purl`.
   * @returns the count of rows removed.
   */
  public removeAllByPurl(purl: Purl): number {
    const registry = this.loadRegistry();
    const initialLength = registry.projects.length;
    registry.projects = registry.projects.filter((p) => p.purl !== purl);

    const removed = initialLength - registry.projects.length;
    if (removed > 0) {
      this.saveRegistry(registry);
    }
    return removed;
  }

  /**
   * Update a project's mutable metadata. `path` and `registeredAt` are immutable;
   * `name` is a display label and may be changed.
   */
  public updateByPath(
    path: ValidatedRepositoryPath,
    updates: Partial<Omit<AlexandriaEntry, "path" | "registeredAt">>,
  ): void {
    const registry = this.loadRegistry();
    const projectIndex = registry.projects.findIndex((p) => p.path === path);

    if (projectIndex === -1) {
      throw new Error(`No project registered at path '${path}'`);
    }

    const project = registry.projects[projectIndex];

    registry.projects[projectIndex] = {
      ...project,
      ...updates,
      path: project.path,
      registeredAt: project.registeredAt,
    };

    this.saveRegistry(registry);
  }

  /**
   * Backfill PURLs onto pre-existing rows that lack them.
   */
  public migrateToPurl(): number {
    const registry = this.loadRegistry();
    let migratedCount = 0;

    for (const project of registry.projects) {
      if (project.purl) continue;

      let purl: Purl | undefined;

      if (project.remoteUrl) {
        purl = extractPurlFromRemoteUrl(project.remoteUrl) || undefined;
      }

      if (!purl && project.github?.id) {
        try {
          purl = extractPurlFromRemoteUrl(
            `https://github.com/${project.github.id}.git`,
          ) || undefined;
        } catch {
          // ignore
        }
      }

      if (!purl) {
        purl = createLocalRepoPurl(project.path);
      }

      project.purl = purl;
      migratedCount++;
    }

    if (migratedCount > 0) {
      this.saveRegistry(registry);
    }

    return migratedCount;
  }
}
