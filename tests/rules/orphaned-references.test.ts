import { describe, it, expect, beforeEach } from "vitest";
import { orphanedReferences } from "../../src/rules/implementations/orphaned-references";
import { LibraryRuleContext } from "../../src/rules/types";
import { ValidatedRepositoryPath } from "../../src/pure-core/types";
import { InMemoryFileSystemAdapter } from "../../src/test-adapters/InMemoryFileSystemAdapter";

describe("orphaned-references rule", () => {
  let mockContext: LibraryRuleContext;
  let fsAdapter: InMemoryFileSystemAdapter;

  beforeEach(() => {
    fsAdapter = new InMemoryFileSystemAdapter();

    mockContext = {
      projectRoot: "/test/project" as ValidatedRepositoryPath,
      views: [],
      files: [],
      markdownFiles: [],
      fsAdapter,
    };
  });

  describe("view reference groups", () => {
    it("should not report violations when all referenced files exist", async () => {
      // Create the files that are referenced
      fsAdapter.writeFile("/test/project/src/index.ts", "export {}");
      fsAdapter.writeFile("/test/project/src/utils.ts", "export {}");

      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/view1.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/index.ts", "src/utils.ts"],
            },
          },
        },
      ];

      const violations = await orphanedReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should report violations for non-existent files in reference groups", async () => {
      // Only create one of the two files
      fsAdapter.writeFile("/test/project/src/index.ts", "export {}");

      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/view1.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/index.ts", "src/missing.ts"],
            },
          },
        },
      ];

      const violations = await orphanedReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain("src/missing.ts");
      expect(violations[0].message).toContain("non-existent file");
      expect(violations[0].file).toBe("views/view1.json");
    });

    it("should report multiple violations for multiple missing files", async () => {
      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/view1.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/missing1.ts", "src/missing2.ts"],
            },
          },
        },
      ];

      const violations = await orphanedReferences.check(mockContext);
      expect(violations).toHaveLength(2);
      expect(violations[0].message).toContain("src/missing1.ts");
      expect(violations[1].message).toContain("src/missing2.ts");
    });

    it("should check multiple reference groups in a single view", async () => {
      fsAdapter.writeFile("/test/project/src/index.ts", "export {}");

      mockContext.views = [
        {
          id: "view1",
          name: "view1",
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
              files: ["src/missing.ts"],
            },
          },
        },
      ];

      const violations = await orphanedReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain("secondary");
      expect(violations[0].message).toContain("src/missing.ts");
    });

    it("should handle views without reference groups", async () => {
      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/view1.md",
        },
      ];

      const violations = await orphanedReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should handle reference groups without files property", async () => {
      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/view1.md",
          referenceGroups: {
            links: {
              label: "Links",
              description: "External links",
              links: ["https://example.com"],
            },
          },
        },
      ];

      const violations = await orphanedReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("severity and metadata", () => {
    it("should report violations with correct severity", async () => {
      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/view1.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/missing.ts"],
            },
          },
        },
      ];

      const violations = await orphanedReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].severity).toBe("error");
      expect(violations[0].ruleId).toBe("orphaned-references");
      expect(violations[0].fixable).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should throw error when fsAdapter is not provided", async () => {
      const contextWithoutFs = {
        ...mockContext,
        fsAdapter: undefined,
      };

      await expect(orphanedReferences.check(contextWithoutFs)).rejects.toThrow(
        "orphaned-references rule requires fsAdapter in context",
      );
    });
  });
});
