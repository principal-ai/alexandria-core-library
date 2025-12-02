import { describe, it, expect, beforeEach, mock } from "bun:test";
import { AlexandriaOutpostManager } from "../../src/projects-core/AlexandriaOutpostManager";
import { InMemoryFileSystemAdapter } from "../../src/test-adapters/InMemoryFileSystemAdapter";
import { InMemoryGlobAdapter } from "../../src/test-adapters/InMemoryGlobAdapter";
import type { CodebaseView } from "../../src/pure-core/types/index";

// Test helper class that allows mocking MemoryPalace
class TestableAlexandriaOutpostManager extends AlexandriaOutpostManager {
  private mockViews: CodebaseView[] = [];

  setMockViews(views: CodebaseView[]) {
    this.mockViews = views;
  }

  protected createMemoryPalace(): { listViews: () => CodebaseView[] } {
    // Return a mock MemoryPalace
    return {
      listViews: () => this.mockViews,
    };
  }
}

describe("AlexandriaOutpostManager", () => {
  let manager: TestableAlexandriaOutpostManager;
  let fs: InMemoryFileSystemAdapter;
  let globAdapter: InMemoryGlobAdapter;
  const testRepoPath = "/test-repo";
  const testHomeDir = "/home/testuser";

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    globAdapter = new InMemoryGlobAdapter(fs);

    // Set up home directory structure for the manager
    fs.createDir(testHomeDir);
    fs.createDir(`${testHomeDir}/.alexandria`);

    // Set up test repository structure
    fs.createDir(testRepoPath);
    fs.createDir(`${testRepoPath}/.git`); // Required for MemoryPalace validation
    fs.createDir(`${testRepoPath}/.alexandria`);
    fs.createDir(`${testRepoPath}/.alexandria/views`);
    fs.createDir(`${testRepoPath}/docs`);
    fs.createDir(`${testRepoPath}/src`);

    // Create Alexandria files
    fs.writeFile(`${testRepoPath}/.alexandria/views.json`, "[]");
    fs.writeFile(`${testRepoPath}/.alexandria/anchored-notes.json`, "[]");

    // Create testable manager with test adapters and homeDir
    manager = new TestableAlexandriaOutpostManager(fs, globAdapter, testHomeDir);
  });

  describe("getAllDocs", () => {
    it("should find all markdown files in the repository", async () => {
      // Create test markdown files
      fs.writeFile(`${testRepoPath}/README.md`, "# README");
      fs.writeFile(`${testRepoPath}/docs/guide.md`, "# Guide");
      fs.writeFile(`${testRepoPath}/docs/api.md`, "# API");
      fs.writeFile(`${testRepoPath}/src/component.md`, "# Component");
      fs.writeFile(`${testRepoPath}/.alexandria/internal.md`, "# Internal");

      // Register the test repo
      await manager.registerRepository("test-repo", testRepoPath);

      // Get the entry
      const entries = manager.getAllEntries();
      const entry = entries.find((e) => e.name === "test-repo")!;

      // Get all docs
      const allDocs = await manager.getAllDocs(entry);

      expect(allDocs).toContain("README.md");
      expect(allDocs).toContain("docs/guide.md");
      expect(allDocs).toContain("docs/api.md");
      expect(allDocs).toContain("src/component.md");
      // Should NOT include .alexandria files (dot: false filters them)
      expect(allDocs).not.toContain(".alexandria/internal.md");
      expect(allDocs.length).toBe(4);
    });

    it("should respect useGitignore parameter", async () => {
      // Create test files
      fs.writeFile(`${testRepoPath}/README.md`, "# README");
      fs.writeFile(`${testRepoPath}/docs/guide.md`, "# Guide");

      // Track glob adapter calls
      const originalFindFiles = globAdapter.findFiles.bind(globAdapter);
      let findFilesCalls: { patterns: string[]; options?: unknown }[] = [];

      globAdapter.findFiles = async (patterns, options) => {
        findFilesCalls.push({ patterns, options });
        return originalFindFiles(patterns, options);
      };

      await manager.registerRepository("test-repo", testRepoPath);
      const entries = manager.getAllEntries();
      const entry = entries.find((e) => e.name === "test-repo")!;

      // Test with gitignore enabled (default)
      await manager.getAllDocs(entry);
      expect(findFilesCalls[0]?.options?.gitignore).toBe(true);

      // Reset calls
      findFilesCalls = [];

      // Test with gitignore disabled
      await manager.getAllDocs(entry, false);
      expect(findFilesCalls[0]?.options?.gitignore).toBe(false);
    });
  });

  describe("getAlexandriaEntryDocs", () => {
    it("should return overview paths from views", async () => {
      // Set up mock views
      manager.setMockViews([
        {
          id: "test-view",
          overviewPath: "docs/overview.md",
          referenceGroups: {},
        } as CodebaseView,
      ]);

      await manager.registerRepository("test-repo", testRepoPath);
      const entries = manager.getAllEntries();
      const entry = entries.find((e) => e.name === "test-repo")!;

      // Get tracked docs
      const trackedDocs = await manager.getAlexandriaEntryDocs(entry);

      expect(trackedDocs).toContain("docs/overview.md");
      expect(trackedDocs.length).toBe(1);
    });
  });

  describe("getAlexandriaEntryExcludedDocs", () => {
    it("should return excluded files from config", async () => {
      // Create config with excluded files
      const config = {
        context: {
          rules: [
            {
              id: "require-references",
              options: {
                excludeFiles: ["LICENSE.md", "CHANGELOG.md"],
              },
            },
          ],
        },
      };
      fs.writeFile(
        `${testRepoPath}/.alexandriarc.json`,
        JSON.stringify(config),
      );

      // Register repo first to get proper entry structure
      await manager.registerRepository("test-repo", testRepoPath);
      const entries = manager.getAllEntries();
      const entry = entries.find((e) => e.name === "test-repo")!;

      const excludedDocs = manager.getAlexandriaEntryExcludedDocs(entry);

      expect(excludedDocs).toContain("LICENSE.md");
      expect(excludedDocs).toContain("CHANGELOG.md");
      expect(excludedDocs.length).toBe(2);
    });

    it("should return empty array if no config", async () => {
      // Register repo first to get proper entry structure
      await manager.registerRepository("test-repo", testRepoPath);
      const entries = manager.getAllEntries();
      const entry = entries.find((e) => e.name === "test-repo")!;

      const excludedDocs = manager.getAlexandriaEntryExcludedDocs(entry);

      expect(excludedDocs).toEqual([]);
    });
  });

  describe("getUntrackedDocs", () => {
    it("should return only untracked markdown files", async () => {
      // Create various markdown files
      fs.writeFile(`${testRepoPath}/README.md`, "# README");
      fs.writeFile(`${testRepoPath}/docs/tracked.md`, "# Tracked");
      fs.writeFile(`${testRepoPath}/docs/untracked.md`, "# Untracked");
      fs.writeFile(`${testRepoPath}/LICENSE.md`, "# License");
      fs.writeFile(`${testRepoPath}/.alexandria/internal.md`, "# Internal");

      // Set up mock view that tracks one doc
      manager.setMockViews([
        {
          id: "test-view",
          overviewPath: "docs/tracked.md",
          referenceGroups: {},
        } as CodebaseView,
      ]);

      // Create config that excludes LICENSE.md
      const config = {
        context: {
          rules: [
            {
              id: "require-references",
              options: {
                excludeFiles: ["LICENSE.md"],
              },
            },
          ],
        },
      };
      fs.writeFile(
        `${testRepoPath}/.alexandriarc.json`,
        JSON.stringify(config),
      );

      await manager.registerRepository("test-repo", testRepoPath);
      const entries = manager.getAllEntries();
      const entry = entries.find((e) => e.name === "test-repo")!;

      // Get untracked docs
      const untrackedDocs = await manager.getUntrackedDocs(entry);

      // Should include only truly untracked files
      expect(untrackedDocs).toContain("README.md");
      expect(untrackedDocs).toContain("docs/untracked.md");

      // Should NOT include tracked, excluded, or Alexandria's own files
      expect(untrackedDocs).not.toContain("docs/tracked.md"); // tracked
      expect(untrackedDocs).not.toContain("LICENSE.md"); // excluded
      expect(untrackedDocs).not.toContain(".alexandria/internal.md"); // Alexandria's own

      expect(untrackedDocs.length).toBe(2);
    });

    it("should handle repository with no markdown files", async () => {
      await manager.registerRepository("test-repo", testRepoPath);
      const entries = manager.getAllEntries();
      const entry = entries.find((e) => e.name === "test-repo")!;

      const untrackedDocs = await manager.getUntrackedDocs(entry);

      expect(untrackedDocs).toEqual([]);
    });

    it("should handle repository where all docs are tracked or excluded", async () => {
      // Create markdown files
      fs.writeFile(`${testRepoPath}/docs/tracked.md`, "# Tracked");
      fs.writeFile(`${testRepoPath}/LICENSE.md`, "# License");

      // Set up mock view to track one
      manager.setMockViews([
        {
          id: "test-view",
          overviewPath: "docs/tracked.md",
          referenceGroups: {},
        } as CodebaseView,
      ]);

      // Exclude the other
      const config = {
        context: {
          rules: [
            {
              id: "require-references",
              options: {
                excludeFiles: ["LICENSE.md"],
              },
            },
          ],
        },
      };
      fs.writeFile(
        `${testRepoPath}/.alexandriarc.json`,
        JSON.stringify(config),
      );

      await manager.registerRepository("test-repo", testRepoPath);
      const entries = manager.getAllEntries();
      const entry = entries.find((e) => e.name === "test-repo")!;

      const untrackedDocs = await manager.getUntrackedDocs(entry);

      expect(untrackedDocs).toEqual([]);
    });
  });

  describe("updateRepository", () => {
    it("should update repository metadata", async () => {
      await manager.registerRepository("test-repo", testRepoPath);

      const updated = await manager.updateRepository("test-repo", {
        bookColor: "#FF5733",
        remoteUrl: "https://github.com/owner/test-repo.git",
      });

      expect(updated.bookColor).toBe("#FF5733");
      expect(updated.remoteUrl).toBe("https://github.com/owner/test-repo.git");
      expect(updated.name).toBe("test-repo");
      expect(updated.path).toBe(testRepoPath);
    });

    it("should throw error for non-existent repository", async () => {
      expect(async () => {
        await manager.updateRepository("non-existent", {
          bookColor: "#FF5733",
        });
      }).toThrow("Repository 'non-existent' not found");
    });

    it("should persist updates across retrieval", async () => {
      await manager.registerRepository("test-repo", testRepoPath);

      await manager.updateRepository("test-repo", {
        bookColor: "#00FF00",
      });

      const entries = manager.getAllEntries();
      const entry = entries.find((e) => e.name === "test-repo")!;

      expect(entry.bookColor).toBe("#00FF00");
    });
  });

  describe("updateGitHubMetadata", () => {
    it("should update GitHub metadata", async () => {
      await manager.registerRepository("test-repo", testRepoPath);

      const updated = await manager.updateGitHubMetadata("test-repo", {
        owner: "test-owner",
        description: "Test repository",
        stars: 100,
        topics: ["typescript", "testing"],
      });

      expect(updated.github).toBeDefined();
      expect(updated.github?.owner).toBe("test-owner");
      expect(updated.github?.description).toBe("Test repository");
      expect(updated.github?.stars).toBe(100);
      expect(updated.github?.topics).toEqual(["typescript", "testing"]);
      expect(updated.lastChecked).toBeDefined();
    });

    it("should merge with existing GitHub data", async () => {
      await manager.registerRepository("test-repo", testRepoPath);

      // First update
      await manager.updateGitHubMetadata("test-repo", {
        owner: "initial-owner",
        stars: 50,
        description: "Initial description",
      });

      // Second update (partial)
      const updated = await manager.updateGitHubMetadata("test-repo", {
        stars: 100,
        topics: ["new-topic"],
      });

      expect(updated.github?.owner).toBe("initial-owner"); // Preserved
      expect(updated.github?.description).toBe("Initial description"); // Preserved
      expect(updated.github?.stars).toBe(100); // Updated
      expect(updated.github?.topics).toEqual(["new-topic"]); // Updated
    });

    it("should always update lastUpdated timestamp", async () => {
      await manager.registerRepository("test-repo", testRepoPath);

      const updated1 = await manager.updateGitHubMetadata("test-repo", {
        owner: "test-owner",
      });
      const timestamp1 = updated1.github?.lastUpdated;

      // Wait a tiny bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated2 = await manager.updateGitHubMetadata("test-repo", {
        stars: 10,
      });
      const timestamp2 = updated2.github?.lastUpdated;

      expect(timestamp1).toBeDefined();
      expect(timestamp2).toBeDefined();
      expect(timestamp1).not.toBe(timestamp2);
    });
  });

  describe("refreshGitHubMetadata", () => {
    it("should fetch GitHub metadata from API", async () => {
      // Mock fetch
      const originalFetch = global.fetch;
      global.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              full_name: "octocat/hello-world",
              owner: { login: "octocat" },
              name: "hello-world",
              description: "My first repository",
              stargazers_count: 1234,
              language: "TypeScript",
              topics: ["octocat", "hello", "world"],
              license: { spdx_id: "MIT" },
              default_branch: "main",
              private: false,
              pushed_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-02T00:00:00Z",
            }),
        }),
      ) as typeof fetch;

      try {
        await manager.registerRepository(
          "test-repo",
          testRepoPath,
          "https://github.com/octocat/hello-world.git",
        );

        const updated = await manager.refreshGitHubMetadata("test-repo");

        expect(updated.github).toBeDefined();
        expect(updated.github?.id).toBe("octocat/hello-world");
        expect(updated.github?.owner).toBe("octocat");
        expect(updated.github?.name).toBe("hello-world");
        expect(updated.github?.description).toBe("My first repository");
        expect(updated.github?.stars).toBe(1234);
        expect(updated.github?.primaryLanguage).toBe("TypeScript");
        expect(updated.github?.topics).toEqual(["octocat", "hello", "world"]);
        expect(updated.github?.license).toBe("MIT");
        expect(updated.github?.defaultBranch).toBe("main");
        expect(updated.github?.isPublic).toBe(true);
        expect(updated.github?.lastCommit).toBe("2024-01-01T00:00:00Z");
        expect(updated.lastChecked).toBeDefined();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should handle GitHub API failures gracefully", async () => {
      const originalFetch = global.fetch;
      global.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
        }),
      ) as typeof fetch;

      try {
        await manager.registerRepository(
          "test-repo",
          testRepoPath,
          "https://github.com/owner/repo.git",
        );

        const updated = await manager.refreshGitHubMetadata("test-repo");

        // Should still update with basic info from URL
        expect(updated.github).toBeDefined();
        expect(updated.github?.id).toBe("owner/repo");
        expect(updated.github?.owner).toBe("owner");
        expect(updated.github?.name).toBe("repo");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should throw error for repository without remote URL", async () => {
      await manager.registerRepository("test-repo", testRepoPath);

      expect(async () => {
        await manager.refreshGitHubMetadata("test-repo");
      }).toThrow("Repository 'test-repo' has no remote URL configured");
    });

    it("should handle non-GitHub URLs", async () => {
      await manager.registerRepository(
        "test-repo",
        testRepoPath,
        "https://gitlab.com/owner/repo.git",
      );

      expect(async () => {
        await manager.refreshGitHubMetadata("test-repo");
      }).toThrow("Could not parse GitHub URL from remote");
    });

    it("should parse various GitHub URL formats", async () => {
      const originalFetch = global.fetch;
      global.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              full_name: "owner/repo",
              owner: { login: "owner" },
              name: "repo",
              stargazers_count: 0,
            }),
        }),
      ) as typeof fetch;

      try {
        // Create different paths for each test repo
        fs.createDir("/test-repo1");
        fs.createDir("/test-repo1/.git");
        fs.createDir("/test-repo2");
        fs.createDir("/test-repo2/.git");
        fs.createDir("/test-repo3");
        fs.createDir("/test-repo3/.git");

        // Test HTTPS URL with .git
        await manager.registerRepository(
          "repo1",
          "/test-repo1",
          "https://github.com/owner/repo.git",
        );
        const updated1 = await manager.refreshGitHubMetadata("repo1");
        expect(updated1.github?.owner).toBe("owner");

        // Test HTTPS URL without .git
        await manager.registerRepository(
          "repo2",
          "/test-repo2",
          "https://github.com/owner2/repo2",
        );
        const updated2 = await manager.refreshGitHubMetadata("repo2");
        expect(updated2.github?.owner).toBe("owner");

        // Test SSH URL
        await manager.registerRepository(
          "repo3",
          "/test-repo3",
          "git@github.com:owner3/repo3.git",
        );
        const updated3 = await manager.refreshGitHubMetadata("repo3");
        expect(updated3.github?.owner).toBe("owner");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("refreshViews", () => {
    it("should refresh view data from MemoryPalace", async () => {
      await manager.registerRepository("test-repo", testRepoPath);

      // Initially no views
      let updated = await manager.refreshViews("test-repo");
      expect(updated.hasViews).toBe(false);
      expect(updated.viewCount).toBe(0);
      expect(updated.views).toEqual([]);
      expect(updated.lastChecked).toBeDefined();

      // Add mock views
      manager.setMockViews([
        {
          id: "view1",
          overviewPath: "docs/view1.md",
          referenceGroups: {},
        } as CodebaseView,
        {
          id: "view2",
          overviewPath: "docs/view2.md",
          referenceGroups: {},
        } as CodebaseView,
      ]);

      // Refresh again
      updated = await manager.refreshViews("test-repo");
      expect(updated.hasViews).toBe(true);
      expect(updated.viewCount).toBe(2);
      expect(updated.views).toHaveLength(2);
      expect(updated.views[0].id).toBe("view1");
      expect(updated.views[1].id).toBe("view2");
    });

    it("should handle view refresh errors gracefully", async () => {
      // Override createMemoryPalace to throw error
      const originalCreateMemoryPalace = manager.createMemoryPalace;
      manager.createMemoryPalace = () => {
        throw new Error("MemoryPalace error");
      };

      await manager.registerRepository("test-repo", testRepoPath);

      const updated = await manager.refreshViews("test-repo");

      // Should still update with empty views and set lastChecked
      expect(updated.hasViews).toBe(false);
      expect(updated.viewCount).toBe(0);
      expect(updated.views).toEqual([]);
      expect(updated.lastChecked).toBeDefined();

      // Restore original
      manager.createMemoryPalace = originalCreateMemoryPalace;
    });

    it("should throw error for non-existent repository", async () => {
      expect(async () => {
        await manager.refreshViews("non-existent");
      }).toThrow("Repository 'non-existent' not found");
    });
  });

  describe("refreshAllRepositories", () => {
    beforeEach(async () => {
      // Register multiple repositories
      await manager.registerRepository(
        "repo1",
        "/repo1",
        "https://github.com/owner/repo1.git",
      );
      await manager.registerRepository("repo2", "/repo2");
      await manager.registerRepository(
        "repo3",
        "/repo3",
        "https://github.com/owner/repo3.git",
      );

      // Set up file systems for new repos
      fs.createDir("/repo1");
      fs.createDir("/repo1/.git");
      fs.createDir("/repo2");
      fs.createDir("/repo2/.git");
      fs.createDir("/repo3");
      fs.createDir("/repo3/.git");
    });

    it("should refresh all repositories", async () => {
      // Mock fetch for GitHub requests
      const originalFetch = global.fetch;
      global.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              full_name: "owner/repo",
              owner: { login: "owner" },
              name: "repo",
              stargazers_count: 100,
            }),
        }),
      ) as typeof fetch;

      try {
        const results = await manager.refreshAllRepositories();

        expect(results).toHaveLength(3);
        expect(results[0].name).toBe("repo1");
        expect(results[1].name).toBe("repo2");
        expect(results[2].name).toBe("repo3");

        // Repos with GitHub URLs should have GitHub data
        expect(results[0].github?.stars).toBe(100);
        expect(results[2].github?.stars).toBe(100);

        // Repo without GitHub URL should not
        expect(results[1].github).toBeUndefined();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should respect refresh options", async () => {
      const originalFetch = global.fetch;
      let fetchCallCount = 0;
      global.fetch = mock(() => {
        fetchCallCount++;
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
        });
      }) as typeof fetch;

      try {
        // Refresh only views, not GitHub
        await manager.refreshAllRepositories({ github: false, views: true });
        expect(fetchCallCount).toBe(0);

        // Refresh only GitHub, not views
        await manager.refreshAllRepositories({ github: true, views: false });
        expect(fetchCallCount).toBeGreaterThan(0);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should handle individual repository failures gracefully", async () => {
      // Make one repository's view refresh fail
      const originalCreateMemoryPalace = manager.createMemoryPalace;
      manager.createMemoryPalace = (path: string) => {
        if (path === "/repo2") {
          throw new Error("MemoryPalace error for repo2");
        }
        return originalCreateMemoryPalace.call(manager, path);
      };

      const results = await manager.refreshAllRepositories({
        github: false,
        views: true,
      });

      // Should still return all repositories
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.name)).toEqual(["repo1", "repo2", "repo3"]);

      // Restore original
      manager.createMemoryPalace = originalCreateMemoryPalace;
    });

    it("should return empty array when no repositories exist", async () => {
      // Create a fresh manager with a new file system
      const freshFs = new InMemoryFileSystemAdapter();
      const freshGlobAdapter = new InMemoryGlobAdapter(freshFs);
      const freshHomeDir = "/fresh-home";
      freshFs.createDir(freshHomeDir);
      freshFs.createDir(`${freshHomeDir}/.alexandria`);
      const emptyManager = new TestableAlexandriaOutpostManager(
        freshFs,
        freshGlobAdapter,
        freshHomeDir,
      );

      const results = await emptyManager.refreshAllRepositories();

      expect(results).toEqual([]);
    });
  });
});
