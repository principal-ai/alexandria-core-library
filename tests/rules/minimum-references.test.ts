import { describe, it, expect, beforeEach } from "vitest";
import { minimumReferences } from "../../src/rules/implementations/minimum-references";
import { LibraryRuleContext } from "../../src/rules/types";
import { MinimumReferencesOptions } from "../../src/config/types";
import {
  ValidatedRepositoryPath,
  CodebaseView,
} from "../../src/pure-core/types";
import {
  GlobAdapter,
  GlobOptions,
} from "../../src/pure-core/abstractions/glob";

describe("minimum-references rule", () => {
  let mockContext: LibraryRuleContext;

  const createView = (
    name: string,
    fileCount: number,
    category?: string,
  ): CodebaseView => {
    const files = Array.from({ length: fileCount }, (_, i) => `src/file${i}.ts`);
    return {
      id: name,
      name,
      title: `View ${name}`,
      description: "Test view",
      overviewPath: `docs/${name}.md`,
      category,
      referenceGroups: {
        implementation: {
          files,
        },
      },
    };
  };

  const createStubGlobAdapter = (): GlobAdapter => {
    return {
      async findFiles(_patterns: string[], _options?: GlobOptions) {
        return [];
      },
      matchesPath(_patterns, _candidate) {
        return false;
      },
    };
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
    it("should not report violations when views meet minimum file count", async () => {
      mockContext.views = [
        createView("view1", 3),
        createView("view2", 5),
        createView("view3", 10),
      ];

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should report violations for views below minimum file count", async () => {
      mockContext.views = [
        createView("view1", 0),
        createView("view2", 3),
        createView("view3", 0),
      ];

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(2);
      expect(violations.map((v) => v.file)).toContain("views/view1.json");
      expect(violations.map((v) => v.file)).toContain("views/view3.json");
    });

    it("should include correct file count in violation message", async () => {
      mockContext.views = [createView("test-view", 0)];

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain(
        'View "test-view" has only 0 file references, below minimum of 1',
      );
    });

    it("should use correct plural form for file count", async () => {
      // With custom minFiles: 3, a view with 2 files should violate
      mockContext.views = [createView("test-view", 2)];
      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "minimum-references",
              severity: "error",
              name: "Minimum References",
              options: {
                minFiles: 3,
              } as MinimumReferencesOptions,
            },
          ],
        },
      };

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain(
        'View "test-view" has only 2 file references, below minimum of 3',
      );
    });
  });

  describe("custom minFiles threshold", () => {
    it("should respect custom minFiles option", async () => {
      mockContext.views = [
        createView("view1", 3),
        createView("view2", 5),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "minimum-references",
              severity: "warning",
              name: "Minimum References",
              options: {
                minFiles: 5,
              } as MinimumReferencesOptions,
            },
          ],
        },
      };

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("views/view1.json");
      expect(violations[0].message).toContain("below minimum of 5");
    });

    it("should work with minFiles of 1", async () => {
      mockContext.views = [
        createView("view1", 0),
        createView("view2", 1),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "minimum-references",
              severity: "warning",
              name: "Minimum References",
              options: {
                minFiles: 1,
              } as MinimumReferencesOptions,
            },
          ],
        },
      };

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("views/view1.json");
    });
  });

  describe("category exclusions", () => {
    it("should exclude views with specified categories", async () => {
      mockContext.views = [
        createView("view1", 0, "planning"),
        createView("view2", 0, "meta"),
        createView("view3", 0, "implementation"),
      ];

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("views/view3.json");
    });

    it("should respect custom excludeCategories option", async () => {
      mockContext.views = [
        createView("view1", 0, "architecture"),
        createView("view2", 0, "implementation"),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "minimum-references",
              severity: "error",
              name: "Minimum References",
              options: {
                excludeCategories: ["architecture"],
              } as MinimumReferencesOptions,
            },
          ],
        },
      };

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("views/view2.json");
    });

    it("should handle views without category", async () => {
      mockContext.views = [
        createView("view1", 0), // no category
        createView("view2", 3),
      ];

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("views/view1.json");
    });
  });

  describe("view name exclusions", () => {
    it("should exclude views by name", async () => {
      mockContext.views = [
        createView("readme-overview", 0),
        createView("getting-started", 0),
        createView("api-implementation", 0),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "minimum-references",
              severity: "warning",
              name: "Minimum References",
              options: {
                excludeViews: ["readme-overview", "getting-started"],
              } as MinimumReferencesOptions,
            },
          ],
        },
      };

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("views/api-implementation.json");
    });
  });

  describe("combined exclusions", () => {
    it("should apply both category and view name exclusions", async () => {
      mockContext.views = [
        createView("view1", 0, "planning"), // excluded by category
        createView("special-view", 0, "implementation"), // excluded by name
        createView("normal-view", 0, "implementation"), // should violate
        createView("good-view", 5, "implementation"), // has enough files
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "minimum-references",
              severity: "warning",
              name: "Minimum References",
              options: {
                excludeCategories: ["planning"],
                excludeViews: ["special-view"],
              } as MinimumReferencesOptions,
            },
          ],
        },
      };

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("views/normal-view.json");
    });
  });

  describe("multiple reference groups", () => {
    it("should count files across all reference groups", async () => {
      const view: CodebaseView = {
        id: "multi-group",
        name: "multi-group",
        title: "Multi Group View",
        description: "View with multiple reference groups",
        overviewPath: "docs/multi.md",
        referenceGroups: {
          implementation: {
            files: ["src/file1.ts", "src/file2.ts"],
          },
          tests: {
            files: ["tests/test1.ts"],
          },
          types: {
            files: ["types/types.ts"],
          },
        },
      };

      mockContext.views = [view];

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(0); // 4 files total >= 3
    });

    it("should handle views with empty reference groups", async () => {
      const view: CodebaseView = {
        id: "empty-group",
        name: "empty-group",
        title: "Empty Group View",
        description: "View with empty groups",
        overviewPath: "docs/empty.md",
        referenceGroups: {
          implementation: {
            files: [],
          },
          tests: {
            files: [],
          },
        },
      };

      mockContext.views = [view];

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(1); // 0 files total < 1
    });
  });

  describe("views without reference groups", () => {
    it("should handle views without referenceGroups", async () => {
      const view: CodebaseView = {
        id: "no-groups",
        name: "no-groups",
        title: "No Groups View",
        description: "View without reference groups",
        overviewPath: "docs/no-groups.md",
      };

      mockContext.views = [view];

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain("has only 0 file references");
    });

    it("should handle views with non-file reference groups", async () => {
      const view: CodebaseView = {
        id: "text-group",
        name: "text-group",
        title: "Text Group View",
        description: "View with text reference groups",
        overviewPath: "docs/text.md",
        referenceGroups: {
          notes: "Some text notes",
        },
      };

      mockContext.views = [view];

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain("has only 0 file references");
    });
  });

  describe("empty scenarios", () => {
    it("should handle no views", async () => {
      mockContext.views = [];

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("severity and metadata", () => {
    it("should report violations with correct severity", async () => {
      mockContext.views = [createView("test", 0)];

      const violations = await minimumReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].severity).toBe("error");
      expect(violations[0].ruleId).toBe("minimum-references");
      expect(violations[0].fixable).toBe(false);
      expect(violations[0].impact).toBeTruthy();
    });
  });
});
