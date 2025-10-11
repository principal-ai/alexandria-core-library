import {
  LibraryRule,
  LibraryRuleViolation,
  LibraryRuleContext,
} from "../types";
import { CodebaseCoverageOptions } from "../../config/types";
import { matchesPatterns } from "../utils/patterns";

export const codebaseCoverage: LibraryRule = {
  id: "codebase-coverage",
  name: "Codebase Coverage",
  severity: "warning",
  category: "quality",
  description:
    "Ensures a minimum percentage of code files are covered by CodebaseViews",
  impact:
    "Low coverage means AI agents lack context for understanding large portions of the codebase",
  fixable: false,
  enabled: true,
  options: {
    minimumCoverage: 70,
    includePatterns: ["**/*.ts", "**/*.js", "**/*.tsx", "**/*.jsx"],
    excludePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/node_modules/**"],
    reportByDirectory: false,
    minimumDirectoryCoverage: 50,
  },

  async check(context: LibraryRuleContext): Promise<LibraryRuleViolation[]> {
    const violations: LibraryRuleViolation[] = [];
    const { files, views, config, globAdapter } = context;

    // Get options from config
    const ruleConfig = config?.context?.rules?.find(
      (r) => r.id === "codebase-coverage",
    );
    const options = {
      ...this.options,
      ...(ruleConfig?.options as CodebaseCoverageOptions | undefined),
    } as Required<CodebaseCoverageOptions>;

    // Build set of files covered by views
    const coveredFiles = new Set<string>();
    for (const view of views) {
      if (view.referenceGroups) {
        for (const groupName in view.referenceGroups) {
          const group = view.referenceGroups[groupName];
          if ("files" in group && Array.isArray(group.files)) {
            for (const file of group.files) {
              coveredFiles.add(file);
            }
          }
        }
      }
    }

    // Filter files based on include/exclude patterns
    const relevantFiles = files.filter((file) => {
      const relativePath = file.relativePath;

      // Check include patterns - file must match at least one include pattern
      const included = matchesPatterns(
        globAdapter,
        options.includePatterns,
        relativePath,
      );

      if (!included) return false;

      // Check exclude patterns - file must not match any exclude pattern
      const excluded = matchesPatterns(
        globAdapter,
        options.excludePatterns,
        relativePath,
      );

      return !excluded;
    });

    // Calculate overall coverage
    const totalFiles = relevantFiles.length;
    const coveredCount = relevantFiles.filter((f) =>
      coveredFiles.has(f.relativePath),
    ).length;
    const coveragePercent =
      totalFiles > 0 ? Math.round((coveredCount / totalFiles) * 100) : 100;

    // Check overall coverage
    if (coveragePercent < options.minimumCoverage) {
      violations.push({
        ruleId: this.id,
        severity: this.severity,
        message: `Codebase coverage is ${coveragePercent}% (${coveredCount}/${totalFiles} files), below minimum of ${options.minimumCoverage}%`,
        impact: this.impact,
        fixable: false,
      });
    }

    // Directory-level coverage if requested
    if (options.reportByDirectory) {
      const dirCoverage = new Map<string, { total: number; covered: number }>();

      for (const file of relevantFiles) {
        const dir =
          file.relativePath.split("/").slice(0, -1).join("/") || ".";
        const stats = dirCoverage.get(dir) || { total: 0, covered: 0 };
        stats.total++;
        if (coveredFiles.has(file.relativePath)) {
          stats.covered++;
        }
        dirCoverage.set(dir, stats);
      }

      // Check each directory
      for (const [dir, stats] of dirCoverage) {
        const dirPercent = Math.round((stats.covered / stats.total) * 100);
        if (dirPercent < options.minimumDirectoryCoverage) {
          violations.push({
            ruleId: this.id,
            severity: this.severity,
            file: dir,
            message: `Directory "${dir}" coverage is ${dirPercent}% (${stats.covered}/${stats.total} files), below minimum of ${options.minimumDirectoryCoverage}%`,
            impact: this.impact,
            fixable: false,
          });
        }
      }
    }

    return violations;
  },
};
