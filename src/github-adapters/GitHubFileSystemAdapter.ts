/**
 * GitHub repository implementation of FileSystemAdapter
 *
 * This adapter uses the GitHub API to read/write files in a repository.
 * It enables using a GitHub repo as a storage backend for workspaces,
 * useful for curated collections that can be edited by repo collaborators.
 *
 * Key format: Repository paths like `/workspaces.json`
 *
 * Note: All operations are async. Sync methods use a local cache.
 * Call `preload()` or `preloadDirectory()` to populate cache before sync access.
 */

import { FileSystemAdapter } from "../pure-core/abstractions/filesystem";

/**
 * Options for GitHubFileSystemAdapter
 */
export interface GitHubFileSystemAdapterOptions {
  /**
   * GitHub repository owner (user or organization)
   */
  owner: string;

  /**
   * GitHub repository name
   */
  repo: string;

  /**
   * GitHub personal access token for authentication
   * Required for write operations and private repos
   * Optional for read-only access to public repos
   */
  token?: string;

  /**
   * Branch to read/write from
   * @default 'main'
   */
  branch?: string;

  /**
   * Base path within the repository
   * All operations will be relative to this path
   * @default ''
   */
  basePath?: string;

  /**
   * GitHub API base URL
   * @default 'https://api.github.com'
   */
  apiBaseUrl?: string;

  /**
   * Custom fetch implementation (for testing or special environments)
   * @default globalThis.fetch
   */
  fetch?: typeof fetch;
}

/**
 * GitHub API response types
 */
interface GitHubContentResponse {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  content?: string;
  encoding?: string;
  download_url?: string;
}

interface GitHubTreeResponse {
  sha: string;
  tree: Array<{
    path: string;
    mode: string;
    type: "blob" | "tree";
    sha: string;
    size?: number;
  }>;
  truncated: boolean;
}

/**
 * Cache entry for file content
 */
interface CacheEntry {
  content: string;
  sha: string;
  timestamp: number;
}

/**
 * GitHub repository implementation of FileSystemAdapter
 */
export class GitHubFileSystemAdapter implements FileSystemAdapter {
  private readonly owner: string;
  private readonly repo: string;
  private readonly token?: string;
  private readonly branch: string;
  private readonly basePath: string;
  private readonly apiBaseUrl: string;
  private readonly fetchFn: typeof fetch;

  // Local cache for sync operations
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly dirCache: Map<string, string[]> = new Map();
  private readonly existsCache: Map<string, boolean> = new Map();

  constructor(options: GitHubFileSystemAdapterOptions) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.token = options.token;
    this.branch = options.branch ?? "main";
    this.basePath = options.basePath ?? "";
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.github.com";

