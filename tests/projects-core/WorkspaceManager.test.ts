import { describe, it, expect, beforeEach } from "bun:test";
import { WorkspaceManager } from "../../src/projects-core/WorkspaceManager";
import { ProjectRegistryStore } from "../../src/projects-core/ProjectRegistryStore";
import { InMemoryFileSystemAdapter } from "../../src";
import { ValidatedRepositoryPath } from "../../src/pure-core/types";
import type { AlexandriaEntry } from "../../src/pure-core/types/repository";
import type { Purl } from "../../src/pure-core/utils/purl";

const purl = (s: string): Purl => s as Purl;

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
      it("creates a new workspace with all fields", async () => {
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

      it("creates a minimal workspace", async () => {
        const workspace = await manager.createWorkspace({
          name: "Simple Workspace",
        });

        expect(workspace.id).toMatch(/^ws-\d+-[a-z0-9]+$/);
        expect(workspace.name).toBe("Simple Workspace");
        expect(workspace.description).toBeUndefined();
        expect(workspace.isDefault).toBeUndefined();
      });

      it("unsets previous default when creating new default workspace", async () => {
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
      it("retrieves an existing workspace", async () => {
        const created = await manager.createWorkspace({
          name: "Test Workspace",
        });

        const retrieved = await manager.getWorkspace(created.id);

        expect(retrieved).toEqual(created);
      });

      it("returns null for non-existent workspace", async () => {
        const result = await manager.getWorkspace("non-existent-id");
        expect(result).toBeNull();
      });
    });

    describe("getWorkspaces", () => {
      it("returns empty array when no workspaces exist", async () => {
        const workspaces = await manager.getWorkspaces();
        expect(workspaces).toEqual([]);
      });

      it("returns all workspaces", async () => {
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
      it("updates workspace properties", async () => {
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

      it("throws when updating non-existent workspace", async () => {
        await expect(
          manager.updateWorkspace("non-existent", { name: "New Name" }),
        ).rejects.toThrow("Workspace with id 'non-existent' not found");
      });

      it("unsets previous default when updating to default", async () => {
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
      it("deletes an existing workspace", async () => {
        const workspace = await manager.createWorkspace({ name: "To Delete" });

        const deleted = await manager.deleteWorkspace(workspace.id);
        expect(deleted).toBe(true);

        const retrieved = await manager.getWorkspace(workspace.id);
        expect(retrieved).toBeNull();
      });

      it("returns false when deleting non-existent workspace", async () => {
        const deleted = await manager.deleteWorkspace("non-existent");
        expect(deleted).toBe(false);
      });

      it("deletes associated memberships", async () => {
        const workspace = await manager.createWorkspace({
          name: "To Delete With Memberships",
        });

        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo1"),
          workspace.id,
        );
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo2"),
          workspace.id,
        );

        const memberships = await manager.getWorkspaceMemberships(workspace.id);
        expect(memberships).toHaveLength(2);

        await manager.deleteWorkspace(workspace.id);

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
      it("adds a repository by PURL", async () => {
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo"),
          workspaceId,
        );

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(1);
        expect(memberships[0].repositoryId).toBe(
          purl("pkg:github/owner/repo"),
        );
        expect(memberships[0].workspaceId).toBe(workspaceId);
        expect(memberships[0].addedAt).toBeGreaterThan(0);
      });

      it("adds a repository by entry with GitHub metadata", async () => {
        const entry: AlexandriaEntry = {
          name: "local-name",
          path: "/home/user/repos/test" as ValidatedRepositoryPath,
          registeredAt: new Date().toISOString(),
          purl: purl("pkg:github/owner/repo"),
          github: {
            id: "owner/repo",
            purl: purl("pkg:github/owner/repo"),
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
        expect(memberships[0].repositoryId).toBe(
          purl("pkg:github/owner/repo"),
        );
      });

      it("adds a repository by entry without GitHub metadata", async () => {
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
        expect(memberships[0].repositoryId).toBe(
          purl("pkg:generic/local/home-user-repos-local"),
        );
      });

      it("attaches metadata to membership", async () => {
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo"),
          workspaceId,
          { pinned: true, notes: "Important repo" },
        );

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships[0].metadata).toEqual({
          pinned: true,
          notes: "Important repo",
        });
      });

      it("does not create duplicate memberships", async () => {
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo"),
          workspaceId,
        );
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo"),
          workspaceId,
        );

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(1);
      });

      it("updates metadata on duplicate add", async () => {
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo"),
          workspaceId,
          { pinned: false },
        );

        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo"),
          workspaceId,
          { pinned: true, notes: "Updated" },
        );

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
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo1"),
          workspaceId,
        );
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo2"),
          workspaceId,
        );
      });

      it("removes a repository by PURL", async () => {
        await manager.removeRepositoryFromWorkspace(
          purl("pkg:github/owner/repo1"),
          workspaceId,
        );

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(1);
        expect(memberships[0].repositoryId).toBe(
          purl("pkg:github/owner/repo2"),
        );
      });

      it("handles removing non-existent membership", async () => {
        await manager.removeRepositoryFromWorkspace(
          purl("pkg:github/owner/non-existent"),
          workspaceId,
        );

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(2);
      });
    });

    describe("getWorkspaceMemberships", () => {
      it("returns empty array for workspace with no members", async () => {
        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toEqual([]);
      });

      it("returns all memberships for a workspace", async () => {
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo1"),
          workspaceId,
        );
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo2"),
          workspaceId,
        );
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo3"),
          workspaceId,
        );

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(3);
        expect(memberships.map((m) => m.repositoryId).sort()).toEqual([
          "pkg:github/owner/repo1",
          "pkg:github/owner/repo2",
          "pkg:github/owner/repo3",
        ] as Purl[]);
      });
    });

    describe("getRepositoryWorkspaces", () => {
      it("returns workspaces containing a repository", async () => {
        const ws1 = await manager.createWorkspace({ name: "Workspace 1" });
        const ws2 = await manager.createWorkspace({ name: "Workspace 2" });
        await manager.createWorkspace({ name: "Workspace 3" });

        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo"),
          ws1.id,
        );
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo"),
          ws2.id,
        );

        const workspaces = await manager.getRepositoryWorkspaces(
          purl("pkg:github/owner/repo"),
        );
        expect(workspaces).toHaveLength(2);
        expect(workspaces.map((w) => w.id).sort()).toEqual(
          [ws1.id, ws2.id].sort(),
        );
      });

      it("returns empty array if repository not in any workspace", async () => {
        const workspaces = await manager.getRepositoryWorkspaces(
          purl("pkg:github/owner/non-existent"),
        );
        expect(workspaces).toEqual([]);
      });
    });
  });

  describe("Query Methods", () => {
    let workspaceId: string;
    const repo1Path = "/home/user/repos/repo1" as ValidatedRepositoryPath;
    const repo2Path = "/home/user/repos/repo2" as ValidatedRepositoryPath;

    beforeEach(async () => {
      const workspace = await manager.createWorkspace({
        name: "Test Workspace",
      });
      workspaceId = workspace.id;

      projectRegistry.registerProject(
        repo1Path,
        "https://github.com/owner/repo1.git",
      );
      projectRegistry.registerProject(
        repo2Path,
        "https://github.com/owner/repo2.git",
      );
      projectRegistry.registerProject(
        "/home/user/repos/local" as ValidatedRepositoryPath,
      );
    });

    describe("getRepositoriesInWorkspace", () => {
      it("returns all entries for repositories in workspace", async () => {
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo1"),
          workspaceId,
        );
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo2"),
          workspaceId,
        );

        const repos = await manager.getRepositoriesInWorkspace(
          workspaceId,
          projectRegistry,
        );

        expect(repos).toHaveLength(2);
        expect(repos.map((r) => r.path).sort()).toEqual([
          repo1Path,
          repo2Path,
        ]);
      });

      it("returns empty array for workspace with no repositories", async () => {
        const repos = await manager.getRepositoriesInWorkspace(
          workspaceId,
          projectRegistry,
        );
        expect(repos).toEqual([]);
      });
    });

    describe("isRepositoryInWorkspace", () => {
      it("returns true if repository is in workspace", async () => {
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo"),
          workspaceId,
        );

        const isIn = await manager.isRepositoryInWorkspace(
          purl("pkg:github/owner/repo"),
          workspaceId,
        );
        expect(isIn).toBe(true);
      });

      it("returns false if repository is not in workspace", async () => {
        const isIn = await manager.isRepositoryInWorkspace(
          purl("pkg:github/owner/repo"),
          workspaceId,
        );
        expect(isIn).toBe(false);
      });
    });

    describe("getWorkspaceStats", () => {
      it("returns correct statistics", async () => {
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo1"),
          workspaceId,
        );
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo2"),
          workspaceId,
        );

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
      it("adds multiple repositories at once", async () => {
        await manager.addRepositoriesToWorkspace(
          [
            purl("pkg:github/owner/repo1"),
            purl("pkg:github/owner/repo2"),
            purl("pkg:github/owner/repo3"),
          ],
          workspaceId,
        );

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(3);
      });
    });

    describe("removeRepositoriesFromWorkspace", () => {
      beforeEach(async () => {
        await manager.addRepositoriesToWorkspace(
          [
            purl("pkg:github/owner/repo1"),
            purl("pkg:github/owner/repo2"),
            purl("pkg:github/owner/repo3"),
          ],
          workspaceId,
        );
      });

      it("removes multiple repositories at once", async () => {
        await manager.removeRepositoriesFromWorkspace(
          [purl("pkg:github/owner/repo1"), purl("pkg:github/owner/repo3")],
          workspaceId,
        );

        const memberships = await manager.getWorkspaceMemberships(workspaceId);
        expect(memberships).toHaveLength(1);
        expect(memberships[0].repositoryId).toBe(
          purl("pkg:github/owner/repo2"),
        );
      });
    });
  });

  describe("Default Workspace", () => {
    describe("getDefaultWorkspace", () => {
      it("returns null when no default workspace exists", async () => {
        const defaultWs = await manager.getDefaultWorkspace();
        expect(defaultWs).toBeNull();
      });

      it("returns the default workspace", async () => {
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
      it("sets a workspace as default", async () => {
        const workspace = await manager.createWorkspace({ name: "Workspace" });

        await manager.setDefaultWorkspace(workspace.id);

        const defaultWs = await manager.getDefaultWorkspace();
        expect(defaultWs?.id).toBe(workspace.id);
      });

      it("unsets previous default", async () => {
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

      it("throws for non-existent workspace", async () => {
        await expect(
          manager.setDefaultWorkspace("non-existent"),
        ).rejects.toThrow("Workspace with id 'non-existent' not found");
      });
    });
  });

  describe("Cleanup Methods", () => {
    describe("cleanupRepositoryMemberships", () => {
      it("removes all memberships for a repository", async () => {
        const ws1 = await manager.createWorkspace({ name: "Workspace 1" });
        const ws2 = await manager.createWorkspace({ name: "Workspace 2" });

        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo"),
          ws1.id,
        );
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/repo"),
          ws2.id,
        );
        await manager.addRepositoryToWorkspace(
          purl("pkg:github/owner/other"),
          ws1.id,
        );

        await manager.cleanupRepositoryMemberships(
          purl("pkg:github/owner/repo"),
        );

        const ws1Memberships = await manager.getWorkspaceMemberships(ws1.id);
        const ws2Memberships = await manager.getWorkspaceMemberships(ws2.id);

        expect(ws1Memberships).toHaveLength(1);
        expect(ws1Memberships[0].repositoryId).toBe(
          purl("pkg:github/owner/other"),
        );
        expect(ws2Memberships).toHaveLength(0);
      });

      it("handles cleanup for non-existent repository", async () => {
        await manager.cleanupRepositoryMemberships(
          purl("pkg:github/owner/non-existent"),
        );
        // should not throw
      });
    });
  });
});
