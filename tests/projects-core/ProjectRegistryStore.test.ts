import { describe, it, expect, beforeEach } from "bun:test";
import { ProjectRegistryStore } from "../../src/projects-core/ProjectRegistryStore";
import { InMemoryFileSystemAdapter } from "../../src";
import { ValidatedRepositoryPath } from "../../src/pure-core/types";

describe("ProjectRegistryStore", () => {
  let fs: InMemoryFileSystemAdapter;
  let store: ProjectRegistryStore;
  const homeDir = "/home/user";

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    store = new ProjectRegistryStore(fs, homeDir);
  });

  describe("registerProject", () => {
    it("registers a new project, deriving GitHub owner/name from remote", () => {
      const projectPath =
        "/home/user/projects/test-repo" as ValidatedRepositoryPath;
      const remoteUrl = "https://github.com/anthropic/my-app.git";

      const entry = store.registerProject(projectPath, remoteUrl);

      expect(entry.name).toBe("anthropic/my-app");
      expect(entry.path).toBe(projectPath);
      expect(entry.remoteUrl).toBe(remoteUrl);
      expect(entry.purl).toBe("pkg:github/anthropic/my-app");
      expect(entry.registeredAt).toBeDefined();

      const projects = store.listProjects();
      expect(projects).toHaveLength(1);
    });

    it("registers a project without a remote URL using path basename as name", () => {
      const projectPath =
        "/home/user/projects/local-repo" as ValidatedRepositoryPath;

      const entry = store.registerProject(projectPath);

      expect(entry.name).toBe("local-repo");
      expect(entry.path).toBe(projectPath);
      expect(entry.remoteUrl).toBeUndefined();
      expect(entry.purl).toBe("pkg:generic/local/home-user-projects-local-repo");
    });

    it("handles SSH GitHub URLs", () => {
      const projectPath =
        "/home/user/projects/test-repo" as ValidatedRepositoryPath;
      const remoteUrl = "git@github.com:griever/my-app.git";

      const entry = store.registerProject(projectPath, remoteUrl);

      expect(entry.name).toBe("griever/my-app");
      expect(entry.purl).toBe("pkg:github/griever/my-app");
    });

    it("falls back to path basename for non-GitHub URLs", () => {
      const projectPath =
        "/home/user/projects/my-local-repo" as ValidatedRepositoryPath;
      const remoteUrl = "https://gitlab.com/user/repo.git";

      const entry = store.registerProject(projectPath, remoteUrl);

      expect(entry.name).toBe("my-local-repo");
    });

    it("stores two clones of the same purl as sibling rows (no rename)", () => {
      const remoteUrl = "https://github.com/anthropic/my-app.git";
      const path1 = "/home/user/clone-a" as ValidatedRepositoryPath;
      const path2 = "/home/user/clone-b" as ValidatedRepositoryPath;

      const entry1 = store.registerProject(path1, remoteUrl);
      const entry2 = store.registerProject(path2, remoteUrl);

      // Both rows keep the same un-mutated name and the same purl.
      expect(entry1.name).toBe("anthropic/my-app");
      expect(entry2.name).toBe("anthropic/my-app");
      expect(entry1.purl).toBe(entry2.purl);

      const projects = store.listProjects();
      expect(projects).toHaveLength(2);
      expect(projects.map((p) => p.path).sort()).toEqual([path1, path2]);
    });

    it("re-registering the same path is idempotent (returns existing entry)", () => {
      const projectPath =
        "/home/user/projects/repo" as ValidatedRepositoryPath;
      const remoteUrl = "https://github.com/owner/repo.git";

      const first = store.registerProject(projectPath, remoteUrl);
      const second = store.registerProject(projectPath, remoteUrl);

      expect(second).toEqual(first);
      expect(store.listProjects()).toHaveLength(1);
    });

    it("allows two repos sharing a basename as long as paths differ", () => {
      const path1 = "/home/user/projects/anthropic-app" as ValidatedRepositoryPath;
      const path2 = "/home/user/projects/griever-app" as ValidatedRepositoryPath;

      const entry1 = store.registerProject(
        path1,
        "https://github.com/anthropic/my-app.git",
      );
      const entry2 = store.registerProject(
        path2,
        "https://github.com/griever/my-app.git",
      );

      expect(entry1.name).toBe("anthropic/my-app");
      expect(entry2.name).toBe("griever/my-app");
      expect(entry1.purl).not.toBe(entry2.purl);
      expect(store.listProjects()).toHaveLength(2);
    });

    it("generates unique PURLs for local-only repos at different paths", () => {
      const path1 = "/home/alice/repos/my-app" as ValidatedRepositoryPath;
      const path2 = "/home/bob/repos/my-app" as ValidatedRepositoryPath;

      const entry1 = store.registerProject(path1);
      const entry2 = store.registerProject(path2);

      expect(entry1.purl).toBe("pkg:generic/local/home-alice-repos-my-app");
      expect(entry2.purl).toBe("pkg:generic/local/home-bob-repos-my-app");
      expect(entry1.purl).not.toBe(entry2.purl);
    });
  });

  describe("listProjects", () => {
    it("returns empty array when no projects registered", () => {
      expect(store.listProjects()).toEqual([]);
    });

    it("returns all registered projects in registration order", () => {
      const path1 = "/home/user/projects/project1" as ValidatedRepositoryPath;
      const path2 = "/home/user/projects/project2" as ValidatedRepositoryPath;

      store.registerProject(path1, "https://github.com/user/project1.git");
      store.registerProject(path2);

      const projects = store.listProjects();
      expect(projects).toHaveLength(2);
      expect(projects[0].path).toBe(path1);
      expect(projects[0].remoteUrl).toBe(
        "https://github.com/user/project1.git",
      );
      expect(projects[1].path).toBe(path2);
      expect(projects[1].remoteUrl).toBeUndefined();
    });
  });

  describe("getByPath", () => {
    it("returns the project at a given path", () => {
      const projectPath =
        "/home/user/projects/my-project" as ValidatedRepositoryPath;
      const remoteUrl = "https://github.com/user/my-project.git";

      store.registerProject(projectPath, remoteUrl);

      const project = store.getByPath(projectPath);
      expect(project).toBeDefined();
      expect(project?.path).toBe(projectPath);
      expect(project?.remoteUrl).toBe(remoteUrl);
    });

    it("returns undefined for an unregistered path", () => {
      expect(
        store.getByPath("/nope" as ValidatedRepositoryPath),
      ).toBeUndefined();
    });
  });

  describe("removeByPath", () => {
    it("removes the project at the given path", () => {
      const projectPath =
        "/home/user/projects/to-remove" as ValidatedRepositoryPath;

      store.registerProject(projectPath);
      expect(store.listProjects()).toHaveLength(1);

      const removed = store.removeByPath(projectPath);
      expect(removed).toBe(true);
      expect(store.listProjects()).toHaveLength(0);
    });

    it("returns false when no project at path", () => {
      expect(
        store.removeByPath("/nope" as ValidatedRepositoryPath),
      ).toBe(false);
    });

    it("only removes the row at the specified path (siblings remain)", () => {
      const remoteUrl = "https://github.com/owner/repo.git";
      const path1 = "/home/user/clone1" as ValidatedRepositoryPath;
      const path2 = "/home/user/clone2" as ValidatedRepositoryPath;

      store.registerProject(path1, remoteUrl);
      store.registerProject(path2, remoteUrl);

      expect(store.removeByPath(path1)).toBe(true);
      const remaining = store.listProjects();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].path).toBe(path2);
    });
  });

  describe("removeAllByPurl", () => {
    it("removes every clone with the matching PURL", () => {
      const remoteUrl = "https://github.com/owner/repo.git";
      const path1 = "/home/user/clone1" as ValidatedRepositoryPath;
      const path2 = "/home/user/clone2" as ValidatedRepositoryPath;
      const otherPath = "/home/user/other" as ValidatedRepositoryPath;

      const e1 = store.registerProject(path1, remoteUrl);
      store.registerProject(path2, remoteUrl);
      store.registerProject(otherPath, "https://github.com/other/proj.git");

      const removed = store.removeAllByPurl(e1.purl!);
      expect(removed).toBe(2);
      expect(store.listProjects()).toHaveLength(1);
    });

    it("returns 0 when no rows match", () => {
      store.registerProject(
        "/home/user/repo" as ValidatedRepositoryPath,
        "https://github.com/owner/repo.git",
      );

      const removed = store.removeAllByPurl(
        "pkg:github/nope/nope" as never,
      );
      expect(removed).toBe(0);
      expect(store.listProjects()).toHaveLength(1);
    });
  });

  describe("updateByPath", () => {
    it("updates the project's remote URL", () => {
      const projectPath =
        "/home/user/projects/my-project" as ValidatedRepositoryPath;
      const oldRemote = "https://github.com/user/old.git";
      const newRemote = "https://github.com/user/new.git";

      store.registerProject(projectPath, oldRemote);
      store.updateByPath(projectPath, { remoteUrl: newRemote });

      const project = store.getByPath(projectPath);
      expect(project?.remoteUrl).toBe(newRemote);
    });

    it("clears remote URL when undefined passed", () => {
      const projectPath =
        "/home/user/projects/my-project" as ValidatedRepositoryPath;

      store.registerProject(projectPath, "https://github.com/user/p.git");
      store.updateByPath(projectPath, { remoteUrl: undefined });

      const project = store.getByPath(projectPath);
      expect(project?.remoteUrl).toBeUndefined();
    });

    it("allows updating the display name", () => {
      const projectPath =
        "/home/user/projects/my-project" as ValidatedRepositoryPath;

      store.registerProject(projectPath, "https://github.com/owner/repo.git");
      store.updateByPath(projectPath, { name: "Friendly Display Name" });

      expect(store.getByPath(projectPath)?.name).toBe("Friendly Display Name");
    });

    it("path is immutable — updates to path are silently ignored", () => {
      const projectPath =
        "/home/user/projects/my-project" as ValidatedRepositoryPath;

      store.registerProject(projectPath);
      store.updateByPath(projectPath, {
        path: "/somewhere/else" as ValidatedRepositoryPath,
      });

      expect(store.getByPath(projectPath)?.path).toBe(projectPath);
    });

    it("throws when no project exists at the given path", () => {
      expect(() => {
        store.updateByPath("/nope" as ValidatedRepositoryPath, {
          remoteUrl: "x",
        });
      }).toThrow(`No project registered at path '/nope'`);
    });
  });

  describe("findClonesByGitHubId", () => {
    it("finds all clones with matching github.id", () => {
      const remoteUrl = "https://github.com/anthropic/my-app.git";
      const path1 = "/home/user/clone1" as ValidatedRepositoryPath;
      const path2 = "/home/user/clone2" as ValidatedRepositoryPath;

      store.registerProject(path1, remoteUrl);
      store.registerProject(path2, remoteUrl);

      const githubMeta = {
        id: "anthropic/my-app",
        owner: "anthropic",
        name: "my-app",
        stars: 100,
        lastUpdated: new Date().toISOString(),
      };
      store.updateByPath(path1, { github: githubMeta });
      store.updateByPath(path2, { github: githubMeta });

      const clones = store.findClonesByGitHubId("anthropic/my-app");
      expect(clones).toHaveLength(2);
      expect(clones.map((c) => c.path).sort()).toEqual([path1, path2]);
    });

    it("returns empty array when no clones found", () => {
      expect(store.findClonesByGitHubId("nonexistent/repo")).toEqual([]);
    });
  });

  describe("findClonesByPurl", () => {
    it("finds all rows sharing the same purl", () => {
      const remoteUrl = "https://github.com/anthropic/my-app.git";
      const path1 = "/home/user/clone1" as ValidatedRepositoryPath;
      const path2 = "/home/user/clone2" as ValidatedRepositoryPath;

      const entry = store.registerProject(path1, remoteUrl);
      store.registerProject(path2, remoteUrl);

      const clones = store.findClonesByPurl(entry.purl!);
      expect(clones).toHaveLength(2);
    });
  });

  describe("persistence", () => {
    it("persists projects across store instances", () => {
      const projectPath =
        "/home/user/projects/persistent" as ValidatedRepositoryPath;

      store.registerProject(projectPath);

      const newStore = new ProjectRegistryStore(fs, homeDir);
      const projects = newStore.listProjects();

      expect(projects).toHaveLength(1);
      expect(projects[0].path).toBe(projectPath);
    });

    it("handles a corrupted registry file gracefully", () => {
      const registryPath = "/home/user/.alexandria/projects.json";
      fs.createDir("/home/user/.alexandria");
      fs.writeFile(registryPath, "invalid json content");

      expect(store.listProjects()).toEqual([]);

      const projectPath = "/home/user/projects/test" as ValidatedRepositoryPath;
      store.registerProject(projectPath);
      expect(store.listProjects()).toHaveLength(1);
    });
  });
});
