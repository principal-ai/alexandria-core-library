/**
 * GlobAdapter implementation that pattern-matches against a FileTree.
 *
 * This adapter is designed for browser environments where filesystem
 * access is not available. It performs glob matching against the
 * pre-populated FileTree metadata, avoiding recursive directory traversal.
 *
 * The host must provide a `matchesPath` function for glob pattern matching.
 * This allows the host to use whatever glob library is available in their
 * environment (minimatch, picomatch, micromatch, etc.).
 */

import type { FileTree } from "@principal-ai/repository-abstraction";
import type { GlobAdapter, GlobOptions } from "../pure-core/abstractions/glob";

export interface FileTreeGlobAdapterOptions {
  /** The FileTree containing file/directory metadata */
  fileTree: FileTree;
  /** The repository root path */
  repositoryPath: string;
  /**
   * Function to check if a path matches a glob pattern.
   * The host should provide this using their preferred glob library.
   * @param pattern - Glob pattern (e.g., "**\/*.ts")
   * @param path - Path to test (e.g., "src/index.ts")
   * @returns true if the path matches the pattern
   */
  matchesPath: (pattern: string, path: string) => boolean;
}

export class FileTreeGlobAdapter implements GlobAdapter {
  private fileTree: FileTree;
  private repositoryPath: string;
  private matchesPathFn: (pattern: string, path: string) => boolean;

  constructor(options: FileTreeGlobAdapterOptions) {
    this.fileTree = options.fileTree;
    this.repositoryPath = options.repositoryPath;
    this.matchesPathFn = options.matchesPath;
  }

  async findFiles(
    patterns: string[],
    options: GlobOptions = {},
  ): Promise<string[]> {
    return this.findFilesSync(patterns, options);
  }

  findFilesSync(patterns: string[], options: GlobOptions = {}): string[] {
    const { ignore = [], dot = false, onlyFiles = true } = options;

    // Get all paths from FileTree directly - no traversal needed
    let candidates: string[];
    if (onlyFiles) {
      candidates = this.fileTree.allFiles.map((f) => f.relativePath);
    } else {
      candidates = [
        ...this.fileTree.allFiles.map((f) => f.relativePath),
        ...this.fileTree.allDirectories.map((d) => d.relativePath),
      ];
    }

    // Filter based on patterns and options
    const matched = candidates.filter((path) => {
      // Check dotfiles
      if (!dot && this.isDotfile(path)) {
        return false;
      }

      // Check if it matches any ignore pattern
      if (ignore.some((pattern) => this.matchesPathFn(pattern, path))) {
        return false;
      }

      // Check if it matches any of the patterns
      return patterns.some((pattern) => this.matchesPathFn(pattern, path));
    });

    // Sort for consistent output
    return matched.sort();
  }

  matchesPath(patterns: string[] | undefined, candidate: string): boolean {
    if (!patterns || patterns.length === 0) {
      return false;
    }

    return patterns.some((pattern) => this.matchesPathFn(pattern, candidate));
  }

  private isDotfile(path: string): boolean {
    const segments = path.split("/");
    return segments.some(
      (segment) => segment.startsWith(".") && segment !== ".",
    );
  }

  /**
   * Get the underlying FileTree
   */
  getFileTree(): FileTree {
    return this.fileTree;
  }

  /**
   * Get the repository path
   */
  getRepositoryPath(): string {
    return this.repositoryPath;
  }
}
