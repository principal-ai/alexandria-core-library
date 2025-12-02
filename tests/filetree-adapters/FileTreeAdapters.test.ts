import { describe, it, expect } from "bun:test";
import { FileTreeFileSystemAdapter } from "../../src/filetree-adapters/FileTreeFileSystemAdapter";
import { FileTreeGlobAdapter } from "../../src/filetree-adapters/FileTreeGlobAdapter";
import type { FileTree, FileInfo, DirectoryInfo } from "@principal-ai/repository-abstraction";

/**
 * Simple glob pattern matcher for testing.
 * In real usage, the host would provide this using minimatch, picomatch, etc.
 */
function simpleGlobMatch(pattern: string, path: string): boolean {
  // Convert glob pattern to regex
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "___DOUBLE_STAR___")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/___DOUBLE_STAR___\//g, "(.*\\/)?")
    .replace(/\/___DOUBLE_STAR___/g, "(\\/.*)?")
    .replace(/___DOUBLE_STAR___/g, ".*");

  // Handle brace expansion
  regex = regex.replace(/\\\{([^}]+)\\\}/g, (_match, group) => {
    const options = group.split(",");
    return "(" + options.join("|") + ")";
  });

  return new RegExp("^" + regex + "$").test(path);
}

// Helper to create a mock FileTree
function createMockFileTree(files: string[], repositoryPath: string): FileTree {
  const allFiles: FileInfo[] = [];
  const allDirectories: DirectoryInfo[] = [];
  const dirSet = new Set<string>();

  // Create file info objects
  for (const filePath of files) {
    const relativePath = filePath.startsWith(repositoryPath + "/")
      ? filePath.slice(repositoryPath.length + 1)
      : filePath;

    const parts = relativePath.split("/");
    const name = parts[parts.length - 1];

    allFiles.push({
      path: `${repositoryPath}/${relativePath}`,
      relativePath,
      name,
      extension: name.includes(".") ? "." + name.split(".").pop()! : "",
      size: 100,
      modifiedTime: new Date(),
      isSymlink: false,
    } as FileInfo);

    // Track directories
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      dirSet.add(dirPath);
    }
  }

  // Create directory info objects
  for (const dirPath of dirSet) {
    const parts = dirPath.split("/");
    const name = parts[parts.length - 1];

    // Find children
    const children: Array<FileInfo | DirectoryInfo> = [];
    for (const file of allFiles) {
      const fileDirPath = file.relativePath.split("/").slice(0, -1).join("/");
      if (fileDirPath === dirPath) {
        children.push(file);
      }
    }
    for (const otherDir of dirSet) {
      const otherParts = otherDir.split("/");
      if (otherParts.length === parts.length + 1 && otherDir.startsWith(dirPath + "/")) {
        children.push({
          path: `${repositoryPath}/${otherDir}`,
          relativePath: otherDir,
          name: otherParts[otherParts.length - 1],
          children: [],
        } as DirectoryInfo);
      }
    }

    allDirectories.push({
      path: `${repositoryPath}/${dirPath}`,
      relativePath: dirPath,
      name,
      children,
    } as DirectoryInfo);
  }

  // Create root directory
  const rootChildren: Array<FileInfo | DirectoryInfo> = [];
  for (const file of allFiles) {
    if (!file.relativePath.includes("/")) {
      rootChildren.push(file);
    }
  }
  for (const dir of allDirectories) {
    if (!dir.relativePath.includes("/")) {
      rootChildren.push(dir);
    }
  }

  const root: DirectoryInfo = {
    path: repositoryPath,
    relativePath: "",
    name: repositoryPath.split("/").pop()!,
    children: rootChildren,
  } as DirectoryInfo;

  return {
    root,
    allFiles,
    allDirectories,
    repositoryPath,
  } as FileTree;
}

