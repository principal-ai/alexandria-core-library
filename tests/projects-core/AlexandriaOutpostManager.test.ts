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

    fs.createDir(testHomeDir);
    fs.createDir(`${testHomeDir}/.alexandria`);

    fs.createDir(testRepoPath);
    fs.createDir(`${testRepoPath}/.git`);
    fs.createDir(`${testRepoPath}/.alexandria`);
    fs.createDir(`${testRepoPath}/.alexandria/views`);
    fs.createDir(`${testRepoPath}/docs`);
    fs.createDir(`${testRepoPath}/src`);

    fs.writeFile(`${testRepoPath}/.alexandria/views.json`, "[]");
    fs.writeFile(`${testRepoPath}/.alexandria/anchored-notes.json`, "[]");

    manager = new TestableAlexandriaOutpostManager(fs, globAdapter, testHomeDir);
  });

  describe("getAllDocs", () => {
    it("finds all markdown files in the repository", async () => {
      fs.writeFile(`${testRepoPath}/README.md`, "# README");
      fs.writeFile(`${testRepoPath}/docs/guide.md`, "# Guide");
      fs.writeFile(`${testRepoPath}/docs/api.md`, "# API");
      fs.writeFile(`${testRepoPath}/src/component.md`, "# Component");
      fs.writeFile(`${testRepoPath}/.alexandria/internal.md`, "# Internal");

      await manager.registerRepository(testRepoPath);

      const entries = manager.getAllEntries();
      const entry = entries.find((e) => e.path === testRepoPath)!;

      const allDocs = await manager.getAllDocs(entry);

      expect(allDocs).toContain("README.md");
      expect(allDocs).toContain("docs/guide.md");
      expect(allDocs).toContain("docs/api.md");
      expect(allDocs).toContain("src/component.md");
      expect(allDocs).not.toContain(".alexandria/internal.md");
      expect(allDocs.length).toBe(4);
    });

    it("respects useGitignore parameter", async () => {
      fs.writeFile(`${testRepoPath}/README.md`, "# README");
      fs.writeFile(`${testRepoPath}/docs/guide.md`, "# Guide");

      const originalFindFiles = globAdapter.findFiles.bind(globAdapter);
      let findFilesCalls: { patterns: string[]; options?: unknown }[] = [];

      globAdapter.findFiles = async (patterns, options) => {
        findFilesCalls.push({ patterns, options });
        return originalFindFiles(patterns, options);
      };

      await manager.registerRepository(testRepoPath);
      const entry = manager
        .getAllEntries()
        .find((e) => e.path === testRepoPath)!;

      await manager.getAllDocs(entry);
      expect(findFilesCalls[0]?.options?.gitignore).toBe(true);

      findFilesCalls = [];

      await manager.getAllDocs(entry, false);
      expect(findFilesCalls[0]?.options?.gitignore).toBe(false);
    });
  });

  describe("getAlexandriaEntryDocs", () => {
    it("returns overview paths from views", async () => {
      manager.setMockViews([
        {
          id: "test-view",
          overviewPath: "docs/overview.md",
          referenceGroups: {},
        } as CodebaseView,
      ]);

      await manager.registerRepository(testRepoPath);
      const entry = manager
        .getAllEntries()
        .find((e) => e.path === testRepoPath)!;

      const trackedDocs = await manager.getAlexandriaEntryDocs(entry);

      expect(trackedDocs).toContain("docs/overview.md");
      expect(trackedDocs.length).toBe(1);
    });
  });

  describe("getAlexandriaEntryExcludedDocs", () => {
    it("returns excluded files from config", async () => {
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

      await manager.registerRepository(testRepoPath);
      const entry = manager
        .getAllEntries()
        .find((e) => e.path === testRepoPath)!;

      const excludedDocs = manager.getAlexandriaEntryExcludedDocs(entry);

      expect(excludedDocs).toContain("LICENSE.md");
      expect(excludedDocs).toContain("CHANGELOG.md");
      expect(excludedDocs.length).toBe(2);
    });

    it("returns empty array if no config", async () => {
      await manager.registerRepository(testRepoPath);
      const entry = manager
        .getAllEntries()
        .find((e) => e.path === testRepoPath)!;

      const excludedDocs = manager.getAlexandriaEntryExcludedDocs(entry);

      expect(excludedDocs).toEqual([]);
    });
  });

  describe("getUntrackedDocs", () => {
    it("returns only untracked markdown files", async () => {
      fs.writeFile(`${testRepoPath}/README.md`, "# README");
      fs.writeFile(`${testRepoPath}/docs/tracked.md`, "# Tracked");
      fs.writeFile(`${testRepoPath}/docs/untracked.md`, "# Untracked");
      fs.writeFile(`${testRepoPath}/LICENSE.md`, "# License");
      fs.writeFile(`${testRepoPath}/.alexandria/internal.md`, "# Internal");

      manager.setMockViews([
        {
          id: "test-view",
          overviewPath: "docs/tracked.md",
          referenceGroups: {},
        } as CodebaseView,
      ]);

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

      await manager.registerRepository(testRepoPath);
      const entry = manager
        .getAllEntries()
        .find((e) => e.path === testRepoPath)!;

      const untrackedDocs = await manager.getUntrackedDocs(entry);

      expect(untrackedDocs).toContain("README.md");
      expect(untrackedDocs).toContain("docs/untracked.md");

      expect(untrackedDocs).not.toContain("docs/tracked.md");
      expect(untrackedDocs).not.toContain("LICENSE.md");
      expect(untrackedDocs).not.toContain(".alexandria/internal.md");

      expect(untrackedDocs.length).toBe(2);
    });

    it("handles repository with no markdown files", async () => {
      await manager.registerRepository(testRepoPath);
      const entry = manager
        .getAllEntries()
        .find((e) => e.path === testRepoPath)!;

      const untrackedDocs = await manager.getUntrackedDocs(entry);

      expect(untrackedDocs).toEqual([]);
    });

    it("handles repository where all docs are tracked or excluded", async () => {
      fs.writeFile(`${testRepoPath}/docs/tracked.md`, "# Tracked");
      fs.writeFile(`${testRepoPath}/LICENSE.md`, "# License");

      manager.setMockViews([
        {
          id: "test-view",
          overviewPath: "docs/tracked.md",
          referenceGroups: {},
        } as CodebaseView,
      ]);

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

      await manager.registerRepository(testRepoPath);
      const entry = manager
        .getAllEntries()
        .find((e) => e.path === testRepoPath)!;

      const untrackedDocs = await manager.getUntrackedDocs(entry);

      expect(untrackedDocs).toEqual([]);
    });
  });

  describe("updateRepository (path-keyed)", () => {
    it("updates repository metadata by path", async () => {
      await manager.registerRepository(testRepoPath);

      const updated = await manager.updateRepository(testRepoPath, {
        bookColor: "#FF5733",
        remoteUrl: "https://github.com/owner/test-repo.git",
      });

      expect(updated.bookColor).toBe("#FF5733");
      expect(updated.remoteUrl).toBe("https://github.com/owner/test-repo.git");
      expect(updated.path).toBe(testRepoPath);
    });

    it("throws for an unregistered path", async () => {
      expect(async () => {
        await manager.updateRepository("/no-such-path", {
          bookColor: "#FF5733",
        });
      }).toThrow(`No repository registered at path '/no-such-path'`);
    });

    it("persists updates across retrieval", async () => {
      await manager.registerRepository(testRepoPath);

      await manager.updateRepository(testRepoPath, {
        bookColor: "#00FF00",
      });

      const entry = manager
        .getAllEntries()
        .find((e) => e.path === testRepoPath)!;

      expect(entry.bookColor).toBe("#00FF00");
    });
  });

  describe("updateGitHubMetadata (path-keyed)", () => {
    it("updates GitHub metadata", async () => {
      await manager.registerRepository(testRepoPath);

      const updated = await manager.updateGitHubMetadata(testRepoPath, {
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

    it("merges with existing GitHub data", async () => {
      await manager.registerRepository(testRepoPath);

      await manager.updateGitHubMetadata(testRepoPath, {
        owner: "initial-owner",
        stars: 50,
        description: "Initial description",
      });

      const updated = await manager.updateGitHubMetadata(testRepoPath, {
        stars: 100,
        topics: ["new-topic"],
      });

      expect(updated.github?.owner).toBe("initial-owner");
      expect(updated.github?.description).toBe("Initial description");
      expect(updated.github?.stars).toBe(100);
      expect(updated.github?.topics).toEqual(["new-topic"]);
    });

    it("always updates lastUpdated timestamp", async () => {
      await manager.registerRepository(testRepoPath);

      const updated1 = await manager.updateGitHubMetadata(testRepoPath, {
        owner: "test-owner",
      });
      const timestamp1 = updated1.github?.lastUpdated;

      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated2 = await manager.updateGitHubMetadata(testRepoPath, {
        stars: 10,
      });
      const timestamp2 = updated2.github?.lastUpdated;

      expect(timestamp1).toBeDefined();
      expect(timestamp2).toBeDefined();
      expect(timestamp1).not.toBe(timestamp2);
    });
  });

  describe("refreshGitHubMetadata (path-keyed)", () => {
    it("fetches GitHub metadata from API", async () => {
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
          testRepoPath,
          "https://github.com/octocat/hello-world.git",
        );

        const updated = await manager.refreshGitHubMetadata(testRepoPath);

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

    it("handles GitHub API failures gracefully", async () => {
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
          testRepoPath,
          "https://github.com/owner/repo.git",
        );

        const updated = await manager.refreshGitHubMetadata(testRepoPath);

        expect(updated.github).toBeDefined();
        expect(updated.github?.id).toBe("owner/repo");
        expect(updated.github?.owner).toBe("owner");
        expect(updated.github?.name).toBe("repo");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("throws for repository without remote URL", async () => {
      await manager.registerRepository(testRepoPath);

      expect(async () => {
        await manager.refreshGitHubMetadata(testRepoPath);
      }).toThrow(`Repository at '${testRepoPath}' has no remote URL configured`);
    });

    it("handles non-GitHub URLs", async () => {
      await manager.registerRepository(
        testRepoPath,
        "https://gitlab.com/owner/repo.git",
      );

      expect(async () => {
        await manager.refreshGitHubMetadata(testRepoPath);
      }).toThrow("Could not parse GitHub URL from remote");
    });

    it("parses various GitHub URL formats", async () => {
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
        fs.createDir("/test-repo1");
        fs.createDir("/test-repo1/.git");
        fs.createDir("/test-repo2");
        fs.createDir("/test-repo2/.git");
        fs.createDir("/test-repo3");
        fs.createDir("/test-repo3/.git");

        await manager.registerRepository(
          "/test-repo1",
          "https://github.com/owner/repo.git",
        );
        const updated1 = await manager.refreshGitHubMetadata("/test-repo1");
        expect(updated1.github?.owner).toBe("owner");

        await manager.registerRepository(
          "/test-repo2",
          "https://github.com/owner2/repo2",
        );
        const updated2 = await manager.refreshGitHubMetadata("/test-repo2");
        expect(updated2.github?.owner).toBe("owner");

        await manager.registerRepository(
          "/test-repo3",
          "git@github.com:owner3/repo3.git",
        );
        const updated3 = await manager.refreshGitHubMetadata("/test-repo3");
        expect(updated3.github?.owner).toBe("owner");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("refreshViews (path-keyed)", () => {
    it("refreshes view data from MemoryPalace", async () => {
      await manager.registerRepository(testRepoPath);

      let updated = await manager.refreshViews(testRepoPath);
      expect(updated.hasViews).toBe(false);
      expect(updated.viewCount).toBe(0);
      expect(updated.views).toEqual([]);
      expect(updated.lastChecked).toBeDefined();

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

      updated = await manager.refreshViews(testRepoPath);
      expect(updated.hasViews).toBe(true);
      expect(updated.viewCount).toBe(2);
      expect(updated.views).toHaveLength(2);
      expect(updated.views[0].id).toBe("view1");
      expect(updated.views[1].id).toBe("view2");
    });

    it("handles view refresh errors gracefully", async () => {
      const originalCreateMemoryPalace = manager.createMemoryPalace;
      manager.createMemoryPalace = () => {
        throw new Error("MemoryPalace error");
      };

      await manager.registerRepository(testRepoPath);

      const updated = await manager.refreshViews(testRepoPath);

      expect(updated.hasViews).toBe(false);
      expect(updated.viewCount).toBe(0);
      expect(updated.views).toEqual([]);
      expect(updated.lastChecked).toBeDefined();

      manager.createMemoryPalace = originalCreateMemoryPalace;
    });

    it("throws for an unregistered path", async () => {
      expect(async () => {
        await manager.refreshViews("/non-existent");
      }).toThrow(`No repository registered at path '/non-existent'`);
    });
  });

  describe("refreshAllRepositories", () => {
    beforeEach(async () => {
      fs.createDir("/repo1");
      fs.createDir("/repo1/.git");
      fs.createDir("/repo2");
      fs.createDir("/repo2/.git");
      fs.createDir("/repo3");
      fs.createDir("/repo3/.git");

      await manager.registerRepository(
        "/repo1",
        "https://github.com/owner/repo1.git",
      );
      await manager.registerRepository("/repo2");
      await manager.registerRepository(
        "/repo3",
        "https://github.com/owner/repo3.git",
      );
    });

    it("refreshes all repositories", async () => {
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

        // 3 registered above plus testRepoPath from outer beforeEach
        expect(results.length).toBeGreaterThanOrEqual(3);

        const byPath = new Map(
          manager.getAllEntries().map((e) => [e.path, e]),
        );

        // Repos with GitHub URLs should have GitHub data
        const repo1Result = results.find(
          (r) => byPath.get("/repo1")?.name === r.name,
        );
        const repo3Result = results.find(
          (r) => byPath.get("/repo3")?.name === r.name,
        );
        expect(repo1Result?.github?.stars).toBe(100);
        expect(repo3Result?.github?.stars).toBe(100);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("respects refresh options", async () => {
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
        await manager.refreshAllRepositories({ github: false, views: true });
        expect(fetchCallCount).toBe(0);

        await manager.refreshAllRepositories({ github: true, views: false });
        expect(fetchCallCount).toBeGreaterThan(0);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("handles individual repository failures gracefully", async () => {
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

      // All registered repos returned even if one failed
      expect(results.length).toBeGreaterThanOrEqual(3);

      manager.createMemoryPalace = originalCreateMemoryPalace;
    });

    it("returns empty array when no repositories exist", async () => {
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
