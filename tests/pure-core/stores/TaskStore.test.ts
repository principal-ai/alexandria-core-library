/**
 * Tests for TaskStore - Work queue management
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { TaskStore } from "../../../src/pure-core/stores/TaskStore";
import { InMemoryFileSystemAdapter } from "../../../src/test-adapters/InMemoryFileSystemAdapter";
import { MemoryPalace } from "../../../src/MemoryPalace";
import type {
  ValidatedRepositoryPath,
  ValidatedRelativePath,
} from "../../../src/pure-core/types";
import type {
  Task,
  CreateTaskInput,
  GitReferences,
} from "../../../src/pure-core/types/task";

describe("TaskStore", () => {
  let store: TaskStore;
  let fs: InMemoryFileSystemAdapter;
  const testRepoPath = "/test-repo";
  let validatedRepoPath: ValidatedRepositoryPath;

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();

    // Set up the test repository structure
    fs.setupTestRepo(testRepoPath);

    // Validate the repository path
    validatedRepoPath = MemoryPalace.validateRepositoryPath(fs, testRepoPath);

    // Create store
    store = new TaskStore(fs, validatedRepoPath);
  });

  describe("Initialization", () => {
    it("should defer .palace-work directory creation", () => {
      expect(fs.exists("/test-repo/.palace-work")).toBe(false);
      expect(fs.exists("/test-repo/.palace-work/tasks")).toBe(false);
      expect(fs.exists("/test-repo/.palace-work/tasks/active")).toBe(false);
      expect(fs.exists("/test-repo/.palace-work/tasks/history")).toBe(false);
    });

    it("should not create index file until needed", () => {
      const indexPath = "/test-repo/.palace-work/tasks/index.json";
      expect(fs.exists(indexPath)).toBe(false);
    });

    it("should set up workspace on first task", () => {
      const input: CreateTaskInput = {
        content: "Bootstrap work queue",
        directoryPath: "" as ValidatedRelativePath,
      };

      const task = store.receiveTask(input, "initializer");

      expect(fs.exists("/test-repo/.palace-work")).toBe(true);
      expect(fs.exists("/test-repo/.palace-work/tasks")).toBe(true);
      expect(
        fs.exists(`/test-repo/.palace-work/tasks/active/${task.id}.task.md`),
      ).toBe(true);
      expect(fs.exists("/test-repo/.palace-work/tasks/index.json")).toBe(true);

      const index = JSON.parse(
        fs.readFile("/test-repo/.palace-work/tasks/index.json"),
      );
      expect(index.version).toBe("1.0.0");
      expect(index.tasks).toHaveProperty(task.id);
    });
  });

  describe("Receiving Tasks", () => {
    it("should receive a new task from a sender", () => {
      const input: CreateTaskInput = {
        content: "Implement authentication API",
        directoryPath: "src/api" as ValidatedRelativePath,
        priority: "high",
        tags: ["feature", "security"],
        anchors: ["src/api/auth.ts"],
      };

      const task = store.receiveTask(input, "mcp-server-1");

      expect(task.id).toBeDefined();
      expect(task.title).toBe("Implement authentication API");
      expect(task.content).toBe("Implement authentication API");
      expect(task.status).toBe("pending");
      expect(task.priority).toBe("high");
      expect(task.senderId).toBe("mcp-server-1");
      expect(task.tags).toEqual(["feature", "security"]);
      expect(task.anchors).toEqual(["src/api/auth.ts"]);
      expect(task.filePath).toBe(
        `.palace-work/tasks/active/${task.id}.task.md`,
      );
    });

    it("should save task to active directory", () => {
      const input: CreateTaskInput = {
        content: "# Fix Bug\n\nFix the authentication bug",
        directoryPath: "" as ValidatedRelativePath,
      };

      const task = store.receiveTask(input, "cli-user");
      const taskFile = `/test-repo/.palace-work/tasks/active/${task.id}.task.md`;

      expect(fs.exists(taskFile)).toBe(true);

      const content = fs.readFile(taskFile);
      expect(content).toContain("Fix Bug");
      expect(content).toContain("Fix the authentication bug");
      expect(content).toContain("status: pending");
    });

    it("should extract title from markdown content", () => {
      const input: CreateTaskInput = {
        content: "# Implement User Profile\n\nAdd user profile management",
        directoryPath: "" as ValidatedRelativePath,
      };

      const task = store.receiveTask(input, "test-sender");
      expect(task.title).toBe("Implement User Profile");
    });

    it("should use first line as title if no markdown header", () => {
      const input: CreateTaskInput = {
        content: "Quick fix for login issue\nMore details here",
        directoryPath: "" as ValidatedRelativePath,
      };

      const task = store.receiveTask(input, "test-sender");
      expect(task.title).toBe("Quick fix for login issue");
    });

    it("should record task received event", () => {
      const input: CreateTaskInput = {
        content: "Test task",
        directoryPath: "" as ValidatedRelativePath,
      };

      const task = store.receiveTask(input, "test-sender");

      const eventsPath = "/test-repo/.palace-work/tasks/events.jsonl";
      expect(fs.exists(eventsPath)).toBe(true);

      const events = fs.readFile(eventsPath);
      expect(events).toContain(task.id);
      expect(events).toContain("received");
      expect(events).toContain("test-sender");
    });
  });

  describe("Task Lifecycle", () => {
    let task: Task;

    beforeEach(() => {
      const input: CreateTaskInput = {
        content: "Test task for lifecycle",
        directoryPath: "" as ValidatedRelativePath,
        priority: "normal",
      };
      task = store.receiveTask(input, "test-sender");
    });

    it("should acknowledge a pending task", () => {
      const acknowledged = store.acknowledgeTask(task.id, "ade-1");

      expect(acknowledged).toBeDefined();
      expect(acknowledged!.status).toBe("acknowledged");
      expect(acknowledged!.adeId).toBe("ade-1");
      expect(acknowledged!.acknowledgedAt).toBeDefined();
    });

    it("should not acknowledge non-pending task", () => {
      store.acknowledgeTask(task.id, "ade-1");
      const secondAck = store.acknowledgeTask(task.id, "ade-2");

      expect(secondAck).toBeNull();
    });

    it("should start an acknowledged task", () => {
      store.acknowledgeTask(task.id, "ade-1");
      const started = store.startTask(task.id, "ade-1");

      expect(started).toBeDefined();
      expect(started!.status).toBe("in_progress");
      expect(started!.startedAt).toBeDefined();
    });

    it("should start a pending task directly", () => {
      const started = store.startTask(task.id, "ade-1");

      expect(started).toBeDefined();
      expect(started!.status).toBe("in_progress");
      expect(started!.adeId).toBe("ade-1");
    });

    it("should complete a task with git references", () => {
      store.startTask(task.id, "ade-1");

      const gitRefs: GitReferences = {
        commitSha: "abc123def456",
        pullRequest: 42,
        branch: "feature/auth",
        filesModified: ["src/auth.ts", "tests/auth.test.ts"],
      };

      const completed = store.completeTask(task.id, gitRefs);

      expect(completed).toBeDefined();
      expect(completed!.status).toBe("completed");
      expect(completed!.completedAt).toBeDefined();
      expect(completed!.gitRefs).toEqual(gitRefs);
    });

    it("should move completed task to history", () => {
      const gitRefs: GitReferences = {
        commitSha: "abc123",
        pullRequest: 1,
      };

      store.completeTask(task.id, gitRefs);

      const activeFile = `/test-repo/.palace-work/tasks/active/${task.id}.task.md`;
      const historyFile = `/test-repo/.palace-work/tasks/history/${task.id}.hist.md`;

      expect(fs.exists(activeFile)).toBe(false);
      expect(fs.exists(historyFile)).toBe(true);

      const historyContent = fs.readFile(historyFile);
      expect(historyContent).toContain("status: completed");
      expect(historyContent).toContain("abc123");
      expect(historyContent).toContain("PR: #1");
    });

    it("should fail a task with reason", () => {
      const failed = store.failTask(
        task.id,
        "Could not find required dependencies",
      );

      expect(failed).toBeDefined();
      expect(failed!.status).toBe("failed");
      expect(failed!.failedAt).toBeDefined();
      expect(failed!.metadata?.errorMessage).toBe(
        "Could not find required dependencies",
      );
    });

    it("should record all lifecycle events", () => {
      store.acknowledgeTask(task.id, "ade-1");
      store.startTask(task.id, "ade-1");
      store.completeTask(task.id, { commitSha: "abc123" });

      const events = fs.readFile("/test-repo/.palace-work/tasks/events.jsonl");
      const lines = events.trim().split("\n");

      expect(lines.length).toBe(4); // received, acknowledged, started, completed
      expect(events).toContain("acknowledged");
      expect(events).toContain("started");
      expect(events).toContain("completed");
    });
  });

  describe("Task Queries", () => {
    beforeEach(() => {
      // Create multiple tasks with different properties
      const tasks = [
        {
          content: "High priority feature",
          directoryPath: "src" as ValidatedRelativePath,
          priority: "high" as const,
          tags: ["feature"],
        },
        {
          content: "Normal bug fix",
          directoryPath: "src" as ValidatedRelativePath,
          priority: "normal" as const,
          tags: ["bug"],
        },
        {
          content: "Low priority docs",
          directoryPath: "docs" as ValidatedRelativePath,
          priority: "low" as const,
          tags: ["documentation"],
        },
        {
          content: "Critical security fix",
          directoryPath: "src" as ValidatedRelativePath,
          priority: "critical" as const,
          tags: ["security", "bug"],
        },
      ];

      tasks.forEach((input) => {
        store.receiveTask(input, "test-sender");
      });
    });

    it("should get task by ID", () => {
      const allTasks = store.queryTasks();
      const firstTask = allTasks[0];

      const retrieved = store.getTask(firstTask.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(firstTask.id);
      expect(retrieved!.filePath).toBe(
        `.palace-work/tasks/active/${firstTask.id}.task.md`,
      );
    });

    it("should get next pending task by priority", () => {
      const next = store.getNextPendingTask();

      expect(next).toBeDefined();
      expect(next!.priority).toBe("critical");
      expect(next!.tags).toContain("security");
    });

    it("should query tasks by status", () => {
      const pending = store.queryTasks({ status: "pending" });
      expect(pending.length).toBe(4);

      const allTasks = store.queryTasks();
      store.startTask(allTasks[0].id, "ade-1");

      const inProgress = store.queryTasks({ status: "in_progress" });
      expect(inProgress.length).toBe(1);

      const stillPending = store.queryTasks({ status: "pending" });
      expect(stillPending.length).toBe(3);
    });

    it("should query tasks by priority", () => {
      const highPriority = store.queryTasks({ priority: "high" });
      expect(highPriority.length).toBe(1);

      const urgentTasks = store.queryTasks({ priority: ["high", "critical"] });
      expect(urgentTasks.length).toBe(2);
    });

    it("should query tasks by directory", () => {
      const srcTasks = store.queryTasks({
        directoryPath: "src" as ValidatedRelativePath,
      });
      expect(srcTasks.length).toBe(3);

      const docsTasks = store.queryTasks({
        directoryPath: "docs" as ValidatedRelativePath,
      });
      expect(docsTasks.length).toBe(1);
    });

    it("should query tasks by tags", () => {
      const bugTasks = store.queryTasks({ tags: ["bug"] });
      expect(bugTasks.length).toBe(2);

      const securityTasks = store.queryTasks({ tags: ["security"] });
      expect(securityTasks.length).toBe(1);
    });

    it("should sort tasks", () => {
      const sorted = store.queryTasks({
        sortBy: "priority",
        sortDirection: "desc",
      });

      expect(sorted[0].priority).toBe("critical");
      expect(sorted[sorted.length - 1].priority).toBe("low");
    });

    it("should paginate results", () => {
      const page1 = store.queryTasks({ limit: 2 });
      expect(page1.length).toBe(2);

      const page2 = store.queryTasks({ offset: 2, limit: 2 });
      expect(page2.length).toBe(2);

      const allIds = new Set([...page1, ...page2].map((t) => t.id));
      expect(allIds.size).toBe(4); // All unique
    });
  });

  describe("Completed Task Handling", () => {
    it("should store lightweight completed task", () => {
      const input: CreateTaskInput = {
        content:
          "# Feature Implementation\n\nDetailed implementation plan here",
        directoryPath: "" as ValidatedRelativePath,
      };

      const task = store.receiveTask(input, "test-sender");

      const gitRefs: GitReferences = {
        commitSha: "abc123",
        pullRequest: 99,
        branch: "feature/awesome",
        filesModified: ["src/feature.ts"],
      };

      store.completeTask(task.id, gitRefs);

      const historyFile = `/test-repo/.palace-work/tasks/history/${task.id}.hist.md`;
      const content = fs.readFile(historyFile);

      // Should have lightweight format
      expect(content).toContain("Feature Implementation");
      expect(content).toContain("commitSha: abc123");
      expect(content).toContain("pullRequest: 99");

      // Should NOT have the full original content
      expect(content).not.toContain("Detailed implementation plan here");
    });

    it("should retrieve completed task with reference to PR", () => {
      const input: CreateTaskInput = {
        content: "Task content",
        directoryPath: "" as ValidatedRelativePath,
      };

      const task = store.receiveTask(input, "test-sender");
      store.completeTask(task.id, {
        commitSha: "xyz789",
        pullRequest: 123,
      });

      const retrieved = store.getTask(task.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe("completed");
      expect(retrieved!.content).toContain("See PR #123 for details");
      expect(retrieved!.gitRefs?.commitSha).toBe("xyz789");
      expect(retrieved!.filePath).toBe(
        `.palace-work/tasks/history/${task.id}.hist.md`,
      );
    });
  });

  describe("Index Management", () => {
    it("should update index when task status changes", () => {
      const input: CreateTaskInput = {
        content: "Test task",
        directoryPath: "" as ValidatedRelativePath,
      };

      const task = store.receiveTask(input, "sender-1");

      let index = JSON.parse(
        fs.readFile("/test-repo/.palace-work/tasks/index.json"),
      );
      expect(index.byStatus.pending).toContain(task.id);
      expect(index.bySender["sender-1"]).toContain(task.id);

      store.startTask(task.id, "ade-1");

      index = JSON.parse(
        fs.readFile("/test-repo/.palace-work/tasks/index.json"),
      );
      expect(index.byStatus.pending).not.toContain(task.id);
      expect(index.byStatus.in_progress).toContain(task.id);
      expect(index.byADE["ade-1"]).toContain(task.id);
    });

    it("should maintain sender index", () => {
      store.receiveTask(
        {
          content: "Task 1",
          directoryPath: "" as ValidatedRelativePath,
        },
        "sender-A",
      );

      store.receiveTask(
        {
          content: "Task 2",
          directoryPath: "" as ValidatedRelativePath,
        },
        "sender-B",
      );

      store.receiveTask(
        {
          content: "Task 3",
          directoryPath: "" as ValidatedRelativePath,
        },
        "sender-A",
      );

      const index = JSON.parse(
        fs.readFile("/test-repo/.palace-work/tasks/index.json"),
      );
      expect(index.bySender["sender-A"].length).toBe(2);
      expect(index.bySender["sender-B"].length).toBe(1);
    });
  });

  describe("Task Deletion", () => {
    let task: Task;

    beforeEach(() => {
      const input: CreateTaskInput = {
        content: "Task to be deleted",
        directoryPath: "" as ValidatedRelativePath,
        priority: "normal",
        tags: ["test"],
        anchors: ["test.ts"],
      };
      task = store.receiveTask(input, "test-sender");
    });

    it("should delete a pending task", () => {
      const result = store.deleteTask(task.id);

      expect(result).toBe(true);

      // Task file should be removed
      const taskFile = `/test-repo/.palace-work/tasks/active/${task.id}.task.md`;
      expect(fs.exists(taskFile)).toBe(false);

      // Should not be retrievable
      const retrieved = store.getTask(task.id);
      expect(retrieved).toBeNull();
    });

    it("should delete an in-progress task", () => {
      store.startTask(task.id, "ade-1");

      const result = store.deleteTask(task.id);

      expect(result).toBe(true);

      const taskFile = `/test-repo/.palace-work/tasks/active/${task.id}.task.md`;
      expect(fs.exists(taskFile)).toBe(false);

      const retrieved = store.getTask(task.id);
      expect(retrieved).toBeNull();
    });

    it("should delete a failed task", () => {
      store.failTask(task.id, "Test failure");

      const result = store.deleteTask(task.id);

      expect(result).toBe(true);

      const taskFile = `/test-repo/.palace-work/tasks/active/${task.id}.task.md`;
      expect(fs.exists(taskFile)).toBe(false);
    });

    it("should remove task from all indices", () => {
      store.startTask(task.id, "ade-1");

      const beforeIndex = JSON.parse(
        fs.readFile("/test-repo/.palace-work/tasks/index.json"),
      );
      expect(beforeIndex.tasks).toHaveProperty(task.id);
      expect(beforeIndex.byStatus.in_progress).toContain(task.id);
      expect(beforeIndex.bySender["test-sender"]).toContain(task.id);
      expect(beforeIndex.byADE["ade-1"]).toContain(task.id);

      store.deleteTask(task.id);

      const afterIndex = JSON.parse(
        fs.readFile("/test-repo/.palace-work/tasks/index.json"),
      );
      expect(afterIndex.tasks).not.toHaveProperty(task.id);
      expect(afterIndex.byStatus.in_progress).not.toContain(task.id);
      expect(afterIndex.bySender["test-sender"]).not.toContain(task.id);
      expect(afterIndex.byADE["ade-1"]).not.toContain(task.id);
    });

    it("should not delete completed tasks from history", () => {
      const gitRefs: GitReferences = {
        commitSha: "abc123",
        pullRequest: 42,
      };

      store.completeTask(task.id, gitRefs);

      const historyFile = `/test-repo/.palace-work/tasks/history/${task.id}.hist.md`;
      expect(fs.exists(historyFile)).toBe(true);

      // Delete should still work but shouldn't delete the history file
      const result = store.deleteTask(task.id);
      expect(result).toBe(true);

      // History file should remain
      expect(fs.exists(historyFile)).toBe(true);

      // But task should be removed from index
      const afterIndex = JSON.parse(
        fs.readFile("/test-repo/.palace-work/tasks/index.json"),
      );
      expect(afterIndex.tasks).not.toHaveProperty(task.id);
    });

    it("should return false when deleting non-existent task", () => {
      const result = store.deleteTask("non-existent-task-id");

      expect(result).toBe(false);
    });

    it("should be idempotent - deleting twice returns false second time", () => {
      const firstDelete = store.deleteTask(task.id);
      expect(firstDelete).toBe(true);

      const secondDelete = store.deleteTask(task.id);
      expect(secondDelete).toBe(false);
    });

    it("should record deletion event", () => {
      store.deleteTask(task.id);

      const eventsPath = "/test-repo/.palace-work/tasks/events.jsonl";
      const events = fs.readFile(eventsPath);

      expect(events).toContain(task.id);
      expect(events).toContain("deleted");
      expect(events).toContain("system");
    });

    it("should not affect other tasks when deleting one", () => {
      const task2 = store.receiveTask(
        {
          content: "Another task",
          directoryPath: "" as ValidatedRelativePath,
        },
        "test-sender",
      );

      store.deleteTask(task.id);

      // task2 should still exist
      const retrieved = store.getTask(task2.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(task2.id);

      // Index should still contain task2
      const index = JSON.parse(
        fs.readFile("/test-repo/.palace-work/tasks/index.json"),
      );
      expect(index.tasks).toHaveProperty(task2.id);
      expect(index.byStatus.pending).toContain(task2.id);
    });
  });
});
