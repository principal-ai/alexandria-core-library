import { ProjectRegistryStore } from "./ProjectRegistryStore.js";
import { WorkspaceManager } from "./WorkspaceManager.js";
import { MemoryPalace } from "../MemoryPalace.js";
import type {
  AlexandriaRepository,
  AlexandriaEntry,
  GithubRepository,
} from "../pure-core/types/repository.js";
import type { CodebaseViewSummary } from "../pure-core/types/summary.js";
import { extractCodebaseViewSummary } from "../pure-core/types/summary.js";
import type { ValidatedRepositoryPath } from "../pure-core/types/index.js";
import { ConfigLoader } from "../config/loader.js";
import type { Purl } from "../pure-core/utils/purl.js";

import { FileSystemAdapter } from "../pure-core/abstractions/filesystem.js";
import { GlobAdapter } from "../pure-core/abstractions/glob.js";

export class AlexandriaOutpostManager {
  private readonly projectRegistry: ProjectRegistryStore;

  /**
   * Workspace management for organizing repositories
   */
  public readonly workspaces: WorkspaceManager;

  /**
   * Creates an AlexandriaOutpostManager instance.
   *
   * @param fsAdapter - File system adapter for platform-agnostic file operations
   * @param globAdapter - Glob adapter for pattern matching
   * @param homeDir - User's home directory path (e.g., from `os.homedir()` in Node.js)
   */
  constructor(
    private readonly fsAdapter: FileSystemAdapter,
    private readonly globAdapter: GlobAdapter,
    homeDir: string,
  ) {
    const alexandriaPath = fsAdapter.join(homeDir, ".alexandria");

    this.projectRegistry = new ProjectRegistryStore(fsAdapter, homeDir);

    // Initialize workspace manager with same registry path
    this.workspaces = new WorkspaceManager(alexandriaPath, fsAdapter);
  }

  async getAllRepositories(): Promise<AlexandriaRepository[]> {
    // Get all registered projects from existing registry
    const entries = this.projectRegistry.listProjects();

    // Transform each to API format
    const repositories = await Promise.all(
      entries.map((entry) => this.transformToRepository(entry)),
    );

    return repositories.filter(
      (repo) => repo !== null,
    ) as AlexandriaRepository[];
  }

  async getRepository(name: string): Promise<AlexandriaRepository | null> {
    const entry = this.projectRegistry.getProject(name);
    if (!entry) return null;

    return this.transformToRepository(entry);
  }

  /**
   * Find all local clones of a GitHub repository
   * @param githubId - GitHub ID in format "owner/repo"
   * @returns Array of AlexandriaRepository instances (all local clones)
   */
  async findClonesByGitHubId(
    githubId: string,
  ): Promise<AlexandriaRepository[]> {
    const entries = this.projectRegistry.findClonesByGitHubId(githubId);
    return Promise.all(entries.map((e) => this.transformToRepository(e)));
  }

  /**
   * Find all local clones/worktrees of a repository by PURL
   * @param purl - Package URL identifier
   * @returns Array of AlexandriaRepository instances (all local clones/worktrees)
   */
  async findClonesByPurl(purl: Purl): Promise<AlexandriaRepository[]> {
    const entries = this.projectRegistry.findClonesByPurl(purl);
    return Promise.all(entries.map((e) => this.transformToRepository(e)));
  }

  async registerRepository(
    path: string,
    remoteUrl?: string,
    customName?: string,
  ): Promise<AlexandriaRepository> {
    // Use smart registration that auto-detects GitHub owner/name format
    const entry = this.projectRegistry.registerWithGitHubName(
      path as ValidatedRepositoryPath,
      remoteUrl,
      customName,
    );

    return this.transformToRepository(entry);
  }

  async getRepositoryByPath(
    path: string,
  ): Promise<AlexandriaRepository | null> {
    // Find repository by path
    const entries = this.projectRegistry.listProjects();
    const entry = entries.find((e) => e.path === path);

    if (!entry) return null;
    return this.transformToRepository(entry);
  }

  getRepositoryCount(): number {
    return this.projectRegistry.listProjects().length;
  }

  getAllEntries(): AlexandriaEntry[] {
    return this.projectRegistry.listProjects();
  }

