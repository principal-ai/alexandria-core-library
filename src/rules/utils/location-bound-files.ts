/**
 * Location-Bound Files - Files that must remain in specific locations
 *
 * These files serve structural/conventional purposes and should NOT be
 * suggested for centralization into a docs/ folder. They are "location-bound"
 * because their location IS their meaning.
 *
 * This module provides a single source of truth for both:
 * - document-organization rule (knows not to suggest moving these)
 * - filename-convention rule (knows these are naming exceptions)
 */

/**
 * Constraint types for location-bound files:
 * - 'root': Must be in repository root
 * - 'root-or-package': Must be in root OR next to a package.json
 * - 'same-directory': Must stay where it is (README.md describes its folder)
 * - 'any': Can be anywhere (no location constraint, but still naming-exempt)
 */
export type LocationConstraint =
  | "root"
  | "root-or-package"
  | "same-directory"
  | "any";

export interface LocationBoundFile {
  /** The filename pattern (matched case-insensitively) */
  pattern: string;
  /** Where this file must be located */
  constraint: LocationConstraint;
  /** Human-readable explanation of why this file is location-bound */
  reason: string;
  /** Whether this file should be exempt from filename convention rules */
  exemptFromNaming: boolean;
}

/**
 * The canonical list of location-bound files.
 * These files should never be suggested for centralization.
 */
export const LOCATION_BOUND_FILES: LocationBoundFile[] = [
  // README files - describe their containing directory
  {
    pattern: "README.md",
    constraint: "same-directory",
    reason: "README files describe their containing directory and must stay with it",
    exemptFromNaming: true,
  },
  {
    pattern: "README",
    constraint: "same-directory",
    reason: "README files describe their containing directory and must stay with it",
    exemptFromNaming: true,
  },
  {
    pattern: "README.txt",
    constraint: "same-directory",
    reason: "README files describe their containing directory and must stay with it",
    exemptFromNaming: true,
  },

  // AI assistant configuration files
  {
    pattern: "AGENTS.md",
    constraint: "root",
    reason: "AGENTS.md provides AI assistant guidance and must be at repository root",
    exemptFromNaming: true,
  },
  {
    pattern: "CLAUDE.md",
    constraint: "root",
    reason: "CLAUDE.md provides Claude Code configuration and must be at repository root",
    exemptFromNaming: true,
  },

  // GitHub/GitLab convention files
  {
    pattern: "CONTRIBUTING.md",
    constraint: "root",
    reason: "CONTRIBUTING.md is a GitHub/GitLab convention for repository root",
    exemptFromNaming: true,
  },
  {
    pattern: "CODE_OF_CONDUCT.md",
    constraint: "root",
    reason: "CODE_OF_CONDUCT.md is a GitHub convention for repository root",
    exemptFromNaming: true,
  },
  {
    pattern: "SECURITY.md",
    constraint: "root",
    reason: "SECURITY.md is a GitHub convention for security policy at repository root",
    exemptFromNaming: true,
  },

  // Version/release tracking
  {
    pattern: "CHANGELOG.md",
    constraint: "root-or-package",
    reason: "CHANGELOG.md tracks version history at repository or package level",
    exemptFromNaming: true,
  },
  {
    pattern: "HISTORY.md",
    constraint: "root-or-package",
    reason: "HISTORY.md tracks version history at repository or package level",
    exemptFromNaming: true,
  },
  {
    pattern: "RELEASES.md",
    constraint: "root-or-package",
    reason: "RELEASES.md tracks releases at repository or package level",
    exemptFromNaming: true,
  },

  // Legal files
  {
    pattern: "LICENSE",
    constraint: "root",
    reason: "LICENSE must be at repository root for legal recognition",
    exemptFromNaming: true,
  },
  {
    pattern: "LICENSE.md",
    constraint: "root",
    reason: "LICENSE must be at repository root for legal recognition",
    exemptFromNaming: true,
  },
  {
    pattern: "LICENSE.txt",
    constraint: "root",
    reason: "LICENSE must be at repository root for legal recognition",
    exemptFromNaming: true,
  },
  {
    pattern: "COPYING",
    constraint: "root",
    reason: "COPYING (GPL convention) must be at repository root",
    exemptFromNaming: true,
  },

  // Attribution files
  {
    pattern: "AUTHORS.md",
    constraint: "root",
    reason: "AUTHORS.md lists project authors and belongs at repository root",
    exemptFromNaming: true,
  },
  {
    pattern: "AUTHORS",
    constraint: "root",
    reason: "AUTHORS lists project authors and belongs at repository root",
    exemptFromNaming: true,
  },
  {
    pattern: "CONTRIBUTORS.md",
    constraint: "root",
    reason: "CONTRIBUTORS.md lists project contributors and belongs at repository root",
    exemptFromNaming: true,
  },
  {
    pattern: "CONTRIBUTORS",
    constraint: "root",
    reason: "CONTRIBUTORS lists project contributors and belongs at repository root",
    exemptFromNaming: true,
  },

  // Setup/installation files
  {
    pattern: "INSTALL.md",
    constraint: "root",
    reason: "INSTALL.md provides installation instructions and belongs at repository root",
    exemptFromNaming: true,
  },
  {
    pattern: "INSTALL",
    constraint: "root",
    reason: "INSTALL provides installation instructions and belongs at repository root",
    exemptFromNaming: true,
  },
  {
    pattern: "SETUP.md",
    constraint: "root",
    reason: "SETUP.md provides setup instructions and belongs at repository root",
    exemptFromNaming: true,
  },
];

