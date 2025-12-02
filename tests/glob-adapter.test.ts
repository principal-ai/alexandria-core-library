import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { NodeGlobAdapter } from "../src/node-adapters/NodeGlobAdapter";
import { InMemoryGlobAdapter } from "../src/test-adapters/InMemoryGlobAdapter";
import { InMemoryFileSystemAdapter } from "../src/test-adapters/InMemoryFileSystemAdapter";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";

describe("GlobAdapter Implementations", () => {
  describe("InMemoryGlobAdapter", () => {
    let fsAdapter: InMemoryFileSystemAdapter;
    let globAdapter: InMemoryGlobAdapter;

    beforeEach(() => {
      fsAdapter = new InMemoryFileSystemAdapter();
      globAdapter = new InMemoryGlobAdapter(fsAdapter);

      // Set up a test file structure
      fsAdapter.writeFile("/project/README.md", "# Project");
      fsAdapter.writeFile("/project/docs/guide.md", "# Guide");
      fsAdapter.writeFile("/project/docs/api.md", "# API");
      fsAdapter.writeFile("/project/src/index.ts", "export {}");
      fsAdapter.writeFile("/project/.hidden/secret.md", "# Secret");
      fsAdapter.writeFile("/project/test.txt", "test");
    });

    it("should find markdown files with glob pattern", async () => {
      const files = await globAdapter.findFiles(["**/*.md"], {
        cwd: "/project",
        onlyFiles: true,
      });

      // Should return relative paths from cwd
      expect(files).toContain("README.md");
      expect(files).toContain("docs/guide.md");
      expect(files).toContain("docs/api.md");
      expect(files).not.toContain("src/index.ts");
      expect(files).not.toContain("test.txt");
    });

    it("should respect dot option for hidden files", async () => {
      const withoutDot = await globAdapter.findFiles(["**/*.md"], {
        cwd: "/project",
        dot: false,
      });

      const withDot = await globAdapter.findFiles(["**/*.md"], {
        cwd: "/project",
        dot: true,
      });

      expect(withoutDot).not.toContain(".hidden/secret.md");
      expect(withDot).toContain(".hidden/secret.md");
    });

    it("should handle multiple patterns", async () => {
      const files = await globAdapter.findFiles(["**/*.md", "**/*.ts"], {
        cwd: "/project",
        onlyFiles: true,
      });

      expect(files).toContain("README.md");
      expect(files).toContain("src/index.ts");
    });

    it("should respect ignore patterns", async () => {
      const files = await globAdapter.findFiles(["**/*.md"], {
        cwd: "/project",
        ignore: ["**/api.md"],
      });

      expect(files).toContain("README.md");
      expect(files).toContain("docs/guide.md");
      expect(files).not.toContain("docs/api.md");
    });

    it("should match paths using glob patterns", () => {
      expect(globAdapter.matchesPath?.(["docs/**"], "docs/guide.md")).toBe(
        true,
      );
      expect(globAdapter.matchesPath?.(["docs/**"], "src/index.ts")).toBe(
        false,
      );
      expect(globAdapter.matchesPath?.(["**/*.md"], "docs/api.md")).toBe(true);
    });
  });

  describe("NodeGlobAdapter", () => {
    let testDir: string;
    let globAdapter: NodeGlobAdapter;

    beforeEach(() => {
      // Create a temporary test directory
      testDir = path.join(tmpdir(), `glob-test-${Date.now()}`);
      fs.mkdirSync(testDir, { recursive: true });
      fs.mkdirSync(path.join(testDir, "docs"), { recursive: true });
      fs.mkdirSync(path.join(testDir, "src"), { recursive: true });

      // Create test files
      fs.writeFileSync(path.join(testDir, "README.md"), "# Test");
      fs.writeFileSync(path.join(testDir, "docs", "guide.md"), "# Guide");
      fs.writeFileSync(path.join(testDir, "src", "index.ts"), "export {}");

      globAdapter = new NodeGlobAdapter();
    });

    it("should find files using globby", async () => {
      const files = await globAdapter.findFiles(["**/*.md"], {
        cwd: testDir,
        onlyFiles: true,
      });

      expect(files).toContain("README.md");
      expect(files).toContain("docs/guide.md");
      expect(files).not.toContain("src/index.ts");
    });

    it("should work with sync method", () => {
      const files = globAdapter.findFilesSync(["**/*.md"], {
        cwd: testDir,
        onlyFiles: true,
      });

      expect(files).toContain("README.md");
      expect(files).toContain("docs/guide.md");
    });

    it("should match paths using glob patterns", () => {
      expect(globAdapter.matchesPath?.(["docs/**"], "docs/guide.md")).toBe(
        true,
      );
      expect(globAdapter.matchesPath?.(["docs/**"], "src/index.ts")).toBe(
        false,
      );
      expect(globAdapter.matchesPath?.(["**/*.md"], "docs/guide.md")).toBe(
        true,
      );
    });

    // Clean up
    afterEach(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe("GlobAdapter in Rules Engine", () => {
    it("should be injectable into rules engine", () => {
      const { LibraryRulesEngine } = require("../src/rules/engine");
      const customGlobAdapter = new InMemoryGlobAdapter(
        new InMemoryFileSystemAdapter(),
      );

      // Should be able to create engine with custom glob adapter
      const engine = new LibraryRulesEngine(customGlobAdapter);
      expect(engine).toBeDefined();
    });
  });
});