describe("FileTreeFileSystemAdapter", () => {
  const repositoryPath = "/test-repo";
  const files = [
    "README.md",
    "src/index.ts",
    "src/utils/helpers.ts",
    "docs/guide.md",
    "docs/api/reference.md",
    ".gitignore",
  ];

  const fileContents: Record<string, string> = {
    "README.md": "# Test Repo",
    "src/index.ts": "export {}",
    "src/utils/helpers.ts": "export function helper() {}",
    "docs/guide.md": "# Guide",
    "docs/api/reference.md": "# API Reference",
    ".gitignore": "node_modules/",
  };

  const fileTree = createMockFileTree(files, repositoryPath);
  const readFile = (path: string): string => {
    const relativePath = path.startsWith(repositoryPath + "/")
      ? path.slice(repositoryPath.length + 1)
      : path;
    return fileContents[relativePath] || "";
  };

  const adapter = new FileTreeFileSystemAdapter({
    fileTree,
    repositoryPath,
    readFile,
  });

  describe("exists", () => {
    it("should return true for existing files", () => {
      expect(adapter.exists("README.md")).toBe(true);
      expect(adapter.exists("src/index.ts")).toBe(true);
    });

    it("should return true for existing directories", () => {
      expect(adapter.exists("src")).toBe(true);
      expect(adapter.exists("docs/api")).toBe(true);
    });

    it("should return false for non-existent paths", () => {
      expect(adapter.exists("nonexistent.txt")).toBe(false);
      expect(adapter.exists("fake/path")).toBe(false);
    });

    it("should handle absolute paths", () => {
      expect(adapter.exists(`${repositoryPath}/README.md`)).toBe(true);
    });
  });

  describe("readFile", () => {
    it("should read file contents", () => {
      expect(adapter.readFile("README.md")).toBe("# Test Repo");
      expect(adapter.readFile("src/index.ts")).toBe("export {}");
    });
  });

  describe("isDirectory", () => {
    it("should return true for directories", () => {
      expect(adapter.isDirectory("src")).toBe(true);
      expect(adapter.isDirectory("docs")).toBe(true);
    });

    it("should return false for files", () => {
      expect(adapter.isDirectory("README.md")).toBe(false);
      expect(adapter.isDirectory("src/index.ts")).toBe(false);
    });
  });

  describe("readDir", () => {
    it("should list directory contents", () => {
      const srcContents = adapter.readDir("src");
      expect(srcContents).toContain("index.ts");
      expect(srcContents).toContain("utils");
    });

    it("should throw for non-existent directories", () => {
      expect(() => adapter.readDir("nonexistent")).toThrow();
    });
  });

  describe("path utilities", () => {
    it("join should combine paths", () => {
      expect(adapter.join("src", "utils", "helpers.ts")).toBe("src/utils/helpers.ts");
      expect(adapter.join("/root", "path")).toBe("/root/path");
    });

    it("dirname should return parent directory", () => {
      expect(adapter.dirname("src/utils/helpers.ts")).toBe("src/utils");
      expect(adapter.dirname("README.md")).toBe(".");
      expect(adapter.dirname("/root/file.txt")).toBe("/root");
    });

    it("basename should return filename", () => {
      expect(adapter.basename("src/utils/helpers.ts")).toBe("helpers.ts");
      expect(adapter.basename("README.md")).toBe("README.md");
      expect(adapter.basename("helpers.ts", ".ts")).toBe("helpers");
    });

    it("extname should return extension", () => {
      expect(adapter.extname("helpers.ts")).toBe(".ts");
      expect(adapter.extname("README.md")).toBe(".md");
      expect(adapter.extname("Makefile")).toBe("");
    });

    it("relative should compute relative path", () => {
      expect(adapter.relative("src", "src/utils/helpers.ts")).toBe("utils/helpers.ts");
      expect(adapter.relative("src/utils", "docs")).toBe("../../docs");
    });

    it("isAbsolute should detect absolute paths", () => {
      expect(adapter.isAbsolute("/root/path")).toBe(true);
      expect(adapter.isAbsolute("relative/path")).toBe(false);
    });
  });

  describe("getFileInfo", () => {
    it("should return file info for existing files", () => {
      const info = adapter.getFileInfo("README.md");
      expect(info).toBeDefined();
      expect(info?.name).toBe("README.md");
    });

    it("should return undefined for non-existent files", () => {
      expect(adapter.getFileInfo("nonexistent.txt")).toBeUndefined();
    });
  });
});

