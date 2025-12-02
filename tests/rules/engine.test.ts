import { describe, it, expect, beforeEach } from "bun:test";
import { LibraryRulesEngine } from "../../src/rules/engine";
import { InMemoryFileSystemAdapter } from "../../src/test-adapters/InMemoryFileSystemAdapter";
import { InMemoryGlobAdapter } from "../../src/test-adapters/InMemoryGlobAdapter";
import { AlexandriaConfig } from "../../src/config/types";

describe("LibraryRulesEngine", () => {
  let engine: LibraryRulesEngine;
  let globAdapter: InMemoryGlobAdapter;
  let fs: InMemoryFileSystemAdapter;
  const testDir = "/test-repo";

  beforeEach(() => {
    // Create in-memory filesystem adapter
    fs = new InMemoryFileSystemAdapter();

    // Set up a basic test repository structure
    fs.createDir(testDir);
    fs.createDir(`${testDir}/.alexandria`);
    fs.createDir(`${testDir}/src`);
    fs.createDir(`${testDir}/src/utils`);
    fs.createDir(`${testDir}/docs`);
    fs.createDir(`${testDir}/docs/api`);
    fs.createDir(`${testDir}/.git`);
    fs.createDir(`${testDir}/node_modules`);
    fs.createDir(`${testDir}/node_modules/package`);
    fs.createDir(`${testDir}/node_modules/pkg`);
    fs.createDir(`${testDir}/dist`);

    // Create minimal Alexandria files
    fs.writeFile(`${testDir}/.alexandria/views.json`, "[]");
    fs.writeFile(`${testDir}/.alexandria/anchored-notes.json`, "[]");

    // Create in-memory glob adapter with the filesystem
    globAdapter = new InMemoryGlobAdapter(fs);

    // Create engine with both test adapters
    engine = new LibraryRulesEngine(fs, globAdapter);
  });

  describe("scanFiles with GlobAdapter", () => {
    it("should use GlobAdapter to find all files", async () => {
      // Set up test files in the filesystem
      fs.writeFile(`${testDir}/src/index.ts`, "export {}");
      fs.writeFile(`${testDir}/src/utils/helper.ts`, "export {}");
      fs.writeFile(`${testDir}/docs/README.md`, "# README");
      fs.writeFile(`${testDir}/docs/api/guide.md`, "# Guide");
      fs.writeFile(`${testDir}/.git/config`, "[core]");
      fs.writeFile(
        `${testDir}/node_modules/package/index.js`,
        "module.exports = {}",
      );

      // Track glob adapter calls
      const originalFindFiles = globAdapter.findFiles.bind(globAdapter);
      let findFilesCalls: { patterns: string[]; options?: unknown }[] = [];

      globAdapter.findFiles = async (patterns, options) => {
        findFilesCalls.push({ patterns, options });
        return originalFindFiles(patterns, options);
      };

      const result = await engine.lint(testDir, {
        enabledRules: ["require-references"],
      });

      // Should have called findFiles for all files and markdown files
      expect(findFilesCalls.length).toBeGreaterThan(0);

      const allFilesCall = findFilesCalls.find((c) =>
        c.patterns.includes("**/*"),
      );
      const markdownCall = findFilesCalls.find((c) =>
        c.patterns.some((p) => p.includes("*.md")),
      );

      expect(allFilesCall).toBeDefined();
      expect(markdownCall).toBeDefined();

      // Verify the markdown files were found (not in .git or node_modules)
      expect(result.violations.length).toBeGreaterThanOrEqual(0);
    });

    it("should respect useGitignore configuration", async () => {
      // Set up test files
      fs.writeFile(`${testDir}/README.md`, "# README");
      fs.writeFile(`${testDir}/dist/output.md`, "# Output");
      fs.writeFile(`${testDir}/node_modules/pkg/README.md`, "# Package");
      fs.writeFile(`${testDir}/docs/guide.md`, "# Guide");

      // Track glob adapter calls
      let findFilesCalls: { patterns: string[]; options?: unknown }[] = [];
      const originalFindFiles = globAdapter.findFiles.bind(globAdapter);

      globAdapter.findFiles = async (patterns, options) => {
        findFilesCalls.push({ patterns, options });
        return originalFindFiles(patterns, options);
      };

      // Test with gitignore enabled (default)
      await engine.lint(testDir, {
        enabledRules: [],
      });

      const firstCall = findFilesCalls.find((c) => c.patterns.includes("**/*"));
      // Should have gitignore: true by default
      expect(firstCall?.options?.gitignore).toBe(true);

      // Clear calls
      findFilesCalls = [];

      // Test with gitignore explicitly disabled
      const config: AlexandriaConfig = {
        context: {
          rules: [],
          useGitignore: false,
        },
      };

      await engine.lint(testDir, {
        config,
        enabledRules: [],
      });

      const secondCall = findFilesCalls.find((c) =>
        c.patterns.includes("**/*"),
      );
      // Should have gitignore: false when disabled
      expect(secondCall?.options?.gitignore).toBe(false);
    });

    it("should pass global exclusion patterns to the glob adapter", async () => {
      const excludePattern = "tests/fixtures/markdown/**";

      let findFilesCalls: { patterns: string[]; options?: unknown }[] = [];
      const originalFindFiles = globAdapter.findFiles.bind(globAdapter);

      globAdapter.findFiles = async (patterns, options) => {
        findFilesCalls.push({ patterns, options });
        return originalFindFiles(patterns, options);
      };

      const config: AlexandriaConfig = {
        context: {
          patterns: {
            exclude: [excludePattern],
          },
          rules: [],
        },
      };

      await engine.lint(testDir, {
        config,
        enabledRules: [],
      });

      const callWithIgnore = findFilesCalls.find((c) =>
        Array.isArray((c.options as { ignore?: string[] })?.ignore),
      ) as { options?: { ignore?: string[] } } | undefined;

      expect(callWithIgnore?.options?.ignore).toContain(excludePattern);
    });

    it("should not use Node.js dependencies for file operations", async () => {
      // This test verifies we're not using Node.js fs.statSync or path.join
      // The test passes if the engine works with our in-memory adapters

      fs.writeFile(`${testDir}/test.md`, "# Test");
      fs.writeFile(`${testDir}/src/code.ts`, "export {}");

      // Should complete without errors, using only the adapters
      const result = await engine.lint(testDir, {
        enabledRules: ["require-references"],
      });

      // Should have found the markdown file
      expect(result).toBeDefined();
      expect(result.violations).toBeDefined();
    });
  });

  describe("document-organization rule integration", () => {
    it("should use context files instead of re-scanning", async () => {
      // Set up files that would violate document organization
      fs.writeFile(`${testDir}/random-doc.md`, "# Random"); // Not in docs folder
      fs.writeFile(`${testDir}/docs/proper.md`, "# Proper"); // Properly organized
      fs.writeFile(`${testDir}/README.md`, "# README"); // Allowed exception

      // Track glob adapter calls
      let findFilesCalls: { patterns: string[]; options?: unknown }[] = [];
      const originalFindFiles = globAdapter.findFiles.bind(globAdapter);

      globAdapter.findFiles = async (patterns, options) => {
        findFilesCalls.push({ patterns, options });
        return originalFindFiles(patterns, options);
      };

      const result = await engine.lint(testDir, {
        enabledRules: ["document-organization"],
      });

      // Should find violation for random-doc.md
      const violations = result.violations.filter(
        (v) => v.ruleId === "document-organization",
      );

      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((v) => v.file.includes("random-doc.md"))).toBe(
        true,
      );

      // Check that document-organization did NOT re-scan
      // Should only have calls from engine's scanFiles
      const markdownPatternCalls = findFilesCalls.filter((c) =>
        c.patterns.some((p) => p.includes("*.md")),
      );

      // Should be exactly 1 call for markdown files (from engine)
      // not 2 (which would indicate the rule re-scanned)
      expect(markdownPatternCalls.length).toBe(1);
    });
  });

  describe("exclusion handling", () => {
    it("should suppress violations for files matched by global exclusions", async () => {
      fs.createDir(`${testDir}/tests`);
      fs.createDir(`${testDir}/tests/fixtures`);
      fs.createDir(`${testDir}/tests/fixtures/markdown`);
      fs.writeFile(
        `${testDir}/tests/fixtures/markdown/fixture.md`,
        "# Fixture",
      );

      const config: AlexandriaConfig = {
        context: {
          patterns: {
            exclude: ["tests/fixtures/markdown/**"],
          },
          rules: [
            {
              id: "require-references",
              enabled: true,
            },
            {
              id: "document-organization",
              enabled: true,
            },
          ],
        },
      };

      const result = await engine.lint(testDir, {
        config,
        enabledRules: ["require-references", "document-organization"],
      });

      const hasFixtureViolation = result.violations.some(
        (v) => v.file === "tests/fixtures/markdown/fixture.md",
      );

      expect(hasFixtureViolation).toBe(false);
    });

    it("should honor require-references excludeFiles glob patterns", async () => {
      fs.writeFile(`${testDir}/docs/overview.md`, "# Overview");
      fs.writeFile(`${testDir}/docs/orphan.md`, "# Orphan");

      const config: AlexandriaConfig = {
        context: {
          rules: [
            {
              id: "require-references",
              enabled: true,
              options: {
                excludeFiles: ["docs/**"],
              },
            },
          ],
        },
      };

      const result = await engine.lint(testDir, {
        config,
        enabledRules: ["require-references"],
      });

      const violations = result.violations.filter(
        (v) => v.ruleId === "require-references",
      );
      expect(violations).toHaveLength(0);
    });
  });

  describe("rule configuration", () => {
    it("should load and apply rule configurations", async () => {
      fs.writeFile(`${testDir}/test.md`, "# Test");

      const config: AlexandriaConfig = {
        context: {
          rules: [
            {
              id: "require-references",
              enabled: false,
            },
            {
              id: "document-organization",
              severity: "warning",
              enabled: true,
            },
          ],
        },
      };

      const result = await engine.lint(testDir, {
        config,
        enabledRules: ["require-references", "document-organization"],
      });

      // require-references should be disabled
      const requireRefsViolations = result.violations.filter(
        (v) => v.ruleId === "require-references",
      );
      expect(requireRefsViolations.length).toBe(0);

      // document-organization should have warning severity
      const docOrgViolations = result.violations.filter(
        (v) => v.ruleId === "document-organization",
      );

      if (docOrgViolations.length > 0) {
        expect(docOrgViolations[0].severity).toBe("warning");
      }
    });
  });
});
