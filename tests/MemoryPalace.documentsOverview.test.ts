import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryPalace } from "../src/MemoryPalace";
import { InMemoryFileSystemAdapter } from "../src/test-adapters/InMemoryFileSystemAdapter";
import { InMemoryGlobAdapter } from "../src/test-adapters/InMemoryGlobAdapter";
import type { CodebaseView } from "../src/pure-core/types";

describe("MemoryPalace - getDocumentsOverview", () => {
  let fs: InMemoryFileSystemAdapter;
  let globAdapter: InMemoryGlobAdapter;
  let palace: MemoryPalace;
  const repoPath = "/test/repo";

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    fs.createDir("/test");
    fs.createDir(repoPath);
    fs.createDir(`${repoPath}/.git`);
    fs.createDir(`${repoPath}/docs`);
    fs.createDir(`${repoPath}/src`);

    globAdapter = new InMemoryGlobAdapter(fs);
    palace = new MemoryPalace(repoPath, fs);
  });

  test("should return empty array when no markdown files exist", async () => {
    const docs = await palace.getDocumentsOverview(globAdapter);
    expect(docs).toEqual([]);
  });

  test("should find untracked markdown files", async () => {
    // Create some markdown files
    fs.writeFile(`${repoPath}/README.md`, "# README");
    fs.writeFile(`${repoPath}/docs/guide.md`, "# Guide");

    const docs = await palace.getDocumentsOverview(globAdapter);

    expect(docs).toHaveLength(2);
    expect(docs.map((d) => d.relativePath).sort()).toEqual([
      "README.md",
      "docs/guide.md",
    ]);

    // All should be untracked
    expect(docs.every((d) => d.isTracked === false)).toBe(true);
    expect(docs.every((d) => d.viewId === undefined)).toBe(true);
  });

  test("should identify tracked documents with their views", async () => {
    // Create markdown files
    fs.writeFile(`${repoPath}/docs/api-overview.md`, "# API Overview");
    fs.writeFile(`${repoPath}/docs/other.md`, "# Other Doc");

    // Create a view that tracks the api-overview.md
    const view: CodebaseView = {
      id: "api-view",
      version: "1.0.0",
      name: "API Documentation",
      description: "API docs",
      overviewPath: "docs/api-overview.md",
      category: "documentation",
      displayOrder: 0,
      referenceGroups: {
        endpoints: {
          coordinates: [0, 0],
          files: ["src/api/routes.ts", "src/api/handlers.ts"],
        },
      },
    };
    palace.saveView(view);

    const docs = await palace.getDocumentsOverview(globAdapter);

    expect(docs).toHaveLength(2);

    // Find the tracked doc
    const trackedDoc = docs.find((d) => d.relativePath === "docs/api-overview.md");
    expect(trackedDoc).toBeTruthy();
    expect(trackedDoc!.isTracked).toBe(true);
    expect(trackedDoc!.viewId).toBe("api-view");
    expect(trackedDoc!.viewName).toBe("API Documentation");
    expect(trackedDoc!.associatedFiles).toEqual([
      "src/api/routes.ts",
      "src/api/handlers.ts",
    ]);

    // Find the untracked doc
    const untrackedDoc = docs.find((d) => d.relativePath === "docs/other.md");
    expect(untrackedDoc).toBeTruthy();
    expect(untrackedDoc!.isTracked).toBe(false);
    expect(untrackedDoc!.viewId).toBeUndefined();
  });

  test("should filter out untracked docs when includeUntracked is false", async () => {
    // Create markdown files
    fs.writeFile(`${repoPath}/docs/tracked.md`, "# Tracked");
    fs.writeFile(`${repoPath}/docs/untracked.md`, "# Untracked");

    // Create a view for the tracked doc
    const view: CodebaseView = {
      id: "tracked-view",
      version: "1.0.0",
      name: "Tracked Doc",
      description: "A tracked doc",
      overviewPath: "docs/tracked.md",
      category: "documentation",
      displayOrder: 0,
      referenceGroups: {},
    };
    palace.saveView(view);

    const docs = await palace.getDocumentsOverview(globAdapter, {
      includeUntracked: false,
    });

    expect(docs).toHaveLength(1);
    expect(docs[0].relativePath).toBe("docs/tracked.md");
    expect(docs[0].isTracked).toBe(true);
  });

  test("should exclude files matching custom patterns", async () => {
    fs.createDir(`${repoPath}/vendor`);
    fs.writeFile(`${repoPath}/README.md`, "# README");
    fs.writeFile(`${repoPath}/vendor/third-party.md`, "# Third Party");

    const docs = await palace.getDocumentsOverview(globAdapter, {
      excludePatterns: ["**/vendor/**"],
    });

    expect(docs).toHaveLength(1);
    expect(docs[0].relativePath).toBe("README.md");
  });

  test("should exclude .alexandria and .palace-work by default", async () => {
    fs.createDir(`${repoPath}/.palace-work`);
    fs.writeFile(`${repoPath}/README.md`, "# README");
    fs.writeFile(`${repoPath}/.palace-work/draft.md`, "# Draft");
    fs.writeFile(`${repoPath}/.alexandria/internal.md`, "# Internal");

    const docs = await palace.getDocumentsOverview(globAdapter);

    expect(docs).toHaveLength(1);
    expect(docs[0].relativePath).toBe("README.md");
  });

  test("should extract title from filename", async () => {
    fs.writeFile(`${repoPath}/getting-started.md`, "# Getting Started");
    fs.writeFile(`${repoPath}/api_reference.md`, "# API Reference");
    fs.writeFile(`${repoPath}/README.md`, "# README");

    const docs = await palace.getDocumentsOverview(globAdapter);

    const titles = docs.map((d) => ({ relativePath: d.relativePath, title: d.title }));
    expect(titles).toContainEqual({
      relativePath: "README.md",
      title: "README",
    });
    expect(titles).toContainEqual({
      relativePath: "getting-started.md",
      title: "Getting Started",
    });
    expect(titles).toContainEqual({
      relativePath: "api_reference.md",
      title: "Api Reference",
    });
  });

  test("should handle views with ./ prefix in overviewPath", async () => {
    fs.writeFile(`${repoPath}/docs/overview.md`, "# Overview");

    // Create a view with ./ prefix
    const view: CodebaseView = {
      id: "test-view",
      version: "1.0.0",
      name: "Test View",
      description: "Test",
      overviewPath: "./docs/overview.md",
      category: "test",
      displayOrder: 0,
      referenceGroups: {},
    };
    palace.saveView(view);

    const docs = await palace.getDocumentsOverview(globAdapter);

    expect(docs).toHaveLength(1);
    expect(docs[0].isTracked).toBe(true);
    expect(docs[0].viewId).toBe("test-view");
  });

  test("should deduplicate associated files from multiple reference groups", async () => {
    fs.writeFile(`${repoPath}/docs/feature.md`, "# Feature");

    const view: CodebaseView = {
      id: "feature-view",
      version: "1.0.0",
      name: "Feature",
      description: "Feature doc",
      overviewPath: "docs/feature.md",
      category: "feature",
      displayOrder: 0,
      referenceGroups: {
        main: {
          coordinates: [0, 0],
          files: ["src/main.ts", "src/utils.ts"],
        },
        tests: {
          coordinates: [0, 1],
          files: ["src/utils.ts", "src/main.test.ts"], // utils.ts is duplicated
        },
      },
    };
    palace.saveView(view);

    const docs = await palace.getDocumentsOverview(globAdapter);

    expect(docs).toHaveLength(1);
    // Should deduplicate src/utils.ts
    expect(docs[0].associatedFiles).toHaveLength(3);
    expect(docs[0].associatedFiles).toContain("src/main.ts");
    expect(docs[0].associatedFiles).toContain("src/utils.ts");
    expect(docs[0].associatedFiles).toContain("src/main.test.ts");
  });

  test("should sort results by relativePath", async () => {
    fs.writeFile(`${repoPath}/z-last.md`, "# Last");
    fs.writeFile(`${repoPath}/a-first.md`, "# First");
    fs.writeFile(`${repoPath}/docs/middle.md`, "# Middle");

    const docs = await palace.getDocumentsOverview(globAdapter);

    expect(docs.map((d) => d.relativePath)).toEqual([
      "a-first.md",
      "docs/middle.md",
      "z-last.md",
    ]);
  });

  test("should include .mdx files", async () => {
    fs.writeFile(`${repoPath}/component.mdx`, "# Component");
    fs.writeFile(`${repoPath}/guide.md`, "# Guide");

    const docs = await palace.getDocumentsOverview(globAdapter);

    expect(docs).toHaveLength(2);
    expect(docs.map((d) => d.relativePath).sort()).toEqual([
      "component.mdx",
      "guide.md",
    ]);
  });
});
