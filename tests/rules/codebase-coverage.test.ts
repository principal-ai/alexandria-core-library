import { describe, it, expect, beforeEach } from "vitest";
import { codebaseCoverage } from "../../src/rules/implementations/codebase-coverage";
import { LibraryRuleContext, FileInfo } from "../../src/rules/types";
import { CodebaseCoverageOptions } from "../../src/config/types";
import {
  ValidatedRepositoryPath,
  CodebaseView,
} from "../../src/pure-core/types";
import {
  GlobAdapter,
  GlobOptions,
} from "../../src/pure-core/abstractions/glob";

describe("codebase-coverage rule", () => {
  let mockContext: LibraryRuleContext;

  const createFileInfo = (relativePath: string): FileInfo => ({
    path: `/test/project/${relativePath}`,
    relativePath,
    exists: true,
    lastModified: new Date(),
    size: 100,
    isMarkdown: false,
  });

  const createView = (id: string, files: string[] = []): CodebaseView => ({
    id,
    title: `View ${id}`,
    description: "Test view",
    overviewPath: `docs/${id}.md`,
    referenceGroups: {
      primary: {
        label: "Primary",
        description: "Primary files",
        files,
      },
    },
  });

  const createStubGlobAdapter = (): GlobAdapter => {
    return {
      async findFiles(_patterns: string[], _options?: GlobOptions) {
        return [];
      },
      matchesPath(patterns, candidate) {
        if (!patterns || patterns.length === 0) {
          return false;
        }

        return patterns.some((pattern) => globToRegex(pattern).test(candidate));
      },
    };
  };

  const globToRegex = (pattern: string): RegExp => {
    let regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "___DOUBLE_STAR___")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/___DOUBLE_STAR___\//g, "(.*\\/)?")
      .replace(/\/___DOUBLE_STAR___/g, "(\\/.*)?")
      .replace(/___DOUBLE_STAR___/g, ".*");

    regex = regex.replace(/\{([^}]+)\}/g, (_match, group) => {
      const options = group.split(",");
      return "(" + options.join("|") + ")";
    });

    return new RegExp("^" + regex + "$");
  };

  beforeEach(() => {
    mockContext = {
      projectRoot: "/test/project" as ValidatedRepositoryPath,
      views: [],
      notes: [],
      files: [],
      markdownFiles: [],
      globAdapter: createStubGlobAdapter(),
    };
  });

  describe("basic coverage calculation", () => {
    it("should report no violations when coverage meets minimum", async () => {
      mockContext.files = [
        createFileInfo("src/index.ts"),
        createFileInfo("src/utils.ts"),
        createFileInfo("src/config.ts"),
      ];

      mockContext.views = [
        createView("view1", ["src/index.ts", "src/utils.ts", "src/config.ts"]),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "codebase-coverage",
              options: {
                minimumCoverage: 70,
              } as CodebaseCoverageOptions,
            },
          ],
        },
      };

      const violations = await codebaseCoverage.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should report violation when coverage is below minimum", async () => {
      mockContext.files = [
        createFileInfo("src/index.ts"),
        createFileInfo("src/utils.ts"),
        createFileInfo("src/config.ts"),
        createFileInfo("src/helpers.ts"),
        createFileInfo("src/types.ts"),
      ];

      mockContext.views = [
        createView("view1", ["src/index.ts"]), // Only 1 out of 5 files = 20%
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "codebase-coverage",
              options: {
                minimumCoverage: 70,
              } as CodebaseCoverageOptions,
            },
          ],
        },
      };

      const violations = await codebaseCoverage.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain("20%");
      expect(violations[0].message).toContain("1/5 files");
      expect(violations[0].message).toContain("below minimum of 70%");
    });
  });

  describe("include/exclude patterns", () => {
    it("should respect include patterns", async () => {
      mockContext.files = [
        createFileInfo("src/index.ts"),
        createFileInfo("src/utils.ts"),
        createFileInfo("src/config.json"),
        createFileInfo("src/data.yaml"),
      ];

      mockContext.views = [
        createView("view1", ["src/index.ts"]), // 1 out of 2 TypeScript files = 50%
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "codebase-coverage",
              options: {
                minimumCoverage: 70,
                includePatterns: ["**/*.ts"], // Only TypeScript files
              } as CodebaseCoverageOptions,
            },
          ],
        },
      };

      const violations = await codebaseCoverage.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain("50%");
      expect(violations[0].message).toContain("1/2 files");
    });

    it("should respect exclude patterns", async () => {
      mockContext.files = [
        createFileInfo("src/index.ts"),
        createFileInfo("src/utils.ts"),
        createFileInfo("src/index.test.ts"),
        createFileInfo("src/utils.test.ts"),
      ];

      mockContext.views = [
        createView("view1", ["src/index.ts", "src/utils.ts"]), // 2 out of 2 non-test files = 100%
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "codebase-coverage",
              options: {
                minimumCoverage: 70,
                includePatterns: ["**/*.ts"],
                excludePatterns: ["**/*.test.ts"], // Exclude test files
              } as CodebaseCoverageOptions,
            },
          ],
        },
      };

      const violations = await codebaseCoverage.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should exclude node_modules by default", async () => {
      mockContext.files = [
        createFileInfo("src/index.ts"),
        createFileInfo("node_modules/package/index.ts"),
      ];

      mockContext.views = [
        createView("view1", ["src/index.ts"]), // 1 out of 1 non-node_modules file = 100%
      ];

      const violations = await codebaseCoverage.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("directory-level coverage", () => {
    it("should not report directory violations when reportByDirectory is false", async () => {
      mockContext.files = [
        createFileInfo("src/index.ts"),
        createFileInfo("src/utils.ts"),
        createFileInfo("lib/helper.ts"),
      ];

      mockContext.views = [
        createView("view1", ["src/index.ts"]), // src has 50% coverage, lib has 0%
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "codebase-coverage",
              options: {
                minimumCoverage: 30,
                reportByDirectory: false,
              } as CodebaseCoverageOptions,
            },
          ],
        },
      };

      const violations = await codebaseCoverage.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should report directory violations when reportByDirectory is true", async () => {
      mockContext.files = [
        createFileInfo("src/index.ts"),
        createFileInfo("src/utils.ts"),
        createFileInfo("lib/helper.ts"),
        createFileInfo("lib/config.ts"),
      ];

      mockContext.views = [
        createView("view1", ["src/index.ts"]), // src: 50%, lib: 0%
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "codebase-coverage",
              options: {
                minimumCoverage: 30,
                reportByDirectory: true,
                minimumDirectoryCoverage: 60,
              } as CodebaseCoverageOptions,
            },
          ],
        },
      };

      const violations = await codebaseCoverage.check(mockContext);
      expect(violations.length).toBeGreaterThan(0);

      const dirViolations = violations.filter((v) =>
        v.message.includes("Directory"),
      );
      expect(dirViolations.length).toBeGreaterThan(0);
      expect(dirViolations.some((v) => v.message.includes('"src"'))).toBe(true);
      expect(dirViolations.some((v) => v.message.includes('"lib"'))).toBe(true);
    });

    it("should not report directory violations when coverage meets minimum", async () => {
      mockContext.files = [
        createFileInfo("src/index.ts"),
        createFileInfo("src/utils.ts"),
        createFileInfo("src/config.ts"),
      ];

      mockContext.views = [
        createView("view1", ["src/index.ts", "src/utils.ts", "src/config.ts"]), // src: 100%
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "codebase-coverage",
              options: {
                minimumCoverage: 70,
                reportByDirectory: true,
                minimumDirectoryCoverage: 60,
              } as CodebaseCoverageOptions,
            },
          ],
        },
      };

      const violations = await codebaseCoverage.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("files in multiple views", () => {
    it("should count files referenced in any view as covered", async () => {
      mockContext.files = [
        createFileInfo("src/index.ts"),
        createFileInfo("src/utils.ts"),
        createFileInfo("src/config.ts"),
      ];

      mockContext.views = [
        createView("view1", ["src/index.ts"]),
        createView("view2", ["src/utils.ts", "src/config.ts"]),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "codebase-coverage",
              options: {
                minimumCoverage: 70,
              } as CodebaseCoverageOptions,
            },
          ],
        },
      };

      const violations = await codebaseCoverage.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("empty codebase", () => {
    it("should report 100% coverage for empty codebase", async () => {
      mockContext.files = [];
      mockContext.views = [];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "codebase-coverage",
              options: {
                minimumCoverage: 70,
              } as CodebaseCoverageOptions,
            },
          ],
        },
      };

      const violations = await codebaseCoverage.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("reference groups", () => {
    it("should handle views with multiple reference groups", async () => {
      mockContext.files = [
        createFileInfo("src/index.ts"),
        createFileInfo("src/utils.ts"),
        createFileInfo("src/config.ts"),
      ];

      mockContext.views = [
        {
          id: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/view1.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/index.ts"],
            },
            secondary: {
              label: "Secondary",
              description: "Secondary files",
              files: ["src/utils.ts", "src/config.ts"],
            },
          },
        },
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "codebase-coverage",
              options: {
                minimumCoverage: 70,
              } as CodebaseCoverageOptions,
            },
          ],
        },
      };

      const violations = await codebaseCoverage.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should handle views without reference groups", async () => {
      mockContext.files = [
        createFileInfo("src/index.ts"),
        createFileInfo("src/utils.ts"),
      ];

      mockContext.views = [
        {
          id: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/view1.md",
        },
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "codebase-coverage",
              options: {
                minimumCoverage: 70,
              } as CodebaseCoverageOptions,
            },
          ],
        },
      };

      const violations = await codebaseCoverage.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain("0%");
      expect(violations[0].message).toContain("0/2 files");
    });
  });
});
