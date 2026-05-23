import { describe, it, expect, beforeEach } from "bun:test";
import { TopicManager } from "../../src/projects-core/TopicManager";
import { InMemoryFileSystemAdapter } from "../../src";

describe("TopicManager", () => {
  let fs: InMemoryFileSystemAdapter;
  let manager: TopicManager;
  const alexandriaPath = "/home/user/.alexandria";

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    manager = new TopicManager(alexandriaPath, fs);
  });

  describe("Topic CRUD", () => {
    describe("createTopic", () => {
      it("creates a topic with generated id + ISO timestamps when not supplied", async () => {
        const topic = await manager.createTopic({
          title: "Auth & sessions",
          description: "Across services",
          trailIds: [],
        });

        expect(topic.id).toMatch(/^topic-\d+-[a-z0-9]+$/);
        expect(topic.title).toBe("Auth & sessions");
        expect(topic.description).toBe("Across services");
        expect(topic.trailIds).toEqual([]);
        expect(new Date(topic.createdAt).toString()).not.toBe("Invalid Date");
        expect(topic.createdAt).toBe(topic.updatedAt);
      });

      it("honors caller-supplied id + timestamps (e.g. for round-tripping a remote)", async () => {
        const topic = await manager.createTopic({
          id: "topic-server-123",
          title: "Imported",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          trailIds: ["t1", "t2"],
        });

        expect(topic.id).toBe("topic-server-123");
        expect(topic.createdAt).toBe("2026-01-01T00:00:00.000Z");
        expect(topic.updatedAt).toBe("2026-01-02T00:00:00.000Z");
        expect(topic.trailIds).toEqual(["t1", "t2"]);
      });

      it("rejects duplicate ids", async () => {
        await manager.createTopic({ id: "dup", title: "A", trailIds: [] });
        await expect(
          manager.createTopic({ id: "dup", title: "B", trailIds: [] }),
        ).rejects.toThrow(/already exists/);
      });
    });

    describe("getTopic / getTopics", () => {
      it("returns null for a missing topic", async () => {
        expect(await manager.getTopic("nope")).toBeNull();
      });

      it("lists all topics in insertion order", async () => {
        await manager.createTopic({ id: "a", title: "A", trailIds: [] });
        await manager.createTopic({ id: "b", title: "B", trailIds: [] });
        const topics = await manager.getTopics();
        expect(topics.map((t) => t.id)).toEqual(["a", "b"]);
      });
    });

    describe("updateTopic", () => {
      it("patches title + description and bumps updatedAt", async () => {
        const created = await manager.createTopic({
          id: "x",
          title: "Old",
          trailIds: [],
        });
        // Force a measurable gap so updatedAt strictly moves forward.
        await new Promise((r) => setTimeout(r, 2));
        const updated = await manager.updateTopic("x", {
          title: "New",
          description: "Now with detail",
        });

        expect(updated.title).toBe("New");
        expect(updated.description).toBe("Now with detail");
        expect(updated.createdAt).toBe(created.createdAt);
        expect(
          new Date(updated.updatedAt).getTime(),
        ).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());
      });

      it("throws when topic does not exist", async () => {
        await expect(
          manager.updateTopic("missing", { title: "x" }),
        ).rejects.toThrow(/not found/);
      });
    });

    describe("deleteTopic", () => {
      it("removes the topic and returns true", async () => {
        await manager.createTopic({ id: "x", title: "X", trailIds: [] });
        expect(await manager.deleteTopic("x")).toBe(true);
        expect(await manager.getTopic("x")).toBeNull();
      });

      it("returns false when the topic does not exist", async () => {
        expect(await manager.deleteTopic("missing")).toBe(false);
      });
    });
  });

  describe("Trail membership", () => {
    beforeEach(async () => {
      await manager.createTopic({ id: "t", title: "T", trailIds: [] });
    });

    describe("addTrailToTopic", () => {
      it("appends a trail and bumps updatedAt", async () => {
        const before = await manager.getTopic("t");
        await new Promise((r) => setTimeout(r, 2));
        const after = await manager.addTrailToTopic("t", "trail-1");

        expect(after.trailIds).toEqual(["trail-1"]);
        expect(
          new Date(after.updatedAt).getTime(),
        ).toBeGreaterThanOrEqual(new Date(before!.updatedAt).getTime());
      });

      it("is a no-op when the trail is already present", async () => {
        await manager.addTrailToTopic("t", "trail-1");
        const first = await manager.getTopic("t");
        await new Promise((r) => setTimeout(r, 2));
        const after = await manager.addTrailToTopic("t", "trail-1");

        expect(after.trailIds).toEqual(["trail-1"]);
        // updatedAt should NOT have changed since we did nothing
        expect(after.updatedAt).toBe(first!.updatedAt);
      });

      it("throws when the topic does not exist", async () => {
        await expect(
          manager.addTrailToTopic("missing", "trail-1"),
        ).rejects.toThrow(/not found/);
      });
    });

    describe("removeTrailFromTopic", () => {
      it("removes the trail and bumps updatedAt", async () => {
        await manager.addTrailToTopic("t", "trail-1");
        await manager.addTrailToTopic("t", "trail-2");
        const result = await manager.removeTrailFromTopic("t", "trail-1");
        expect(result.trailIds).toEqual(["trail-2"]);
      });

      it("is a no-op when the trail is absent", async () => {
        const first = await manager.getTopic("t");
        await new Promise((r) => setTimeout(r, 2));
        const after = await manager.removeTrailFromTopic("t", "absent");
        expect(after.trailIds).toEqual([]);
        expect(after.updatedAt).toBe(first!.updatedAt);
      });
    });

    describe("reorderTopicTrails", () => {
      beforeEach(async () => {
        await manager.addTrailToTopic("t", "a");
        await manager.addTrailToTopic("t", "b");
        await manager.addTrailToTopic("t", "c");
      });

      it("reorders an existing permutation", async () => {
        const result = await manager.reorderTopicTrails("t", ["c", "a", "b"]);
        expect(result.trailIds).toEqual(["c", "a", "b"]);
      });

      it("rejects a list that adds a new trail", async () => {
        await expect(
          manager.reorderTopicTrails("t", ["a", "b", "c", "d"]),
        ).rejects.toThrow(/permutation/);
      });

      it("rejects a list that drops a trail", async () => {
        await expect(
          manager.reorderTopicTrails("t", ["a", "b"]),
        ).rejects.toThrow(/permutation/);
      });

      it("rejects a list that swaps in a different trail", async () => {
        await expect(
          manager.reorderTopicTrails("t", ["a", "b", "z"]),
        ).rejects.toThrow(/permutation/);
      });
    });
  });

  describe("getTopicsForTrail", () => {
    it("returns topics that include the trail", async () => {
      await manager.createTopic({ id: "a", title: "A", trailIds: ["x", "y"] });
      await manager.createTopic({ id: "b", title: "B", trailIds: ["y"] });
      await manager.createTopic({ id: "c", title: "C", trailIds: [] });

      const xTopics = await manager.getTopicsForTrail("x");
      const yTopics = await manager.getTopicsForTrail("y");

      expect(xTopics.map((t) => t.id)).toEqual(["a"]);
      expect(yTopics.map((t) => t.id).sort()).toEqual(["a", "b"]);
    });
  });

  describe("persistence", () => {
    it("survives a fresh manager instance reading the same disk", async () => {
      await manager.createTopic({
        id: "persist",
        title: "Persist",
        trailIds: ["t1"],
      });

      const fresh = new TopicManager(alexandriaPath, fs);
      const reloaded = await fresh.getTopic("persist");

      expect(reloaded).not.toBeNull();
      expect(reloaded?.title).toBe("Persist");
      expect(reloaded?.trailIds).toEqual(["t1"]);
    });

    it("does not collide with workspaces.json", async () => {
      await manager.createTopic({ id: "topic-1", title: "T", trailIds: [] });
      expect(fs.exists("/home/user/.alexandria/topics.json")).toBe(true);
      expect(fs.exists("/home/user/.alexandria/workspaces.json")).toBe(false);
    });
  });
});