describe("FileTreeGlobAdapter", () => {
  const repositoryPath = "/test-repo";
  const files = [
    "README.md",
    "src/index.ts",
    "src/utils/helpers.ts",
    "src/utils/format.ts",
    "docs/guide.md",
    "docs/api/reference.md",
    "tests/index.test.ts",
    ".gitignore",
    ".env",
  ];

  const fileTree = createMockFileTree(files, repositoryPath);
  const adapter = new FileTreeGlobAdapter({
    fileTree,
    repositoryPath,
    matchesPath: simpleGlobMatch,
  });

  describe("findFiles", () => {
    it("should find files matching simple patterns", async () => {
      const result = await adapter.findFiles(["*.md"]);
      expect(result).toContain("README.md");
      expect(result).not.toContain("src/index.ts");
    });

    it("should find files with ** patterns", async () => {
      const result = await adapter.findFiles(["**/*.ts"]);
      expect(result).toContain("src/index.ts");
      expect(result).toContain("src/utils/helpers.ts");
      expect(result).toContain("tests/index.test.ts");
    });

    it("should find files in specific directories", async () => {
      const result = await adapter.findFiles(["src/**/*.ts"]);
      expect(result).toContain("src/index.ts");
      expect(result).toContain("src/utils/helpers.ts");
      expect(result).not.toContain("tests/index.test.ts");
    });

    it("should support brace expansion", async () => {
      const result = await adapter.findFiles(["**/*.{ts,md}"]);
      expect(result).toContain("src/index.ts");
      expect(result).toContain("README.md");
      expect(result).toContain("docs/guide.md");
    });

    it("should respect ignore patterns", async () => {
      const result = await adapter.findFiles(["**/*.ts"], {
        ignore: ["**/tests/**"],
      });
      expect(result).toContain("src/index.ts");
      expect(result).not.toContain("tests/index.test.ts");
    });

    it("should exclude dotfiles by default", async () => {
      const result = await adapter.findFiles(["*"]);
      expect(result).toContain("README.md");
      expect(result).not.toContain(".gitignore");
    });

    it("should include dotfiles when dot option is true", async () => {
      const result = await adapter.findFiles(["*"], { dot: true });
      expect(result).toContain("README.md");
      expect(result).toContain(".gitignore");
    });
  });

  describe("findFilesSync", () => {
    it("should work synchronously", () => {
      const result = adapter.findFilesSync(["**/*.md"]);
      expect(result).toContain("README.md");
      expect(result).toContain("docs/guide.md");
    });
  });

  describe("matchesPath", () => {
    it("should return true for matching paths", () => {
      expect(adapter.matchesPath(["**/*.ts"], "src/index.ts")).toBe(true);
      expect(adapter.matchesPath(["src/**"], "src/utils/helpers.ts")).toBe(true);
    });

    it("should return false for non-matching paths", () => {
      expect(adapter.matchesPath(["**/*.ts"], "README.md")).toBe(false);
      expect(adapter.matchesPath(["docs/**"], "src/index.ts")).toBe(false);
    });

    it("should match multiple patterns", () => {
      expect(adapter.matchesPath(["**/*.ts", "**/*.md"], "src/index.ts")).toBe(true);
      expect(adapter.matchesPath(["**/*.ts", "**/*.md"], "README.md")).toBe(true);
      expect(adapter.matchesPath(["**/*.ts", "**/*.md"], "package.json")).toBe(false);
    });

    it("should return false for empty patterns", () => {
      expect(adapter.matchesPath([], "src/index.ts")).toBe(false);
      expect(adapter.matchesPath(undefined, "src/index.ts")).toBe(false);
    });
  });
});
