import {
  LibraryRule,
  LibraryRuleContext,
  LibraryRuleViolation,
  LibraryLintResult,
  LibraryRuleSet,
  FileInfo,
} from "./types";
import { requireReferences } from "./implementations/require-references";
import { orphanedReferences } from "./implementations/orphaned-references";
import { staleReferences } from "./implementations/stale-references";
import { documentOrganization } from "./implementations/document-organization";
import { filenameConvention } from "./implementations/filename-convention";
import { codebaseCoverage } from "./implementations/codebase-coverage";
import { minimumReferences } from "./implementations/minimum-references";
import { AlexandriaConfig, RuleSeverity } from "../config/types";
import { ConfigLoader } from "../config/loader";
import { ValidatedRepositoryPath } from "../pure-core/types";
import { MemoryPalace } from "../MemoryPalace";
import { GlobAdapter } from "../pure-core/abstractions/glob";
import { FileSystemAdapter } from "../pure-core/abstractions/filesystem";

export class LibraryRulesEngine {
  private rules: Map<string, LibraryRule> = new Map();
  private configLoader: ConfigLoader;
  private fsAdapter: FileSystemAdapter;
  private globAdapter: GlobAdapter;

  constructor(fsAdapter: FileSystemAdapter, globAdapter: GlobAdapter) {
    // Require both adapters - no defaults
    this.fsAdapter = fsAdapter;
    this.configLoader = new ConfigLoader(this.fsAdapter);
    this.globAdapter = globAdapter;

    // Register built-in rules
    this.registerRule(requireReferences);
    this.registerRule(orphanedReferences);
    this.registerRule(staleReferences);
    this.registerRule(documentOrganization);
    this.registerRule(filenameConvention);
    this.registerRule(codebaseCoverage);
    this.registerRule(minimumReferences);
  }

  registerRule(rule: LibraryRule): void {
    this.rules.set(rule.id, rule);
  }

  getAllRules(): Map<string, LibraryRule> {
    return this.rules;
  }

  private async scanFiles(
    projectRoot: ValidatedRepositoryPath,
    useGitignore: boolean = true,
    excludePatterns: string[] = [],
  ): Promise<{ files: FileInfo[]; markdownFiles: FileInfo[] }> {
    const files: FileInfo[] = [];
    const markdownFiles: FileInfo[] = [];

    try {
      // Get all files using glob adapter (respecting gitignore if enabled)
      const allFilePaths = await this.globAdapter.findFiles(["**/*"], {
        cwd: projectRoot,
        gitignore: useGitignore,
        dot: false,
        onlyFiles: true,
        ignore: excludePatterns,
      });

      // Get markdown files specifically
      const markdownFilePaths = await this.globAdapter.findFiles(
        ["**/*.md", "**/*.mdx"],
        {
          cwd: projectRoot,
          gitignore: useGitignore,
          dot: false,
          onlyFiles: true,
          ignore: excludePatterns,
        },
      );

      // Create a set of markdown paths for quick lookup
      const markdownPathSet = new Set(markdownFilePaths);

      // Convert all file paths to FileInfo objects
      for (const relativePath of allFilePaths) {
        const fileInfo: FileInfo = {
          path: `${projectRoot}/${relativePath}`, // Simple concatenation, no path.join needed
          relativePath,
          exists: true,
          isMarkdown: markdownPathSet.has(relativePath),
        };
        files.push(fileInfo);
      }

      // Create FileInfo objects for markdown files
      for (const relativePath of markdownFilePaths) {
        const fileInfo: FileInfo = {
          path: `${projectRoot}/${relativePath}`,
          relativePath,
          exists: true,
          isMarkdown: true,
        };
        markdownFiles.push(fileInfo);
      }
    } catch (error) {
      console.error(`Error scanning files in ${projectRoot}:`, error);
      // Return empty arrays if scanning fails
    }

    return { files, markdownFiles };
  }

  async lint(
    projectRoot?: string,
    options: {
      config?: AlexandriaConfig;
      enabledRules?: string[];
      disabledRules?: string[];
      fix?: boolean;
    } = {},
  ): Promise<LibraryLintResult> {
    // Use the injected filesystem adapter
    const validatedPath = MemoryPalace.validateRepositoryPath(
      this.fsAdapter,
      projectRoot || process.cwd(),
    );
    const memoryPalace = new MemoryPalace(validatedPath, this.fsAdapter);

    // Load configuration
    const config = options.config || this.configLoader.loadConfig();

    // Determine if we should use gitignore (default to true)
    const useGitignore = config?.context?.useGitignore !== false;

    // Scan files
    const excludePatterns = config?.context?.patterns?.exclude ?? [];

    const { files, markdownFiles } = await this.scanFiles(
      validatedPath,
      useGitignore,
      excludePatterns,
    );

    // Load views and notes using MemoryPalace public API
    const views = memoryPalace.listViews();
    const notes = memoryPalace.getNotes();

    // Build rule context
    const context: LibraryRuleContext = {
      projectRoot: validatedPath,
      views,
      notes,
      files,
      markdownFiles,
      config: config || undefined,
      globAdapter: this.globAdapter,
      fsAdapter: this.fsAdapter,
    };

    // Build a map of rule configuration overrides from config
    const ruleOverrides = new Map<
      string,
      { severity?: RuleSeverity; enabled?: boolean }
    >();
    if (config?.context?.rules) {
      for (const ruleConfig of config.context.rules) {
        ruleOverrides.set(ruleConfig.id, {
          severity: ruleConfig.severity,
          enabled: ruleConfig.enabled,
        });
      }
    }

    // Run enabled rules
    const violations: LibraryRuleViolation[] = [];
    for (const [ruleId, rule] of this.rules) {
      // Skip disabled rules
      if (options.disabledRules?.includes(ruleId)) {
        continue;
      }

      // Check if rule is enabled (with config override)
      const override = ruleOverrides.get(ruleId);
      const isEnabled = override?.enabled ?? rule.enabled;

      // Only run enabled rules (or all if no specific list provided)
      if (!options.enabledRules || options.enabledRules.includes(ruleId)) {
        if (isEnabled) {
          const ruleViolations = await rule.check(context);

          // Apply severity override from config
          if (override?.severity) {
            for (const violation of ruleViolations) {
              violation.severity = override.severity;
            }
          }

          violations.push(...ruleViolations);
        }
      }
    }

    // Count violations by severity
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    let fixableCount = 0;

    for (const violation of violations) {
      switch (violation.severity) {
        case "error":
          errorCount++;
          break;
        case "warning":
          warningCount++;
          break;
        case "info":
          infoCount++;
          break;
      }
      if (violation.fixable) {
        fixableCount++;
      }
    }

    // Apply fixes if requested
    if (options.fix && fixableCount > 0) {
      // TODO: Implement fix application
      console.log(`Would fix ${fixableCount} violations (not yet implemented)`);
    }

    return {
      violations,
      errorCount,
      warningCount,
      infoCount,
      fixableCount,
    };
  }

  getRuleSet(): LibraryRuleSet {
    return {
      rules: Array.from(this.rules.values()),
      enabledRules: Array.from(this.rules.keys()).filter(
        (id) => this.rules.get(id)?.enabled,
      ),
    };
  }
}
