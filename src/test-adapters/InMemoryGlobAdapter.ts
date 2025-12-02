/**
 * In-memory implementation of GlobAdapter for testing
 *
 * This adapter provides pattern matching without external dependencies,
 * using the FileSystemAdapter to traverse the file system.
 */
import { GlobAdapter, GlobOptions } from "../pure-core/abstractions/glob";
import { FileSystemAdapter } from "../pure-core/abstractions/filesystem";

export class InMemoryGlobAdapter implements GlobAdapter {
  constructor(private fs: FileSystemAdapter) {}

  async findFiles(
    patterns: string[],
    options?: GlobOptions,
  ): Promise<string[]> {
    return this.findFilesSync(patterns, options);
  }

  findFilesSync(patterns: string[], options?: GlobOptions): string[] {
    const cwd = options?.cwd || "/";
    const ignore = options?.ignore || [];
    const onlyFiles = options?.onlyFiles !== false;
    const dot = options?.dot || false;

    // Convert patterns to regex
    const patternRegexes = patterns.map((pattern) => this.globToRegex(pattern));
    const ignoreRegexes = ignore.map((pattern) => this.globToRegex(pattern));

    // Recursively find all files
    const allPaths = this.getAllPaths(cwd);

    // Filter based on patterns and options
    const matchedPaths = allPaths.filter((path) => {
      // Get relative path for pattern matching
      const relativePath = this.fs.relative(cwd, path);

      // Check if it matches any ignore pattern
      if (ignoreRegexes.some((regex) => regex.test(relativePath))) {
        return false;
      }

      // Check if it's a file or directory
      if (onlyFiles && this.fs.isDirectory(path)) {
        return false;
      }

      // Check dotfiles
      if (!dot && this.isDotfile(path)) {
        return false;
      }

      // Check if it matches any of the patterns
      return patternRegexes.some((regex) => regex.test(relativePath));
    });

    // Return relative paths like globby does
    return matchedPaths.map((path) => this.fs.relative(cwd, path));
  }

  matchesPath(patterns: string[] | undefined, candidate: string): boolean {
    if (!patterns || patterns.length === 0) {
      return false;
    }

    return patterns.some((pattern) =>
      this.globToRegex(pattern).test(candidate),
    );
  }

  private getAllPaths(dir: string): string[] {
    const paths: string[] = [];

    try {
      const entries = this.fs.readDir(dir);
      for (const entry of entries) {
        const fullPath = this.fs.join(dir, entry);
        paths.push(fullPath);

        if (this.fs.isDirectory(fullPath)) {
          // Recursively get paths from subdirectories
          paths.push(...this.getAllPaths(fullPath));
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return paths;
  }

  private isDotfile(path: string): boolean {
    const segments = path.split("/");
    return segments.some(
      (segment) => segment.startsWith(".") && segment !== ".",
    );
  }

  private globToRegex(pattern: string): RegExp {
    // Simple glob to regex conversion
    let regex = pattern
      // Escape special regex characters except * and ?
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      // Convert ** to match any depth (including zero depth)
      .replace(/\*\*/g, "___DOUBLE_STAR___")
      // Convert * to match anything except /
      .replace(/\*/g, "[^/]*")
      // Convert ? to match single character
      .replace(/\?/g, "[^/]")
      // Restore ** pattern - match any number of path segments including none
      .replace(/___DOUBLE_STAR___\//g, "(.*\\/)?")
      .replace(/\/___DOUBLE_STAR___/g, "(\\/.*)?")
      .replace(/___DOUBLE_STAR___/g, ".*");

    // Handle extensions like *.md or *.{md,mdx}
    regex = regex.replace(/\{([^}]+)\}/g, (match, group) => {
      const options = group.split(",");
      return "(" + options.join("|") + ")";
    });

    return new RegExp("^" + regex + "$");
  }
}
