import { describe, it, expect, beforeEach } from "bun:test";
import {
  LocalStorageFileSystemAdapter,
  type StorageProvider,
} from "../../src/browser-adapters/LocalStorageFileSystemAdapter";

/**
 * Mock localStorage implementation for testing
 */
class MockStorage implements StorageProvider {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  key(index: number): string | null {
    const keys = Array.from(this.data.keys());
    return keys[index] ?? null;
  }

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }
}

describe("LocalStorageFileSystemAdapter", () => {
  let storage: MockStorage;
  let fs: LocalStorageFileSystemAdapter;

  beforeEach(() => {
    storage = new MockStorage();
    fs = new LocalStorageFileSystemAdapter({
      prefix: "test",
      storage,
    });
  });

  describe("Basic file operations", () => {
    it("should write and read a file", () => {
      fs.writeFile("/config/settings.json", '{"theme": "dark"}');

      const content = fs.readFile("/config/settings.json");
      expect(content).toBe('{"theme": "dark"}');
    });

    it("should check if file exists", () => {
      expect(fs.exists("/nonexistent.txt")).toBe(false);

      fs.writeFile("/exists.txt", "content");
      expect(fs.exists("/exists.txt")).toBe(true);
    });

    it("should throw when reading non-existent file", () => {
      expect(() => fs.readFile("/nonexistent.txt")).toThrow("File not found");
    });

    it("should delete a file", () => {
      fs.writeFile("/to-delete.txt", "content");
      expect(fs.exists("/to-delete.txt")).toBe(true);

      fs.deleteFile("/to-delete.txt");
      expect(fs.exists("/to-delete.txt")).toBe(false);
    });

    it("should overwrite existing file", () => {
      fs.writeFile("/file.txt", "original");
      fs.writeFile("/file.txt", "updated");

      expect(fs.readFile("/file.txt")).toBe("updated");
    });
  });

  describe("Binary file operations", () => {
    it("should write and read binary files", () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      fs.writeBinaryFile("/binary.dat", data);

      const read = fs.readBinaryFile("/binary.dat");
      expect(Array.from(read)).toEqual([72, 101, 108, 108, 111]);
    });

    it("should throw when reading non-existent binary file", () => {
      expect(() => fs.readBinaryFile("/nonexistent.bin")).toThrow(
        "Binary file not found",
      );
    });
  });

  describe("Directory operations", () => {
    it("should create directories", () => {
      fs.createDir("/workspace/projects");

      expect(fs.isDirectory("/workspace/projects")).toBe(true);
      expect(fs.exists("/workspace/projects")).toBe(true);
    });

    it("should identify directories vs files", () => {
      fs.writeFile("/file.txt", "content");
      fs.createDir("/folder");

      expect(fs.isDirectory("/file.txt")).toBe(false);
      expect(fs.isDirectory("/folder")).toBe(true);
    });

    it("should list directory contents", () => {
      fs.writeFile("/root/file1.txt", "content1");
      fs.writeFile("/root/file2.txt", "content2");
      fs.createDir("/root/subdir");

      const contents = fs.readDir("/root");
      expect(contents.sort()).toEqual(["file1.txt", "file2.txt", "subdir"]);
    });

    it("should throw when reading non-existent directory", () => {
      expect(() => fs.readDir("/nonexistent")).toThrow(
        "ENOENT: no such file or directory",
      );
    });

    it("should delete directory and contents", () => {
      fs.writeFile("/toDelete/file.txt", "content");
      fs.createDir("/toDelete/subdir");

      fs.deleteDir("/toDelete");

      expect(fs.exists("/toDelete")).toBe(false);
      expect(fs.exists("/toDelete/file.txt")).toBe(false);
    });

    it("should auto-create parent directories when writing", () => {
      fs.writeFile("/deep/nested/path/file.txt", "content");

      expect(fs.isDirectory("/deep")).toBe(true);
      expect(fs.isDirectory("/deep/nested")).toBe(true);
      expect(fs.isDirectory("/deep/nested/path")).toBe(true);
    });
  });

  describe("Path operations", () => {
    it("should join paths correctly", () => {
      expect(fs.join("a", "b", "c")).toBe("a/b/c");
      expect(fs.join("/root", "sub", "file.txt")).toBe("/root/sub/file.txt");
      expect(fs.join("a", "", "b")).toBe("a/b");
      expect(fs.join("a//b", "c")).toBe("a/b/c");
    });

    it("should get dirname", () => {
      expect(fs.dirname("/root/sub/file.txt")).toBe("/root/sub");
      expect(fs.dirname("/file.txt")).toBe("/");
      expect(fs.dirname("file.txt")).toBe("/");
    });

    it("should get basename", () => {
      expect(fs.basename("/root/sub/file.txt")).toBe("file.txt");
      expect(fs.basename("/root/sub/file.txt", ".txt")).toBe("file");
      expect(fs.basename("file.txt")).toBe("file.txt");
    });

    it("should get extname", () => {
      expect(fs.extname("file.txt")).toBe(".txt");
      expect(fs.extname("file.test.js")).toBe(".js");
      expect(fs.extname("file")).toBe("");
      expect(fs.extname(".gitignore")).toBe("");
    });

    it("should check if path is absolute", () => {
      expect(fs.isAbsolute("/root/file.txt")).toBe(true);
      expect(fs.isAbsolute("relative/path")).toBe(false);
    });

    it("should compute relative path", () => {
      expect(fs.relative("/root/a", "/root/a/b/c")).toBe("b/c");
      expect(fs.relative("/root", "/other")).toBe("/other");
    });
  });

  describe("Repository operations", () => {
    it("should find repository root with .git marker", () => {
      fs.createDir("/projects/my-repo/.git");
      fs.writeFile("/projects/my-repo/src/file.ts", "content");

      const root = fs.normalizeRepositoryPath("/projects/my-repo/src/file.ts");
      expect(root).toBe("/projects/my-repo");
    });

    it("should return input path when no .git found", () => {
      // In browser mode, it returns the input path if no .git
      const root = fs.normalizeRepositoryPath("/workspace/project");
      expect(root).toBe("/workspace/project");
    });

    it("should get repository name from path", () => {
      expect(fs.getRepositoryName("/projects/my-repo")).toBe("my-repo");
      expect(fs.getRepositoryName("/a/b/c")).toBe("c");
      expect(fs.getRepositoryName("/")).toBe("workspace");
    });
  });

  describe("Custom prefix", () => {
    it("should use custom prefix for storage keys", () => {
      const customFs = new LocalStorageFileSystemAdapter({
        prefix: "myapp",
        storage,
      });

      customFs.writeFile("/data.json", "{}");

      // Verify the key uses the custom prefix
      expect(storage.getItem("myapp:/data.json")).toBe("{}");
    });

    it("should isolate data between different prefixes", () => {
      const fs1 = new LocalStorageFileSystemAdapter({
        prefix: "app1",
        storage,
      });
      const fs2 = new LocalStorageFileSystemAdapter({
        prefix: "app2",
        storage,
      });

      fs1.writeFile("/file.txt", "from app1");
      fs2.writeFile("/file.txt", "from app2");

      expect(fs1.readFile("/file.txt")).toBe("from app1");
      expect(fs2.readFile("/file.txt")).toBe("from app2");
    });
  });

  describe("Browser utilities", () => {
    it("should clear all adapter data", () => {
      fs.writeFile("/file1.txt", "content1");
      fs.writeFile("/file2.txt", "content2");
      fs.createDir("/folder");

      fs.clear();

      expect(fs.exists("/file1.txt")).toBe(false);
      expect(fs.exists("/file2.txt")).toBe(false);
      expect(fs.exists("/folder")).toBe(false);
    });

    it("should calculate storage size", () => {
      fs.writeFile("/small.txt", "abc");

      const size = fs.getStorageSize();
      expect(size).toBeGreaterThan(0);
    });

    it("should list all files", () => {
      fs.writeFile("/a.txt", "a");
      fs.writeFile("/b.txt", "b");
      fs.writeFile("/sub/c.txt", "c");
      fs.createDir("/empty");

      const files = fs.listAllFiles().sort();
      expect(files).toEqual(["/a.txt", "/b.txt", "/sub/c.txt"]);
    });
  });

  describe("Integration with WorkspaceManager patterns", () => {
    it("should support workspace JSON storage", () => {
      const workspacesPath = "/home/.alexandria/workspaces.json";
      const workspacesData = {
        version: "1.0.0",
        workspaces: [
          { id: "ws-1", name: "Project A", createdAt: Date.now() },
          { id: "ws-2", name: "Project B", createdAt: Date.now() },
        ],
      };

      fs.writeFile(workspacesPath, JSON.stringify(workspacesData, null, 2));

      const loaded = JSON.parse(fs.readFile(workspacesPath));
      expect(loaded.workspaces).toHaveLength(2);
      expect(loaded.workspaces[0].name).toBe("Project A");
    });

    it("should support membership storage", () => {
      const membershipsPath = "/home/.alexandria/workspace-memberships.json";
      const membershipsData = {
        version: "1.0.0",
        memberships: [
          {
            repositoryId: "owner/repo1",
            workspaceId: "ws-1",
            addedAt: Date.now(),
          },
        ],
      };

      fs.writeFile(membershipsPath, JSON.stringify(membershipsData, null, 2));

      const loaded = JSON.parse(fs.readFile(membershipsPath));
      expect(loaded.memberships[0].repositoryId).toBe("owner/repo1");
    });
  });
});

describe("LocalStorageFileSystemAdapter error handling", () => {
  it("should throw when localStorage is not available", () => {
    // Create adapter without storage and without globalThis.localStorage
    const originalLocalStorage = globalThis.localStorage;
    // @ts-expect-error - intentionally removing localStorage for test
    delete globalThis.localStorage;

    expect(
      () => new LocalStorageFileSystemAdapter({ prefix: "test" }),
    ).toThrow("localStorage is not available");

    // Restore
    // @ts-expect-error - restoring localStorage
    globalThis.localStorage = originalLocalStorage;
  });
});