/**
 * Check if a filename matches a location-bound pattern (case-insensitive)
 */
export function getLocationBoundInfo(
  filename: string
): LocationBoundFile | undefined {
  // Extract just the filename from a path
  const basename = filename.split("/").pop() || filename;
  return LOCATION_BOUND_FILES.find(
    (lbf) => lbf.pattern.toLowerCase() === basename.toLowerCase()
  );
}

/**
 * Check if a file is location-bound (should not be moved to centralized docs)
 */
export function isLocationBound(filePath: string): boolean {
  return getLocationBoundInfo(filePath) !== undefined;
}

/**
 * Check if a filename matches a location-bound pattern that is exempt from naming rules
 */
export function isNamingExempt(filename: string): boolean {
  const info = getLocationBoundInfo(filename);
  return info?.exemptFromNaming ?? false;
}

/**
 * Get all filename patterns that are exempt from naming conventions.
 * Used by filename-convention rule.
 */
export function getNamingExemptions(): string[] {
  return LOCATION_BOUND_FILES.filter((lbf) => lbf.exemptFromNaming).map(
    (lbf) => lbf.pattern
  );
}

/**
 * Get all filename patterns that can exist at root level.
 * Used by document-organization rule for rootExceptions.
 */
export function getRootExceptions(): string[] {
  return LOCATION_BOUND_FILES.filter(
    (lbf) =>
      lbf.constraint === "root" ||
      lbf.constraint === "root-or-package" ||
      lbf.constraint === "same-directory"
  ).map((lbf) => lbf.pattern);
}

/**
 * Get all filename patterns that should be exempt from "move to docs folder" suggestions.
 * This includes all location-bound files regardless of constraint.
 */
export function getOrganizationExemptions(): string[] {
  return LOCATION_BOUND_FILES.map((lbf) => lbf.pattern);
}

/**
 * Validate if a location-bound file is in a valid location.
 * Returns validation result with explanation if invalid.
 */
export function validateLocationBoundFile(
  relativePath: string,
  packageJsonDirs: string[] = []
): {
  valid: boolean;
  reason?: string;
  suggestion?: string;
} {
  const info = getLocationBoundInfo(relativePath);
  if (!info) {
    return { valid: true }; // Not location-bound, no constraint
  }

  const normalizedPath = relativePath.replace(/\\/g, "/");
  const dirname = normalizedPath.includes("/")
    ? normalizedPath.substring(0, normalizedPath.lastIndexOf("/"))
    : "";

  switch (info.constraint) {
    case "root":
      if (dirname === "") {
        return { valid: true };
      }
      return {
        valid: false,
        reason: info.reason,
        suggestion: `Move to repository root: ${info.pattern}`,
      };

    case "root-or-package": {
      if (dirname === "") {
        return { valid: true };
      }
      // Check if it's in a directory that contains a package.json
      const isInPackageDir = packageJsonDirs.some(
        (pkgDir) => dirname === pkgDir.replace(/\\/g, "/")
      );
      if (isInPackageDir) {
        return { valid: true };
      }
      return {
        valid: false,
        reason: info.reason,
        suggestion: `Move to repository root or next to a package.json`,
      };
    }

    case "same-directory":
      // README.md can be anywhere - it describes its current location
      // The constraint means "don't suggest moving it elsewhere"
      return { valid: true };

    case "any":
      return { valid: true };

    default:
      return { valid: true };
  }
}

/**
 * Filter files into centralizable vs location-bound categories.
 * Useful for bulk operations or reporting.
 */
export function filterLocationBoundFiles(filePaths: string[]): {
  centralizable: string[];
  locationBound: Array<{ path: string; info: LocationBoundFile }>;
} {
  const centralizable: string[] = [];
  const locationBound: Array<{ path: string; info: LocationBoundFile }> = [];

  for (const filePath of filePaths) {
    const info = getLocationBoundInfo(filePath);
    if (info) {
      locationBound.push({ path: filePath, info });
    } else {
      centralizable.push(filePath);
    }
  }

  return { centralizable, locationBound };
}

/**
 * Get a human-readable explanation of why a file is location-bound.
 */
export function getLocationBoundExplanation(
  filePath: string
): string | undefined {
  const info = getLocationBoundInfo(filePath);
  if (!info) return undefined;

  return `${info.pattern} is a location-bound file: ${info.reason}`;
}
