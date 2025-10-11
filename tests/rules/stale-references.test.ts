import { describe, it, expect, beforeEach } from "vitest";
import { staleReferences } from "../../src/rules/implementations/stale-references";
import { LibraryRuleContext, FileInfo } from "../../src/rules/types";
import {
  ValidatedRepositoryPath,
  CodebaseView,
} from "../../src/pure-core/types";
import { InMemoryFileSystemAdapter } from "../test-adapters/InMemoryFileSystemAdapter";

describe("stale-references rule", () => {
  let mockContext: LibraryRuleContext;
  let fsAdapter: InMemoryFileSystemAdapter;

  const createFileInfo = (
    relativePath: string,
    lastModified: Date,
  ): FileInfo => ({
    path: `/test/project/${relativePath}`,
    relativePath,
    exists: true,
    lastModified,
    size: 100,
    isMarkdown: relativePath.endsWith(".md"),
  });

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

  describe("view staleness detection", () => {
    it("should not report violations when overview is newer than referenced files", async () => {
      const overviewTime = new Date("2024-01-15T12:00:00Z");
      const fileTime = new Date("2024-01-10T12:00:00Z");

      mockContext.files = [
        createFileInfo("docs/overview.md", overviewTime),
        createFileInfo("src/index.ts", fileTime),
      ];

      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/overview.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/index.ts"],
            },
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should report violations when referenced file is newer than overview", async () => {
      const overviewTime = new Date("2024-01-10T12:00:00Z");
      const fileTime = new Date("2024-01-15T12:00:00Z");

      mockContext.files = [
        createFileInfo("docs/overview.md", overviewTime),
        createFileInfo("src/index.ts", fileTime),
      ];

      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/overview.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/index.ts"],
            },
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/overview.md");
      expect(violations[0].message).toContain("src/index.ts");
      expect(violations[0].message).toContain("changed");
    });

    it("should track the newest file modification across multiple files", async () => {
      const overviewTime = new Date("2024-01-10T12:00:00Z");
      const oldFileTime = new Date("2024-01-05T12:00:00Z");
      const newestFileTime = new Date("2024-01-20T12:00:00Z");

      mockContext.files = [
        createFileInfo("docs/overview.md", overviewTime),
        createFileInfo("src/old.ts", oldFileTime),
        createFileInfo("src/newest.ts", newestFileTime),
      ];

      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/overview.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/old.ts", "src/newest.ts"],
            },
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain("src/newest.ts");
    });

    it("should ignore differences less than 5 seconds", async () => {
      const overviewTime = new Date("2024-01-10T12:00:00Z");
      const fileTime = new Date("2024-01-10T12:00:03Z"); // 3 seconds later

      mockContext.files = [
        createFileInfo("docs/overview.md", overviewTime),
        createFileInfo("src/index.ts", fileTime),
      ];

      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/overview.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/index.ts"],
            },
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should handle views without overview paths", async () => {
      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/index.ts"],
            },
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should handle views with missing modification times", async () => {
      mockContext.files = [
        createFileInfo("src/index.ts", new Date("2024-01-10T12:00:00Z")),
      ];

      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/missing-overview.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/index.ts"],
            },
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("note staleness detection", () => {
    it("should not report violations when note is newer than anchored files", async () => {
      const noteTime = new Date("2024-01-15T12:00:00Z");
      const fileTime = new Date("2024-01-10T12:00:00Z");

      mockContext.files = [
        createFileInfo(".alexandria/notes/note1.json", noteTime),
        createFileInfo("src/index.ts", fileTime),
      ];

      mockContext.notes = [
        {
          path: ".alexandria/notes/note1.json",
          note: {
            id: "note1",
            note: "Test note",
            anchors: ["src/index.ts"],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should report violations when anchored file is newer than note", async () => {
      const noteTime = new Date("2024-01-10T12:00:00Z");
      const fileTime = new Date("2024-01-15T12:00:00Z");

      mockContext.files = [
        createFileInfo(".alexandria/notes/note1.json", noteTime),
        createFileInfo("src/index.ts", fileTime),
      ];

      mockContext.notes = [
        {
          path: ".alexandria/notes/note1.json",
          note: {
            id: "note1",
            note: "Test note",
            anchors: ["src/index.ts"],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("notes/note1.json");
      expect(violations[0].message).toContain("note1");
      expect(violations[0].message).toContain("src/index.ts");
    });

    it("should handle notes without anchors", async () => {
      mockContext.notes = [
        {
          path: ".alexandria/notes/note1.json",
          note: {
            id: "note1",
            note: "Test note",
            anchors: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should track newest anchor across multiple anchors", async () => {
      const noteTime = new Date("2024-01-10T12:00:00Z");
      const oldFileTime = new Date("2024-01-05T12:00:00Z");
      const newestFileTime = new Date("2024-01-20T12:00:00Z");

      mockContext.files = [
        createFileInfo(".alexandria/notes/note1.json", noteTime),
        createFileInfo("src/old.ts", oldFileTime),
        createFileInfo("src/newest.ts", newestFileTime),
      ];

      mockContext.notes = [
        {
          path: ".alexandria/notes/note1.json",
          note: {
            id: "note1",
            note: "Test note",
            anchors: ["src/old.ts", "src/newest.ts"],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain("src/newest.ts");
    });
  });

  describe("time message formatting", () => {
    it("should format message for minutes", async () => {
      const overviewTime = new Date("2024-01-10T12:00:00Z");
      const fileTime = new Date("2024-01-10T12:30:00Z"); // 30 minutes later

      mockContext.files = [
        createFileInfo("docs/overview.md", overviewTime),
        createFileInfo("src/index.ts", fileTime),
      ];

      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/overview.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/index.ts"],
            },
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain("30 minutes after");
    });

    it("should format message for hours", async () => {
      const overviewTime = new Date("2024-01-10T12:00:00Z");
      const fileTime = new Date("2024-01-10T18:00:00Z"); // 6 hours later

      mockContext.files = [
        createFileInfo("docs/overview.md", overviewTime),
        createFileInfo("src/index.ts", fileTime),
      ];

      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/overview.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/index.ts"],
            },
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain("6 hours");
    });

    it("should format message for days", async () => {
      const overviewTime = new Date("2024-01-10T12:00:00Z");
      const fileTime = new Date("2024-01-15T12:00:00Z"); // 5 days later

      mockContext.files = [
        createFileInfo("docs/overview.md", overviewTime),
        createFileInfo("src/index.ts", fileTime),
      ];

      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/overview.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/index.ts"],
            },
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain("5 days");
    });
  });

  describe("combined scenarios", () => {
    it("should check both views and notes", async () => {
      const oldTime = new Date("2024-01-10T12:00:00Z");
      const newTime = new Date("2024-01-15T12:00:00Z");

      mockContext.files = [
        createFileInfo("docs/overview.md", oldTime),
        createFileInfo(".alexandria/notes/note1.json", oldTime),
        createFileInfo("src/index.ts", newTime),
        createFileInfo("src/utils.ts", newTime),
      ];

      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/overview.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/index.ts"],
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
            anchors: ["src/utils.ts"],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(2);
      expect(violations.some((v) => v.file === "docs/overview.md")).toBe(true);
      expect(violations.some((v) => v.file === "notes/note1.json")).toBe(true);
    });
  });

  describe("severity and metadata", () => {
    it("should report violations with correct severity", async () => {
      const overviewTime = new Date("2024-01-10T12:00:00Z");
      const fileTime = new Date("2024-01-15T12:00:00Z");

      mockContext.files = [
        createFileInfo("docs/overview.md", overviewTime),
        createFileInfo("src/index.ts", fileTime),
      ];

      mockContext.views = [
        {
          id: "view1",
          name: "view1",
          title: "View 1",
          description: "Test view",
          overviewPath: "docs/overview.md",
          referenceGroups: {
            primary: {
              label: "Primary",
              description: "Primary files",
              files: ["src/index.ts"],
            },
          },
        },
      ];

      const violations = await staleReferences.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].severity).toBe("warning");
      expect(violations[0].ruleId).toBe("stale-references");
      expect(violations[0].fixable).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should throw error when fsAdapter is not provided", async () => {
      const contextWithoutFs = {
        ...mockContext,
        fsAdapter: undefined,
      };

      await expect(staleReferences.check(contextWithoutFs)).rejects.toThrow(
        "stale-references rule requires fsAdapter in context",
      );
    });
  });
});
