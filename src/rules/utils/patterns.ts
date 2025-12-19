import { GlobAdapter } from "../../pure-core/abstractions/glob";
import { AlexandriaConfig } from "../../config/types";

/**
 * Utility helper for rules to determine if a path matches any provided patterns.
 * Delegates to the GlobAdapter when available so individual environments control glob semantics.
 */
export function matchesPatterns(
  globAdapter: GlobAdapter | undefined,
  patterns: string[] | undefined,
  candidate: string,
): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  if (globAdapter?.matchesPath) {
    return globAdapter.matchesPath(patterns, candidate);
  }

  return patterns.includes(candidate);
}

/**
 * Extract exclude patterns from an Alexandria configuration.
 * Returns an empty array if no patterns are defined.
 */
export function getExcludePatterns(
  config: AlexandriaConfig | null | undefined,
): string[] {
  return config?.context?.patterns?.exclude ?? [];
}

/**
 * Filter a list of file paths by exclude patterns.
 * Uses the GlobAdapter for pattern matching when available.
 *
 * @param globAdapter - Optional glob adapter for pattern matching
 * @param files - Array of file paths to filter
 * @param excludePatterns - Patterns to exclude
 * @returns Files that do not match any exclude pattern
 */
export function filterByExcludePatterns(
  globAdapter: GlobAdapter | undefined,
  files: string[],
  excludePatterns: string[],
): string[] {
  if (excludePatterns.length === 0) {
    return files;
  }

  return files.filter(
    (file) => !matchesPatterns(globAdapter, excludePatterns, file),
  );
}