    if (options.fetch) {
      this.fetchFn = options.fetch;
    } else if (typeof globalThis !== "undefined" && globalThis.fetch) {
      this.fetchFn = globalThis.fetch.bind(globalThis);
    } else {
      throw new Error(
        "fetch is not available. Provide a fetch option or run in an environment with fetch.",
      );
    }
  }

  /**
   * Get the full path within the repository
   */
  private getRepoPath(path: string): string {
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    if (!this.basePath) return cleanPath;
    return `${this.basePath}/${cleanPath}`.replace(/\/+/g, "/");
  }

  /**
   * Get common headers for GitHub API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Make a GitHub API request
   */
  private async apiRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.apiBaseUrl}${endpoint}`;
    const response = await this.fetchFn(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...(options.headers as Record<string, string>),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  // ============================================
  // Async Methods (Primary API)
  // ============================================

  /**
   * Check if a file or directory exists (async)
   */
  async existsAsync(path: string): Promise<boolean> {
    const repoPath = this.getRepoPath(path);

    // Check cache first
    if (this.existsCache.has(repoPath)) {
      return this.existsCache.get(repoPath)!;
    }

    try {
      await this.apiRequest<GitHubContentResponse>(
        `/repos/${this.owner}/${this.repo}/contents/${repoPath}?ref=${this.branch}`,
      );
      this.existsCache.set(repoPath, true);
      return true;
    } catch {
      this.existsCache.set(repoPath, false);
      return false;
    }
  }

  /**
   * Read file content (async)
   */
  async readFileAsync(path: string): Promise<string> {
    const repoPath = this.getRepoPath(path);

    // Check cache first
    const cached = this.cache.get(repoPath);
    if (cached) {
      return cached.content;
    }

    const response = await this.apiRequest<GitHubContentResponse>(
      `/repos/${this.owner}/${this.repo}/contents/${repoPath}?ref=${this.branch}`,
    );

    if (response.type !== "file") {
      throw new Error(`Not a file: ${path}`);
    }

    if (!response.content || response.encoding !== "base64") {
      throw new Error(`Unable to read file content: ${path}`);
    }

    // Decode base64 content
    const content = atob(response.content.replace(/\n/g, ""));

    // Cache the result
    this.cache.set(repoPath, {
      content,
      sha: response.sha,
      timestamp: Date.now(),
    });
    this.existsCache.set(repoPath, true);

    return content;
  }

  /**
   * Write file content (async)
   * Requires authentication with write access
   */
  async writeFileAsync(path: string, content: string): Promise<void> {
    if (!this.token) {
      throw new Error("Write operations require authentication. Provide a token.");
    }

    const repoPath = this.getRepoPath(path);

    // Check if file exists to get SHA for update
    let sha: string | undefined;
    try {
      const existing = await this.apiRequest<GitHubContentResponse>(
        `/repos/${this.owner}/${this.repo}/contents/${repoPath}?ref=${this.branch}`,
      );
      sha = existing.sha;
    } catch {
      // File doesn't exist, will create new
    }

    // Encode content to base64
    const encodedContent = btoa(content);

    const body: Record<string, string> = {
      message: `Update ${repoPath}`,
      content: encodedContent,
      branch: this.branch,
    };

    if (sha) {
      body.sha = sha;
    }

    const response = await this.apiRequest<{ content: GitHubContentResponse }>(
      `/repos/${this.owner}/${this.repo}/contents/${repoPath}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );

    // Update cache
    this.cache.set(repoPath, {
      content,
      sha: response.content.sha,
      timestamp: Date.now(),
    });
    this.existsCache.set(repoPath, true);
  }

  /**
   * Delete a file (async)
   * Requires authentication with write access
   */
  async deleteFileAsync(path: string): Promise<void> {
    if (!this.token) {
      throw new Error("Delete operations require authentication. Provide a token.");
    }

    const repoPath = this.getRepoPath(path);

    // Get current SHA
    const existing = await this.apiRequest<GitHubContentResponse>(
      `/repos/${this.owner}/${this.repo}/contents/${repoPath}?ref=${this.branch}`,
    );

    await this.apiRequest(
      `/repos/${this.owner}/${this.repo}/contents/${repoPath}`,
      {
        method: "DELETE",
        body: JSON.stringify({
          message: `Delete ${repoPath}`,
          sha: existing.sha,
          branch: this.branch,
        }),
      },
    );

    // Clear from cache
    this.cache.delete(repoPath);
    this.existsCache.set(repoPath, false);
  }

  /**
   * Read directory contents (async)
   */
  async readDirAsync(path: string): Promise<string[]> {
    const repoPath = this.getRepoPath(path);

    // Check cache first
    const cached = this.dirCache.get(repoPath);
    if (cached) {
      return cached;
    }

    const response = await this.apiRequest<GitHubContentResponse[]>(
      `/repos/${this.owner}/${this.repo}/contents/${repoPath}?ref=${this.branch}`,
    );

    if (!Array.isArray(response)) {
      throw new Error(`Not a directory: ${path}`);
    }

    const entries = response.map((item) => item.name);

    // Cache the result
    this.dirCache.set(repoPath, entries);
    this.existsCache.set(repoPath, true);

    // Also cache existence of children
    for (const item of response) {
      this.existsCache.set(item.path, true);
    }

    return entries;
  }

  /**
   * Check if path is a directory (async)
   */
  async isDirectoryAsync(path: string): Promise<boolean> {
    const repoPath = this.getRepoPath(path);

    try {
      const response = await this.apiRequest<
        GitHubContentResponse | GitHubContentResponse[]
      >(
        `/repos/${this.owner}/${this.repo}/contents/${repoPath}?ref=${this.branch}`,
      );

      return Array.isArray(response) || response.type === "dir";
    } catch {
      return false;
    }
  }

  /**
   * Preload a file into cache for sync access
   */
  async preload(path: string): Promise<void> {
    await this.readFileAsync(path);
  }

  /**
   * Preload an entire directory recursively into cache
   */
  async preloadDirectory(path: string = "/"): Promise<void> {
    const repoPath = this.getRepoPath(path);

    // Use Git Trees API for efficient recursive listing
    try {
      const tree = await this.apiRequest<GitHubTreeResponse>(
        `/repos/${this.owner}/${this.repo}/git/trees/${this.branch}?recursive=1`,
      );

      const prefix = repoPath ? `${repoPath}/` : "";

      for (const item of tree.tree) {
        if (item.type === "blob" && (!prefix || item.path.startsWith(prefix))) {
          // Preload files in the target directory
          try {
            await this.readFileAsync(
              prefix ? item.path.slice(prefix.length) : item.path,
            );
          } catch {
            // Ignore individual file errors
          }
        }
      }
    } catch (error) {
      // Fallback to non-recursive if tree API fails
      console.warn("Tree API failed, falling back to directory listing:", error);
      await this.readDirAsync(path);
    }
  }

  // ============================================
  // Sync Methods (Use Cache - Required by Interface)
  // ============================================

  exists(path: string): boolean {
    const repoPath = this.getRepoPath(path);
    const cached = this.existsCache.get(repoPath);
    if (cached !== undefined) {
      return cached;
    }
    // If not in cache, assume false - caller should use existsAsync
    return false;
  }

  readFile(path: string): string {
    const repoPath = this.getRepoPath(path);
    const cached = this.cache.get(repoPath);
    if (cached) {
      return cached.content;
    }
    throw new Error(
      `File not in cache: ${path}. Call preload() or readFileAsync() first.`,
    );
  }

  writeFile(path: string, content: string): void {
    // For sync write, just update cache - actual write happens lazily
    const repoPath = this.getRepoPath(path);
    this.cache.set(repoPath, {
      content,
      sha: "", // Will be set on actual write
      timestamp: Date.now(),
    });
    this.existsCache.set(repoPath, true);

    // Queue async write
    void this.writeFileAsync(path, content).catch((err) => {
      console.error(`Failed to write ${path} to GitHub:`, err);
    });
  }

  deleteFile(path: string): void {
    const repoPath = this.getRepoPath(path);
    this.cache.delete(repoPath);
    this.existsCache.set(repoPath, false);

    // Queue async delete
    void this.deleteFileAsync(path).catch((err) => {
      console.error(`Failed to delete ${path} from GitHub:`, err);
    });
  }

  readBinaryFile(_path: string): Uint8Array {
    throw new Error(
      "Binary file operations not supported by GitHubFileSystemAdapter",
    );
  }

  writeBinaryFile(_path: string, _content: Uint8Array): void {
    throw new Error(
      "Binary file operations not supported by GitHubFileSystemAdapter",
    );
  }

  createDir(_path: string): void {
    // GitHub doesn't have empty directories - they're created implicitly
    // Just mark as existing in cache
    const repoPath = this.getRepoPath(_path);
    this.existsCache.set(repoPath, true);
  }

  readDir(path: string): string[] {
    const repoPath = this.getRepoPath(path);
    const cached = this.dirCache.get(repoPath);
    if (cached) {
      return cached;
    }
    throw new Error(
      `Directory not in cache: ${path}. Call preloadDirectory() or readDirAsync() first.`,
    );
  }

  deleteDir(_path: string): void {
    throw new Error(
      "Directory deletion not supported by GitHubFileSystemAdapter. Delete files individually.",
    );
  }

  isDirectory(path: string): boolean {
    const repoPath = this.getRepoPath(path);
    return this.dirCache.has(repoPath);
  }

  // ============================================
  // Path Operations (Pure - No I/O)
  // ============================================

  join(...paths: string[]): string {
    return (
      paths
        .filter(Boolean)
        .join("/")
        .replace(/\/+/g, "/")
        .replace(/\/$/, "") || "/"
    );
  }

  dirname(path: string): string {
    const lastSlash = path.lastIndexOf("/");
    return lastSlash <= 0 ? "/" : path.slice(0, lastSlash);
  }

  basename(filePath: string, ext?: string): string {
    const lastSlash = filePath.lastIndexOf("/");
    let name = lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
    if (ext && name.endsWith(ext)) {
      name = name.slice(0, -ext.length);
    }
    return name;
  }

  extname(filePath: string): string {
    const name = this.basename(filePath);
    const lastDot = name.lastIndexOf(".");
    if (lastDot <= 0) return "";
    return name.slice(lastDot);
  }

  isAbsolute(path: string): boolean {
    return path.startsWith("/");
  }

  relative(from: string, to: string): string {
    if (to.startsWith(from)) {
      const rel = to.slice(from.length);
      return rel.startsWith("/") ? rel.slice(1) : rel;
    }
    return to;
  }

  // ============================================
  // Repository Operations
  // ============================================

  normalizeRepositoryPath(_inputPath: string): string {
    // In GitHub context, the repo is the root
    return "/";
  }

  findProjectRoot(_inputPath: string): string {
    return "/";
  }

  getRepositoryName(_repositoryPath: string): string {
    return `${this.owner}/${this.repo}`;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
    this.dirCache.clear();
    this.existsCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { files: number; directories: number; exists: number } {
    return {
      files: this.cache.size,
      directories: this.dirCache.size,
      exists: this.existsCache.size,
    };
  }

  /**
   * Get the repository identifier
   */
  getRepositoryId(): string {
    return `${this.owner}/${this.repo}`;
  }

  /**
   * Check if write operations are available
   */
  canWrite(): boolean {
    return !!this.token;
  }
}
