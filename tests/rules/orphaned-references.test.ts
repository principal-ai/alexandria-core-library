import { describe, it, expect, beforeEach } from "vitest";
import { orphanedReferences } from "../../src/rules/implementations/orphaned-references";
import { LibraryRuleContext } from "../../src/rules/types";
import {
  ValidatedRepositoryPath,
  CodebaseView,
} from "../../src/pure-core/types";
import { InMemoryFileSystemAdapter } from "../test-adapters/InMemoryFileSystemAdapter";

describe("orphaned-references rule", () => {
  let mockContext: LibraryRuleContext;
  let fsAdapter: InMemoryFileSystemAdapter;

  beforeEach(() => {
    fsAdapter = new InMemoryFileSystemAdapter();

    mockContext = {
      projectRoot: "/test/project" as ValidatedRepositoryPath,
      views: [],
      notes: [],
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
            } as any,
          },
        },
      ];

      const violations = await orphanedReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("note anchors", () => {
    it("should not report violations when all anchor files exist", async () => {
      fsAdapter.writeFile("/test/project/src/index.ts", "export {}");
      fsAdapter.writeFile("/test/project/src/utils.ts", "export {}");

      mockContext.notes = [
        {
          path: ".alexandria/notes/note1.json",
          note: {
            id: "note1",
            note: "Test note",
            anchors: ["src/index.ts", "src/utils.ts"],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ];

      const violations = await orphanedReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should report violations for non-existent anchor files", async () => {
      fsAdapter.writeFile("/test/project/src/index.ts", "export {}");

      mockContext.notes = [
        {
          path: ".alexandria/notes/note1.json",
          note: {
            id: "note1",
            note: "Test note",
            anchors: ["src/index.ts", "src/missing.ts"],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ];

      const violations = await orphanedReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain("src/missing.ts");
      expect(violations[0].message).toContain("non-existent file");
      expect(violations[0].file).toBe("notes/note1.json");
    });

    it("should check multiple notes", async () => {
      mockContext.notes = [
        {
          path: ".alexandria/notes/note1.json",
          note: {
            id: "note1",
            note: "Test note 1",
            anchors: ["src/missing1.ts"],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        {
          path: ".alexandria/notes/note2.json",
          note: {
            id: "note2",
            note: "Test note 2",
            anchors: ["src/missing2.ts"],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ];

      const violations = await orphanedReferences.check(mockContext);
      expect(violations).toHaveLength(2);
      expect(violations[0].message).toContain("note1");
      expect(violations[1].message).toContain("note2");
    });
  });

  describe("combined scenarios", () => {
    it("should check both views and notes", async () => {
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
              files: ["src/view-missing.ts"],
            },
          },
        },
      ];

      mockContext.notes = [
        {
          path: ".alexandria/notes/note1.json",
          note: {
            id: "note1",
            note: "Test note",
            anchors: ["src/note-missing.ts"],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ];

      const violations = await orphanedReferences.check(mockContext);
      expect(violations).toHaveLength(2);
      expect(
        violations.some((v) => v.message.includes("view-missing.ts")),
      ).toBe(true);
      expect(
        violations.some((v) => v.message.includes("note-missing.ts")),
      ).toBe(true);
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