  /**
   * Get the project registry store for workspace operations
   * @internal Used by WorkspaceManager for querying repository entries
   */
  getProjectRegistry(): ProjectRegistryStore {
    return this.projectRegistry;
  }

  /**
   * Get all overview file paths for views in a given repository entry
   * @param entry - The AlexandriaEntry for the local repository
   * @returns Array of overview file paths relative to repository root
   */
  async getAlexandriaEntryDocs(entry: AlexandriaEntry): Promise<string[]> {
    try {
      // Use protected method to create MemoryPalace (allows mocking in tests)
      const memoryPalace = this.createMemoryPalace(entry.path);

      // Get all views and extract their overview paths
      const views = memoryPalace.listViews();
      return views
        .map((v) => v.overviewPath)
        .filter((path) => path && path.length > 0);
    } catch (error) {
      console.debug(`Could not load views for ${entry.name}:`, error);
      return [];
    }
  }

  /**
   * Protected method to create a MemoryPalace instance
   * Can be overridden in tests for mocking
   */
  protected createMemoryPalace(path: ValidatedRepositoryPath): MemoryPalace {
    return new MemoryPalace(path, this.fsAdapter);
  }

  /**
   * Get excluded document files from Alexandria require-references rule configuration
   * These are markdown files that are excluded from the requirement to be associated with CodebaseViews
   * @param entry - The AlexandriaEntry for the local repository
   * @returns Array of file paths excluded from tracking, or empty array if no config
   */
  getAlexandriaEntryExcludedDocs(entry: AlexandriaEntry): string[] {
    try {
      // Create a ConfigLoader to load the Alexandria configuration
      const configLoader = new ConfigLoader(this.fsAdapter);

      // Find and load config from the repository directory
      const configPath = configLoader.findConfigFile(entry.path);
      const config = configPath ? configLoader.loadConfig(configPath) : null;

      // Find the require-references rule configuration
      const requireReferencesRule = config?.context?.rules?.find(
        (rule) => rule.id === "require-references",
      );

      // Return the excludeFiles list if it exists
      const excludeFiles = (
        requireReferencesRule?.options as Record<string, unknown>
      )?.excludeFiles;
      return Array.isArray(excludeFiles) ? excludeFiles : [];
    } catch (error) {
      console.debug(
        `Could not load Alexandria config for ${entry.name}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Get all markdown documentation files in a repository
   * @param entry - The AlexandriaEntry for the local repository
   * @param useGitignore - Whether to respect .gitignore files (default: true)
   * @returns Array of all markdown file paths relative to repository root
   */
  async getAllDocs(
    entry: AlexandriaEntry,
    useGitignore: boolean = true,
  ): Promise<string[]> {
    try {
      // Find all markdown files in the repository
      const markdownFiles = await this.globAdapter.findFiles(
        ["**/*.md", "**/*.mdx"],
        {
          cwd: entry.path,
          gitignore: useGitignore,
          dot: false,
          onlyFiles: true,
        },
      );

      return markdownFiles;
    } catch (error) {
      console.debug(`Could not scan markdown files for ${entry.name}:`, error);
      return [];
    }
  }

  /**
   * Get untracked markdown documentation files in a repository
   * These are markdown files that are not used as overviews in any CodebaseView
   * and are not in the excluded files list
   * @param entry - The AlexandriaEntry for the local repository
   * @param useGitignore - Whether to respect .gitignore files (default: true)
   * @returns Array of untracked markdown file paths relative to repository root
   */
  async getUntrackedDocs(
    entry: AlexandriaEntry,
    useGitignore: boolean = true,
  ): Promise<string[]> {
    // Get all markdown files
    const allDocs = await this.getAllDocs(entry, useGitignore);

    // Get tracked docs (used as view overviews)
    const trackedDocs = await this.getAlexandriaEntryDocs(entry);

    // Get excluded docs from config
    const excludedDocs = this.getAlexandriaEntryExcludedDocs(entry);

    // Create sets for efficient lookup
    const trackedSet = new Set(trackedDocs);
    const excludedSet = new Set(excludedDocs);

    // Filter out tracked and excluded docs, and Alexandria's own files
    return allDocs.filter((doc) => {
      // Skip if tracked
      if (trackedSet.has(doc)) return false;

      // Skip if excluded
      if (excludedSet.has(doc)) return false;

      // Skip Alexandria's own files
      if (doc.startsWith(".alexandria/")) return false;

      return true;
    });
  }

  /**
   * Update an existing repository entry's metadata
   * @param name - The repository name
   * @param updates - Partial updates to apply to the repository entry
   * @returns The updated AlexandriaEntry
   * @throws Error if repository not found
   */
  async updateRepository(
    name: string,
    updates: Partial<Omit<AlexandriaEntry, "name" | "registeredAt">>,
  ): Promise<AlexandriaEntry> {
    const entry = this.projectRegistry.getProject(name);
    if (!entry) {
      throw new Error(`Repository '${name}' not found`);
    }

    // Update the project in registry
    this.projectRegistry.updateProject(name, updates);

    // Return the updated entry
    const updatedEntry = this.projectRegistry.getProject(name);
    if (!updatedEntry) {
      throw new Error(`Failed to retrieve updated repository '${name}'`);
    }

    return updatedEntry;
  }

  /**
   * Update GitHub metadata for a repository
   * @param name - The repository name
   * @param github - GitHub metadata to update
   * @returns The updated AlexandriaEntry with GitHub metadata
   * @throws Error if repository not found
   */
  async updateGitHubMetadata(
    name: string,
    github: Partial<GithubRepository>,
  ): Promise<AlexandriaEntry> {
    const entry = this.projectRegistry.getProject(name);
    if (!entry) {
      throw new Error(`Repository '${name}' not found`);
    }

    // Merge with existing GitHub data if present
    const updatedGithub: GithubRepository = {
      ...(entry.github || {
        id: `${github.owner || "unknown"}/${github.name || name}`,
        owner: github.owner || "unknown",
        name: github.name || name,
        stars: 0,
        lastUpdated: new Date().toISOString(),
      }),
      ...github,
      // Always update the lastUpdated timestamp
      lastUpdated: new Date().toISOString(),
    };

    // Update the repository with new GitHub data and lastChecked timestamp
    return this.updateRepository(name, {
      github: updatedGithub,
      lastChecked: new Date().toISOString(),
    });
  }

  /**
   * Refresh GitHub metadata by fetching from GitHub API
   * @param name - The repository name
   * @returns The updated AlexandriaEntry with fresh GitHub metadata
   * @throws Error if repository not found or has no remote URL
   */
  async refreshGitHubMetadata(name: string): Promise<AlexandriaEntry> {
    const entry = this.projectRegistry.getProject(name);
    if (!entry) {
      throw new Error(`Repository '${name}' not found`);
    }

    if (!entry.remoteUrl) {
      throw new Error(`Repository '${name}' has no remote URL configured`);
    }

    // Extract owner and repo name from remote URL
    const match = entry.remoteUrl.match(
      /github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/,
    );
    if (!match) {
      throw new Error(
        `Could not parse GitHub URL from remote: ${entry.remoteUrl}`,
      );
    }

    const [, owner, repoName] = match;

    try {
      // Fetch repository data from GitHub API
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Alexandria-Library",
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `GitHub API returned ${response.status}: ${response.statusText}`,
        );
      }

      const githubData = await response.json();

      // Map GitHub API response to our GithubRepository type
      const githubMetadata: GithubRepository = {
        id: githubData.full_name,
        owner: githubData.owner.login,
        name: githubData.name,
        description: githubData.description || undefined,
        stars: githubData.stargazers_count || 0,
        primaryLanguage: githubData.language || undefined,
        topics: githubData.topics || [],
        license: githubData.license?.spdx_id || undefined,
        defaultBranch: githubData.default_branch || "main",
        isPublic: !githubData.private,
        lastCommit: githubData.pushed_at || githubData.updated_at,
        lastUpdated: new Date().toISOString(),
      };

      // Update the repository with fresh GitHub data
      return this.updateGitHubMetadata(name, githubMetadata);
    } catch {
      // If GitHub API fails, at least update with basic info from remote URL
      const basicGithub: Partial<GithubRepository> = {
        id: `${owner}/${repoName}`,
        owner,
        name: repoName,
      };

      return this.updateGitHubMetadata(name, basicGithub);
    }
  }

  /**
   * Refresh view information by rescanning the .alexandria/views directory
   * @param name - The repository name
   * @returns The updated AlexandriaEntry with fresh view data
   * @throws Error if repository not found
   */
  async refreshViews(name: string): Promise<AlexandriaEntry> {
    const entry = this.projectRegistry.getProject(name);
    if (!entry) {
      throw new Error(`Repository '${name}' not found`);
    }

    try {
      // Create MemoryPalace instance to scan views
      const memoryPalace = this.createMemoryPalace(entry.path);

      // Get fresh view data
      const views = memoryPalace.listViews();
      const viewSummaries = views.map((v) => extractCodebaseViewSummary(v));

      // Update the repository with fresh view data
      return this.updateRepository(name, {
        hasViews: viewSummaries.length > 0,
        viewCount: viewSummaries.length,
        views: viewSummaries,
        lastChecked: new Date().toISOString(),
      });
    } catch (error) {
      console.debug(`Failed to refresh views for ${name}:`, error);

      // Even if view scanning fails, update the lastChecked timestamp
      return this.updateRepository(name, {
        hasViews: false,
        viewCount: 0,
        views: [],
        lastChecked: new Date().toISOString(),
      });
    }
  }

  /**
   * Refresh all repository metadata (GitHub and views) for all registered repositories
   * @param options - Control what to refresh
   * @returns Array of updated AlexandriaRepository entries
   */
  async refreshAllRepositories(options?: {
    github?: boolean;
    views?: boolean;
  }): Promise<AlexandriaRepository[]> {
    const { github = true, views = true } = options || {};

    const entries = this.projectRegistry.listProjects();
    const results: AlexandriaRepository[] = [];

    for (const entry of entries) {
      try {
        let updatedEntry = entry;

        // Refresh views if requested
        if (views) {
          updatedEntry = await this.refreshViews(entry.name);
        }

        // Refresh GitHub metadata if requested and remote URL exists
        if (github && entry.remoteUrl) {
          try {
            updatedEntry = await this.refreshGitHubMetadata(entry.name);
          } catch (error) {
            console.debug(
              `Failed to refresh GitHub metadata for ${entry.name}:`,
              error,
            );
          }
        }

        // Transform to AlexandriaRepository format
        const repository = await this.transformToRepository(updatedEntry);
        results.push(repository);
      } catch (error) {
        console.error(`Failed to refresh repository ${entry.name}:`, error);
        // Include the original entry even if refresh failed
        const repository = await this.transformToRepository(entry);
        results.push(repository);
      }
    }

    return results;
  }

  private async transformToRepository(
    entry: AlexandriaEntry,
  ): Promise<AlexandriaRepository> {
    // Load views if not already loaded
    let views: CodebaseViewSummary[] = entry.views || [];

    if (views.length === 0) {
      try {
        // Use protected method to create MemoryPalace
        const memoryPalace = this.createMemoryPalace(entry.path);

        // Get views from the memory palace
        views = memoryPalace
          .listViews()
          .map((v) => extractCodebaseViewSummary(v));
      } catch (error) {
        // If we can't load views, continue with empty array
        console.debug(`Could not load views for ${entry.name}:`, error);
        views = [];
      }
    }

    // Extract owner from remote URL if available
    const owner = this.extractOwner(entry.remoteUrl);

    // Build the repository data according to AlexandriaRepository type
    const repo: AlexandriaRepository = {
      name: entry.name,
      remoteUrl: entry.remoteUrl,
      registeredAt: entry.registeredAt,
      hasViews: views.length > 0,
      viewCount: views.length,
      views,
      // Only include github if we have github data or can construct it
      github:
        entry.github ||
        (owner
          ? {
              id: `${owner}/${entry.name}`,
              owner: owner,
              name: entry.name,
              stars: 0,
              lastUpdated: new Date().toISOString(),
            }
          : undefined),
    };

    return repo;
  }

  private extractOwner(remoteUrl?: string): string | null {
    if (!remoteUrl) return null;
    // Extract owner from git URL
    const match = remoteUrl.match(/github\.com[:/]([^/]+)/);
    return match ? match[1] : null;
  }
}
