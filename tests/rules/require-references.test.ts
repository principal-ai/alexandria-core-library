import { describe, it, expect, beforeEach } from "vitest";
import { requireReferences } from "../../src/rules/implementations/require-references";
import { LibraryRuleContext, FileInfo } from "../../src/rules/types";
import { RequireReferencesOptions } from "../../src/config/types";
import {
  ValidatedRepositoryPath,
  CodebaseView,
} from "../../src/pure-core/types";
import {
  GlobAdapter,
  GlobOptions,
} from "../../src/pure-core/abstractions/glob";

describe("require-references rule", () => {
  let mockContext: LibraryRuleContext;

  const createFileInfo = (relativePath: string): FileInfo => ({
    path: `/test/project/${relativePath}`,
    relativePath,
    exists: true,
    lastModified: new Date(),
    size: 100,
    isMarkdown: relativePath.endsWith(".md"),
  });

  const createView = (id: string, overviewPath: string): CodebaseView => ({
    id,
    title: `View ${id}`,
    description: "Test view",
    overviewPath,
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

  describe("basic functionality", () => {
    it("should not report violations when all markdown files are used as overviews", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/api-guide.md"),
        createFileInfo("docs/tutorial.md"),
      ];

      mockContext.views = [
        createView("view1", "docs/api-guide.md"),
        createView("view2", "docs/tutorial.md"),
      ];

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should report violations for markdown files not used as overviews", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/api-guide.md"),
        createFileInfo("docs/tutorial.md"),
        createFileInfo("docs/orphaned.md"),
      ];

      mockContext.views = [
        createView("view1", "docs/api-guide.md"),
        createView("view2", "docs/tutorial.md"),
      ];

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/orphaned.md");
      expect(violations[0].message).toContain("not used as an overview");
    });

    it("should report multiple violations for multiple unreferenced files", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/file1.md"),
        createFileInfo("docs/file2.md"),
        createFileInfo("docs/file3.md"),
      ];

      mockContext.views = [createView("view1", "docs/file1.md")];

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(2);
      expect(violations.map((v) => v.file)).toContain("docs/file2.md");
      expect(violations.map((v) => v.file)).toContain("docs/file3.md");
    });
  });

  describe("Alexandria directory exclusion", () => {
    it("should skip files in .alexandria directory", async () => {
      mockContext.markdownFiles = [
        createFileInfo(".alexandria/internal.md"),
        createFileInfo(".alexandria/config.md"),
        createFileInfo("docs/api.md"),
      ];

      mockContext.views = [createView("view1", "docs/api.md")];

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should skip files in nested .alexandria directories", async () => {
      mockContext.markdownFiles = [
        createFileInfo(".alexandria/docs/internal.md"),
        createFileInfo("docs/api.md"),
      ];

      mockContext.views = [createView("view1", "docs/api.md")];

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("global exclude patterns", () => {
    it("should respect global exclude patterns", async () => {
      mockContext.markdownFiles = [
        createFileInfo("vendor/external.md"),
        createFileInfo("legacy/old-doc.md"),
        createFileInfo("docs/api.md"),
      ];

      mockContext.views = [createView("view1", "docs/api.md")];

      mockContext.config = {
        version: "1.0.0",
        context: {
          patterns: {
            exclude: ["vendor/**", "legacy/**"],
          },
        },
      };

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("excludeFiles option", () => {
    it("should exclude files matching excludeFiles patterns", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/api.md"),
        createFileInfo("docs/internal-notes.md"),
        createFileInfo("docs/temp-draft.md"),
      ];

      mockContext.views = [createView("view1", "docs/api.md")];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "require-references",
              options: {
                excludeFiles: ["**/internal-*.md", "**/temp-*.md"],
              } as RequireReferencesOptions,
            },
          ],
        },
      };

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should report violations for files not matching exclusion patterns", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/api.md"),
        createFileInfo("docs/internal-notes.md"),
        createFileInfo("docs/orphaned.md"),
      ];

      mockContext.views = [createView("view1", "docs/api.md")];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "require-references",
              options: {
                excludeFiles: ["**/internal-*.md"],
              } as RequireReferencesOptions,
            },
          ],
        },
      };

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/orphaned.md");
    });
  });

  describe("combined exclusions", () => {
    it("should apply both global and rule-specific exclusions", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/api.md"),
        createFileInfo("vendor/external.md"), // excluded by global pattern
        createFileInfo("docs/internal.md"), // excluded by rule pattern
        createFileInfo(".alexandria/config.md"), // excluded by Alexandria check
        createFileInfo("docs/orphaned.md"), // not excluded, should violate
      ];

      mockContext.views = [createView("view1", "docs/api.md")];

      mockContext.config = {
        version: "1.0.0",
        context: {
          patterns: {
            exclude: ["vendor/**"],
          },
          rules: [
            {
              id: "require-references",
              options: {
                excludeFiles: ["**/internal.md"],
              } as RequireReferencesOptions,
            },
          ],
        },
      };

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/orphaned.md");
    });
  });

  describe("views without overviews", () => {
    it("should handle views without overview paths", async () => {
      mockContext.markdownFiles = [createFileInfo("docs/orphaned.md")];

      mockContext.views = [
        {
          id: "view1",
          title: "View 1",
          description: "Test view without overview",
        },
      ];

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/orphaned.md");
    });

    it("should handle views with non-markdown overview paths", async () => {
      mockContext.markdownFiles = [createFileInfo("docs/orphaned.md")];

      mockContext.views = [
        {
          id: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/overview.txt",
        } as CodebaseView,
      ];

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/orphaned.md");
    });
  });

  describe("empty scenarios", () => {
    it("should handle no markdown files", async () => {
      mockContext.markdownFiles = [];
      mockContext.views = [];

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should handle no views", async () => {
      mockContext.markdownFiles = [createFileInfo("docs/orphaned.md")];
      mockContext.views = [];

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/orphaned.md");
    });
  });

  describe("file reuse", () => {
    it("should allow a file to be used as overview in multiple views", async () => {
      mockContext.markdownFiles = [createFileInfo("docs/shared.md")];

      mockContext.views = [
        createView("view1", "docs/shared.md"),
        createView("view2", "docs/shared.md"),
      ];

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("severity and metadata", () => {
    it("should report violations with correct severity", async () => {
      mockContext.markdownFiles = [createFileInfo("docs/orphaned.md")];
      mockContext.views = [];

      const violations = await requireReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].severity).toBe("error");
      expect(violations[0].ruleId).toBe("require-references");
      expect(violations[0].fixable).toBe(false);
    });
  });
});
