import { describe, it, expect, beforeEach } from "bun:test";
import { WorkspaceManager } from "../../src/projects-core/WorkspaceManager";
import { ProjectRegistryStore } from "../../src/projects-core/ProjectRegistryStore";
import { InMemoryFileSystemAdapter } from "../../src";
import { ValidatedRepositoryPath } from "../../src/pure-core/types";
import type { AlexandriaEntry } from "../../src/pure-core/types/repository";
import type { Purl } from "../../src/pure-core/utils/purl";

describe("WorkspaceManager", () => {
  let fs: InMemoryFileSystemAdapter;
  let manager: WorkspaceManager;
  let projectRegistry: ProjectRegistryStore;
  const alexandriaPath = "/home/user/.alexandria";
  const homeDir = "/home/user";

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    manager = new WorkspaceManager(alexandriaPath, fs);
    projectRegistry = new ProjectRegistryStore(fs, homeDir);
  });

  describe("Workspace CRUD", () => {
    describe("createWorkspace", () => {
      it("should create a new workspace with all fields", async () => {
        const workspace = await manager.createWorkspace({
          name: "Active Projects",
          description: "Projects I'm working on",
          theme: "green",
          icon: "folder",
          isDefault: true,
          suggestedClonePath: "/home/user/active",
          metadata: { custom: "value" },
        });

        expect(workspace.id).toMatch(/^ws-\d+-[a-z0-9]+$/);
        expect(workspace.name).toBe("Active Projects");
        expect(workspace.description).toBe("Projects I'm working on");
        expect(workspace.theme).toBe("green");
        expect(workspace.icon).toBe("folder");
        expect(workspace.isDefault).toBe(true);
        expect(workspace.suggestedClonePath).toBe("/home/user/active");
        expect(workspace.metadata).toEqual({ custom: "value" });
        expect(workspace.createdAt).toBeGreaterThan(0);
        expect(workspace.updatedAt).toBeGreaterThan(0);
      });

      it("should create a minimal workspace", async () => {
        const workspace = await manager.createWorkspace({
          name: "Simple Workspace",
        });

        expect(workspace.id).toMatch(/^ws-\d+-[a-z0-9]+$/);
        expect(workspace.name).toBe("Simple Workspace");
        expect(workspace.description).toBeUndefined();
        expect(workspace.isDefault).toBeUndefined();
      });

      it("should unset previous default when creating new default workspace", async () => {
        const ws1 = await manager.createWorkspace({
          name: "First",
          isDefault: true,
        });

        const ws2 = await manager.createWorkspace({
          name: "Second",
          isDefault: true,
        });

        const allWorkspaces = await manager.getWorkspaces();
        const firstWorkspace = allWorkspaces.find((w) => w.id === ws1.id);
        const secondWorkspace = allWorkspaces.find((w) => w.id === ws2.id);

        expect(firstWorkspace?.isDefault).toBe(false);
        expect(secondWorkspace?.isDefault).toBe(true);
      });
    });

    describe("getWorkspace", () => {
      it("should retrieve an existing workspace", async () => {
        const created = await manager.createWorkspace({
          name: "Test Workspace",
        });

        const retrieved = await manager.getWorkspace(created.id);

        expect(retrieved).toEqual(created);
      });

      it("should return null for non-existent workspace", async () => {
        const result = await manager.getWorkspace("non-existent-id");
        expect(result).toBeNull();
      });
    });

    describe("getWorkspaces", () => {
      it("should return empty array when no workspaces exist", async () => {
        const workspaces = await manager.getWorkspaces();
        expect(workspaces).toEqual([]);
      });

      it("should return all workspaces", async () => {
        await manager.createWorkspace({ name: "Workspace 1" });
        await manager.createWorkspace({ name: "Workspace 2" });
        await manager.createWorkspace({ name: "Workspace 3" });

        const workspaces = await manager.getWorkspaces();
        expect(workspaces).toHaveLength(3);
        expect(workspaces.map((w) => w.name)).toEqual([
          "Workspace 1",
          "Workspace 2",
          "Workspace 3",
        ]);
      });
    });

    describe("updateWorkspace", () => {
      it("should update workspace properties", async () => {
        const workspace = await manager.createWorkspace({
          name: "Original Name",
          description: "Original Description",
        });

        const updated = await manager.updateWorkspace(workspace.id, {
          name: "Updated Name",
          description: "Updated Description",
          theme: "red",
        });

        expect(updated.name).toBe("Updated Name");
        expect(updated.description).toBe("Updated Description");
        expect(updated.theme).toBe("red");
        expect(updated.updatedAt).toBeGreaterThanOrEqual(workspace.updatedAt);
      });

      it("should throw error when updating non-existent workspace", async () => {
        await expect(
          manager.updateWorkspace("non-existent", { name: "New Name" }),
        ).rejects.toThrow("Workspace with id 'non-existent' not found");
      });

      it("should unset previous default when updating to default", async () => {
        const ws1 = await manager.createWorkspace({
          name: "First",
          isDefault: true,
        });
        const ws2 = await manager.createWorkspace({ name: "Second" });

        await manager.updateWorkspace(ws2.id, { isDefault: true });

        const allWorkspaces = await manager.getWorkspaces();
        const firstWorkspace = allWorkspaces.find((w) => w.id === ws1.id);
        const secondWorkspace = allWorkspaces.find((w) => w.id === ws2.id);

        expect(firstWorkspace?.isDefault).toBe(false);
        expect(secondWorkspace?.isDefault).toBe(true);
      });
    });

    describe("deleteWorkspace", () => {
      it("should delete an existing workspace", async () => {
        const workspace = await manager.createWorkspace({ name: "To Delete" });

        const deleted = await manager.deleteWorkspace(workspace.id);
        expect(deleted).toBe(true);

        const retrieved = await manager.getWorkspace(workspace.id);
        expect(retrieved).toBeNull();
      });

      it("should return false when deleting non-existent workspace", async () => {
        const deleted = await manager.deleteWorkspace("non-existent");
        expect(deleted).toBe(false);
      });

      it("should delete associated memberships", async () => {
        const workspace = await manager.createWorkspace({
          name: "To Delete With Memberships",
        });

        // Add some memberships
        await manager.addRepositoryToWorkspace("owner/repo1", workspace.id);
        await manager.addRepositoryToWorkspace("owner/repo2", workspace.id);

        // Verify memberships exist
        const memberships = await manager.getWorkspaceMemberships(workspace.id);
        expect(memberships).toHaveLength(2);

        // Delete workspace
        await manager.deleteWorkspace(workspace.id);

        // Verify memberships are gone
        const remainingMemberships = await manager.getWorkspaceMemberships(
          workspace.id,
        );
        expect(remainingMemberships).toHaveLength(0);
      });
    });
  });

  describe("Membership Management", () => {
    let workspaceId: string;

    beforeEach(async () => {
      const workspace = await manager.createWorkspace({
        name: "Test Workspace",
      });
      workspaceId = workspace.id;
    });

    describe("addRepositoryToWorkspace", () => {
      it("should add a repository by ID string (PURL format)", async () => {
        await manager.addRepositoryToWorkspace("pkg:github/owner/repo", workspaceId);

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(1);
        expect(memberships[0].repositoryId).toBe("pkg:github/owner/repo");
        expect(memberships[0].workspaceId).toBe(workspaceId);
        expect(memberships[0].addedAt).toBeGreaterThan(0);
      });

      it("should add a repository by entry with GitHub metadata", async () => {
        const entry: AlexandriaEntry = {
          name: "local-name",
          path: "/home/user/repos/test" as ValidatedRepositoryPath,
          registeredAt: new Date().toISOString(),
          purl: "pkg:github/owner/repo" as Purl,
          github: {
            id: "owner/repo",
            purl: "pkg:github/owner/repo" as Purl,
            owner: "owner",
            name: "repo",
            stars: 100,
            lastUpdated: new Date().toISOString(),
          },
          hasViews: false,
          viewCount: 0,
          views: [],
        };

        await manager.addRepositoryToWorkspace(entry, workspaceId);

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(1);
        expect(memberships[0].repositoryId).toBe("pkg:github/owner/repo");
      });

      it("should add a repository by entry without GitHub metadata", async () => {
        const entry: AlexandriaEntry = {
          name: "local-only-repo",
          path: "/home/user/repos/local" as ValidatedRepositoryPath,
          registeredAt: new Date().toISOString(),
          hasViews: false,
          viewCount: 0,
          views: [],
        };

        await manager.addRepositoryToWorkspace(entry, workspaceId);

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(1);
        expect(memberships[0].repositoryId).toBe("pkg:generic/local/home-user-repos-local");
      });

      it("should add metadata to membership", async () => {
        await manager.addRepositoryToWorkspace("owner/repo", workspaceId, {
          pinned: true,
          notes: "Important repo",
        });

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships[0].metadata).toEqual({
          pinned: true,
          notes: "Important repo",
        });
      });

      it("should not create duplicate memberships", async () => {
        await manager.addRepositoryToWorkspace("owner/repo", workspaceId);
        await manager.addRepositoryToWorkspace("owner/repo", workspaceId);

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(1);
      });

      it("should update metadata on duplicate add", async () => {
        await manager.addRepositoryToWorkspace("owner/repo", workspaceId, {
          pinned: false,
        });

        await manager.addRepositoryToWorkspace("owner/repo", workspaceId, {
          pinned: true,
          notes: "Updated",
        });

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(1);
        expect(memberships[0].metadata).toEqual({
          pinned: true,
          notes: "Updated",
        });
      });
    });

    describe("removeRepositoryFromWorkspace", () => {
      beforeEach(async () => {
        await manager.addRepositoryToWorkspace("pkg:github/owner/repo1", workspaceId);
        await manager.addRepositoryToWorkspace("pkg:github/owner/repo2", workspaceId);
      });

      it("should remove a repository by ID string", async () => {
        await manager.removeRepositoryFromWorkspace("pkg:github/owner/repo1", workspaceId);

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(1);
        expect(memberships[0].repositoryId).toBe("pkg:github/owner/repo2");
      });

      it("should handle removing non-existent membership", async () => {
        await manager.removeRepositoryFromWorkspace(
          "owner/non-existent",
          workspaceId,
        );

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(2);
      });
    });

    describe("getWorkspaceMemberships", () => {
      it("should return empty array for workspace with no members", async () => {
        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toEqual([]);
      });

      it("should return all memberships for a workspace", async () => {
        await manager.addRepositoryToWorkspace("pkg:github/owner/repo1", workspaceId);
        await manager.addRepositoryToWorkspace("pkg:github/owner/repo2", workspaceId);
        await manager.addRepositoryToWorkspace("pkg:github/owner/repo3", workspaceId);

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(3);
        expect(memberships.map((m) => m.repositoryId).sort()).toEqual([
          "pkg:github/owner/repo1",
          "pkg:github/owner/repo2",
          "pkg:github/owner/repo3",
        ]);
      });
    });

    describe("getRepositoryWorkspaces", () => {
      it("should return workspaces containing a repository", async () => {
        const ws1 = await manager.createWorkspace({ name: "Workspace 1" });
        const ws2 = await manager.createWorkspace({ name: "Workspace 2" });
        await manager.createWorkspace({ name: "Workspace 3" });

        await manager.addRepositoryToWorkspace("owner/repo", ws1.id);
        await manager.addRepositoryToWorkspace("owner/repo", ws2.id);

        const workspaces = await manager.getRepositoryWorkspaces("owner/repo");
        expect(workspaces).toHaveLength(2);
        expect(workspaces.map((w) => w.id).sort()).toEqual(
          [ws1.id, ws2.id].sort(),
        );
      });

      it("should return empty array if repository not in any workspace", async () => {
        const workspaces =
          await manager.getRepositoryWorkspaces("owner/non-existent");
        expect(workspaces).toEqual([]);
      });
    });
  });

  describe("Query Methods", () => {
    let workspaceId: string;

    beforeEach(async () => {
      const workspace = await manager.createWorkspace({
        name: "Test Workspace",
      });
      workspaceId = workspace.id;

      // Register some projects
      projectRegistry.registerProject(
        "repo1",
        "/home/user/repos/repo1" as ValidatedRepositoryPath,
        "https://github.com/owner/repo1.git",
      );

      projectRegistry.registerProject(
        "repo2",
        "/home/user/repos/repo2" as ValidatedRepositoryPath,
        "https://github.com/owner/repo2.git",
      );

      projectRegistry.registerProject(
        "local-repo",
        "/home/user/repos/local" as ValidatedRepositoryPath,
      );
    });

    describe("getRepositoriesInWorkspace", () => {
      it("should return all entries for repositories in workspace", async () => {
        // Update projects with github metadata and PURL
        projectRegistry.updateProject("repo1", {
          purl: "pkg:github/owner/repo1" as Purl,
          github: {
            id: "owner/repo1",
            purl: "pkg:github/owner/repo1" as Purl,
            owner: "owner",
            name: "repo1",
            stars: 100,
            lastUpdated: new Date().toISOString(),
          },
        });

        projectRegistry.updateProject("repo2", {
          purl: "pkg:github/owner/repo2" as Purl,
          github: {
            id: "owner/repo2",
            purl: "pkg:github/owner/repo2" as Purl,
            owner: "owner",
            name: "repo2",
            stars: 100,
            lastUpdated: new Date().toISOString(),
          },
        });

        // Add repos to workspace
        await manager.addRepositoryToWorkspace("pkg:github/owner/repo1", workspaceId);
        await manager.addRepositoryToWorkspace("pkg:github/owner/repo2", workspaceId);

        const repos = await manager.getRepositoriesInWorkspace(
          workspaceId,
          projectRegistry,
        );

        expect(repos).toHaveLength(2);
        expect(repos.map((r) => r.name).sort()).toEqual(["repo1", "repo2"]);
      });

      it("should return empty array for workspace with no repositories", async () => {
        const repos = await manager.getRepositoriesInWorkspace(
          workspaceId,
          projectRegistry,
        );
        expect(repos).toEqual([]);
      });
    });

    describe("isRepositoryInWorkspace", () => {
      it("should return true if repository is in workspace", async () => {
        await manager.addRepositoryToWorkspace("pkg:github/owner/repo", workspaceId);

        const isIn = await manager.isRepositoryInWorkspace(
          "pkg:github/owner/repo",
          workspaceId,
        );
        expect(isIn).toBe(true);
      });

      it("should return false if repository is not in workspace", async () => {
        const isIn = await manager.isRepositoryInWorkspace(
          "pkg:github/owner/repo",
          workspaceId,
        );
        expect(isIn).toBe(false);
      });
    });

    describe("getWorkspaceStats", () => {
      it("should return correct statistics", async () => {
        // Add repos to workspace
        await manager.addRepositoryToWorkspace("pkg:github/owner/repo1", workspaceId);
        await manager.addRepositoryToWorkspace("pkg:github/owner/repo2", workspaceId);

        const stats = await manager.getWorkspaceStats(
          workspaceId,
          projectRegistry,
        );

        expect(stats.repositoryCount).toBe(2);
        expect(stats.lastUpdated).toBeGreaterThan(0);
      });
    });
  });

  describe("Bulk Operations", () => {
    let workspaceId: string;

    beforeEach(async () => {
      const workspace = await manager.createWorkspace({
        name: "Test Workspace",
      });
      workspaceId = workspace.id;
    });

    describe("addRepositoriesToWorkspace", () => {
      it("should add multiple repositories at once", async () => {
        await manager.addRepositoriesToWorkspace(
          ["owner/repo1", "owner/repo2", "owner/repo3"],
          workspaceId,
        );

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(3);
      });
    });

    describe("removeRepositoriesFromWorkspace", () => {
      beforeEach(async () => {
        await manager.addRepositoriesToWorkspace(
          ["pkg:github/owner/repo1", "pkg:github/owner/repo2", "pkg:github/owner/repo3"],
          workspaceId,
        );
      });

      it("should remove multiple repositories at once", async () => {
        await manager.removeRepositoriesFromWorkspace(
          ["pkg:github/owner/repo1", "pkg:github/owner/repo3"],
          workspaceId,
        );

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(1);
        expect(memberships[0].repositoryId).toBe("pkg:github/owner/repo2");
      });
    });
  });

  describe("Default Workspace", () => {
    describe("getDefaultWorkspace", () => {
      it("should return null when no default workspace exists", async () => {
        const defaultWs = await manager.getDefaultWorkspace();
        expect(defaultWs).toBeNull();
      });

      it("should return the default workspace", async () => {
        await manager.createWorkspace({ name: "Not Default" });
        const defaultWorkspace = await manager.createWorkspace({
          name: "Default",
          isDefault: true,
        });

        const result = await manager.getDefaultWorkspace();
        expect(result?.id).toBe(defaultWorkspace.id);
      });
    });

    describe("setDefaultWorkspace", () => {
      it("should set a workspace as default", async () => {
        const workspace = await manager.createWorkspace({ name: "Workspace" });

        await manager.setDefaultWorkspace(workspace.id);

        const defaultWs = await manager.getDefaultWorkspace();
        expect(defaultWs?.id).toBe(workspace.id);
      });

      it("should unset previous default", async () => {
        const ws1 = await manager.createWorkspace({
          name: "First",
          isDefault: true,
        });
        const ws2 = await manager.createWorkspace({ name: "Second" });

        await manager.setDefaultWorkspace(ws2.id);

        const allWorkspaces = await manager.getWorkspaces();
        const first = allWorkspaces.find((w) => w.id === ws1.id);
        const second = allWorkspaces.find((w) => w.id === ws2.id);

        expect(first?.isDefault).toBe(false);
        expect(second?.isDefault).toBe(true);
      });

      it("should throw error for non-existent workspace", async () => {
        await expect(
          manager.setDefaultWorkspace("non-existent"),
        ).rejects.toThrow("Workspace with id 'non-existent' not found");
      });
    });
  });

  describe("Cleanup Methods", () => {
    describe("cleanupRepositoryMemberships", () => {
      it("should remove all memberships for a repository", async () => {
        const ws1 = await manager.createWorkspace({ name: "Workspace 1" });
        const ws2 = await manager.createWorkspace({ name: "Workspace 2" });

        await manager.addRepositoryToWorkspace("pkg:github/owner/repo", ws1.id);
        await manager.addRepositoryToWorkspace("pkg:github/owner/repo", ws2.id);
        await manager.addRepositoryToWorkspace("pkg:github/owner/other", ws1.id);

        await manager.cleanupRepositoryMemberships("pkg:github/owner/repo");

        const ws1Memberships = await manager.getWorkspaceMemberships(ws1.id);
        const ws2Memberships = await manager.getWorkspaceMemberships(ws2.id);

        expect(ws1Memberships).toHaveLength(1);
        expect(ws1Memberships[0].repositoryId).toBe("pkg:github/owner/other");
        expect(ws2Memberships).toHaveLength(0);
      });

      it("should handle cleanup for non-existent repository", async () => {
        await manager.cleanupRepositoryMemberships("pkg:github/owner/non-existent");
        // Should not throw
      });
    });
  });
});
