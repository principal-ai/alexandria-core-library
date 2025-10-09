/**
 * Tests for MemoryPalace task management integration
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { MemoryPalace } from "../src/MemoryPalace";
import { InMemoryFileSystemAdapter } from "../src/test-adapters/InMemoryFileSystemAdapter";
import type {
  ValidatedRelativePath,
  CreateTaskInput,
  GitReferences,
} from "../src/pure-core/types/task";

describe("MemoryPalace Task Management", () => {
  let palace: MemoryPalace;
  let fs: InMemoryFileSystemAdapter;
  const testRepoPath = "/test-repo";

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    fs.setupTestRepo(testRepoPath);
    palace = new MemoryPalace(testRepoPath, fs);
  });

  describe("Task Reception", () => {
    it("should receive tasks from MCP server", () => {
      const input: CreateTaskInput = {
        content: "# Implement Feature\n\nImplement the new dashboard feature",
        directoryPath: "src/dashboard" as ValidatedRelativePath,
        priority: "high",
        tags: ["feature", "ui"],
        metadata: {
          requesterName: "Product Team",
          source: "mcp_server",
          estimatedMinutes: 240
        }
      };

      const task = palace.receiveTask(input, "mcp-server-prod");

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.title).toBe("Implement Feature");
      expect(task.status).toBe("pending");
      expect(task.senderId).toBe("mcp-server-prod");
      expect(task.priority).toBe("high");
      expect(task.metadata?.source).toBe("mcp_server");
    });

    it("should receive tasks from CLI", () => {
      const input: CreateTaskInput = {
        content: "Quick bug fix for login",
        directoryPath: "" as ValidatedRelativePath,
        priority: "critical",
        tags: ["bug", "urgent"]
      };

      const task = palace.receiveTask(input, "cli-user-123");

      expect(task.senderId).toBe("cli-user-123");
      expect(task.priority).toBe("critical");
      expect(task.tags).toContain("bug");
      expect(task.tags).toContain("urgent");
    });
  });

  describe("ADE Workflow", () => {
    let taskId: string;

    beforeEach(() => {
      const task = palace.receiveTask({
        content: "Implement authentication",
        directoryPath: "src/auth" as ValidatedRelativePath,
        priority: "high"
      }, "mcp-server");
      taskId = task.id;
    });

    it("should allow ADE to get next pending task", () => {
      const next = palace.getNextPendingTask();

      expect(next).toBeDefined();
      expect(next!.id).toBe(taskId);
      expect(next!.status).toBe("pending");
    });

    it("should allow ADE to acknowledge task", () => {
      const acknowledged = palace.acknowledgeTask(taskId, "principal-ade-1");

      expect(acknowledged).toBeDefined();
      expect(acknowledged!.status).toBe("acknowledged");
      expect(acknowledged!.adeId).toBe("principal-ade-1");
    });

    it("should allow ADE to start working on task", () => {
      palace.acknowledgeTask(taskId, "principal-ade-1");
      const started = palace.startWorkingOnTask(taskId, "principal-ade-1");

      expect(started).toBeDefined();
      expect(started!.status).toBe("in_progress");
      expect(started!.startedAt).toBeDefined();
    });

    it("should complete full ADE workflow", () => {
      // ADE picks up work
      const pending = palace.getNextPendingTask();
      expect(pending).toBeDefined();

      // Acknowledge
      palace.acknowledgeTask(taskId, "principal-ade");

      // Start work
      palace.startWorkingOnTask(taskId, "principal-ade");

      // Complete with git references
      const gitRefs: GitReferences = {
        commitSha: "abc123def456789",
        pullRequest: 42,
        branch: "feature/auth-implementation",
        filesModified: [
          "src/auth/login.ts",
          "src/auth/logout.ts",
          "tests/auth.test.ts"
        ]
      };

      const completed = palace.completeTask(taskId, gitRefs);

      expect(completed).toBeDefined();
      expect(completed!.status).toBe("completed");
      expect(completed!.gitRefs).toEqual(gitRefs);
      expect(completed!.completedAt).toBeDefined();
    });

    it("should handle task failure", () => {
      palace.startWorkingOnTask(taskId, "principal-ade");

      const failed = palace.failTask(taskId, "Dependencies not available");

      expect(failed).toBeDefined();
      expect(failed!.status).toBe("failed");
      expect(failed!.metadata?.errorMessage).toBe("Dependencies not available");
    });
  });

  describe("Sender Queries", () => {
    beforeEach(() => {
      // Create tasks from different senders
      palace.receiveTask({
        content: "Task 1",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender-A");

      palace.receiveTask({
        content: "Task 2",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender-B");

      palace.receiveTask({
        content: "Task 3",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender-A");
    });

    it("should get tasks by sender", () => {
      const senderATasks = palace.getTasksBySender("sender-A");
      expect(senderATasks.length).toBe(2);

      const senderBTasks = palace.getTasksBySender("sender-B");
      expect(senderBTasks.length).toBe(1);
    });

    it("should check task status", () => {
      const task = palace.receiveTask({
        content: "Status check task",
        directoryPath: "" as ValidatedRelativePath,
      }, "test-sender");

      let status = palace.getTaskStatus(task.id);
      expect(status).toBe("pending");

      palace.startWorkingOnTask(task.id, "ade-1");

      status = palace.getTaskStatus(task.id);
      expect(status).toBe("in_progress");
    });

    it("should get task updates since timestamp", () => {
      palace.receiveTask({
        content: "Old task",
        directoryPath: "" as ValidatedRelativePath,
      }, "polling-sender");

      // Small delay to ensure different timestamps
      const after = Date.now() + 1;

      const task2 = palace.receiveTask({
        content: "New task",
        directoryPath: "" as ValidatedRelativePath,
      }, "polling-sender");

      palace.startWorkingOnTask(task2.id, "ade-1");

      const updates = palace.getTaskUpdates("polling-sender", after);

      expect(updates.length).toBeGreaterThanOrEqual(1);
      expect(updates.some(t => t.id === task2.id)).toBe(true);
    });
  });

  describe("Task Queries", () => {
    beforeEach(() => {
      // Create diverse set of tasks
      const tasks = [
        {
          content: "Frontend feature",
          directoryPath: "src/frontend" as ValidatedRelativePath,
          priority: "high" as const,
          tags: ["feature", "ui"]
        },
        {
          content: "Backend API",
          directoryPath: "src/backend" as ValidatedRelativePath,
          priority: "normal" as const,
          tags: ["feature", "api"]
        },
        {
          content: "Documentation update",
          directoryPath: "docs" as ValidatedRelativePath,
          priority: "low" as const,
          tags: ["documentation"]
        },
        {
          content: "Security fix",
          directoryPath: "src/backend" as ValidatedRelativePath,
          priority: "critical" as const,
          tags: ["security", "bug"]
        }
      ];

      tasks.forEach(input => {
        palace.receiveTask(input, "test-sender");
      });
    });

    it("should get all tasks", () => {
      const allTasks = palace.getTasks();
      expect(allTasks.length).toBe(4);
    });

    it("should get active tasks", () => {
      const allTasks = palace.getTasks();

      // Complete one task
      palace.completeTask(allTasks[0].id, {
        commitSha: "abc123"
      });

      // Fail another
      palace.failTask(allTasks[1].id, "Error");

      const activeTasks = palace.getActiveTasks();
      expect(activeTasks.length).toBe(2);
      expect(activeTasks.every(t =>
        t.status === "pending" ||
        t.status === "acknowledged" ||
        t.status === "in_progress"
      )).toBe(true);
    });

    it("should get tasks for directory", () => {
      const backendTasks = palace.getTasksForDirectory("src/backend" as ValidatedRelativePath);
      expect(backendTasks.length).toBe(2);

      const docTasks = palace.getTasksForDirectory("docs" as ValidatedRelativePath);
      expect(docTasks.length).toBe(1);
    });

    it("should query with complex filters", () => {
      const urgentBackendTasks = palace.getTasks({
        directoryPath: "src/backend" as ValidatedRelativePath,
        priority: ["high", "critical"],
        tags: ["security"]
      });

      expect(urgentBackendTasks.length).toBe(1);
      expect(urgentBackendTasks[0].priority).toBe("critical");
      expect(urgentBackendTasks[0].tags).toContain("security");
    });
  });

  describe("File Structure", () => {
    it("should keep tasks separate from memory palace", () => {
      // Create a task
      palace.receiveTask({
        content: "Test separation",
        directoryPath: "" as ValidatedRelativePath,
      }, "test");

      // Create a note (memory palace)
      palace.saveNote({
        note: "This is a memory note",
        tags: ["knowledge"],
        anchors: ["src/index.ts"]
      });

      // Tasks should be in .palace-work
      expect(fs.exists("/test-repo/.palace-work/tasks")).toBe(true);
      expect(fs.exists("/test-repo/.palace-work/tasks/active")).toBe(true);

      // Notes should be in .alexandria
      expect(fs.exists("/test-repo/.alexandria/notes")).toBe(true);

      // They should be completely separate
      // Tasks should NOT be in .alexandria
      expect(fs.exists("/test-repo/.alexandria/tasks")).toBe(false);
      // Notes should NOT be in .palace-work
      expect(fs.exists("/test-repo/.palace-work/notes")).toBe(false);
    });
  });

  describe("Integration with Git", () => {
    it("should store git references for completed tasks", () => {
      const task = palace.receiveTask({
        content: "# Feature: User Profile\n\nImplement user profile page",
        directoryPath: "src/pages" as ValidatedRelativePath,
        priority: "normal",
        tags: ["feature", "user-profile"]
      }, "pm-tool");

      palace.startWorkingOnTask(task.id, "ade-1");

      const gitRefs: GitReferences = {
        commitSha: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        pullRequest: 123,
        branch: "feature/user-profile",
        filesModified: [
          "src/pages/UserProfile.tsx",
          "src/pages/UserProfile.css",
          "src/api/userApi.ts",
          "tests/UserProfile.test.tsx"
        ]
      };

      const completed = palace.completeTask(task.id, gitRefs);

      expect(completed).toBeDefined();
      expect(completed!.gitRefs).toEqual(gitRefs);

      // Retrieve and verify it still has git refs
      const retrieved = palace.getTask(task.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.gitRefs?.commitSha).toBe("f47ac10b-58cc-4372-a567-0e02b2c3d479");
      expect(retrieved!.gitRefs?.pullRequest).toBe(123);
    });

    it("should create lightweight history entry", () => {
      const task = palace.receiveTask({
        content: "This is a very long task description with lots and lots of implementation details that we don't want to keep in the history file because we only want git references",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender");

      palace.completeTask(task.id, {
        commitSha: "short123",
        pullRequest: 99
      });

      const historyPath = `/test-repo/.palace-work/tasks/history/${task.id}.hist.md`;
      const historyContent = fs.readFile(historyPath);

      // Should have git refs
      expect(historyContent).toContain("short123");
      expect(historyContent).toContain("#99");

      // Should NOT have the full original content
      expect(historyContent).not.toContain("lots and lots of implementation details");
    });
  });

  describe("Error Handling", () => {
    it("should return null for non-existent task", () => {
      const task = palace.getTask("non-existent-id");
      expect(task).toBeNull();

      const status = palace.getTaskStatus("non-existent-id");
      expect(status).toBeNull();
    });

    it("should handle invalid state transitions", () => {
      const task = palace.receiveTask({
        content: "Test task",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender");

      // Try to complete without starting
      palace.completeTask(task.id, { commitSha: "abc" });

      // Task should still be completable
      const completed = palace.getTask(task.id);
      expect(completed!.status).toBe("completed");
    });

    it("should not acknowledge already completed task", () => {
      const task = palace.receiveTask({
        content: "Test task",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender");

      palace.completeTask(task.id, { commitSha: "xyz" });

      const result = palace.acknowledgeTask(task.id, "ade-late");
      expect(result).toBeNull();
    });
  });

  describe("Task Deletion", () => {
    it("should delete a task permanently", () => {
      const task = palace.receiveTask({
        content: "Task to delete",
        directoryPath: "" as ValidatedRelativePath,
        priority: "normal",
        tags: ["test"]
      }, "test-sender");

      const result = palace.deleteTask(task.id);

      expect(result).toBe(true);

      // Task should no longer be retrievable
      const retrieved = palace.getTask(task.id);
      expect(retrieved).toBeNull();

      // Task status should be null
      const status = palace.getTaskStatus(task.id);
      expect(status).toBeNull();
    });

    it("should delete task regardless of status", () => {
      const task1 = palace.receiveTask({
        content: "Pending task",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender");

      const task2 = palace.receiveTask({
        content: "In progress task",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender");

      const task3 = palace.receiveTask({
        content: "Failed task",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender");

      palace.startWorkingOnTask(task2.id, "ade-1");
      palace.failTask(task3.id, "Test failure");

      // All should be deletable
      expect(palace.deleteTask(task1.id)).toBe(true);
      expect(palace.deleteTask(task2.id)).toBe(true);
      expect(palace.deleteTask(task3.id)).toBe(true);

      // None should be retrievable
      expect(palace.getTask(task1.id)).toBeNull();
      expect(palace.getTask(task2.id)).toBeNull();
      expect(palace.getTask(task3.id)).toBeNull();
    });

    it("should return false when deleting non-existent task", () => {
      const result = palace.deleteTask("non-existent-task-id");

      expect(result).toBe(false);
    });

    it("should be idempotent", () => {
      const task = palace.receiveTask({
        content: "Task to delete twice",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender");

      const firstDelete = palace.deleteTask(task.id);
      expect(firstDelete).toBe(true);

      const secondDelete = palace.deleteTask(task.id);
      expect(secondDelete).toBe(false);
    });

    it("should remove deleted task from active tasks", () => {
      const task1 = palace.receiveTask({
        content: "Task 1",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender");

      const task2 = palace.receiveTask({
        content: "Task 2",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender");

      let activeTasks = palace.getActiveTasks();
      expect(activeTasks.length).toBe(2);

      palace.deleteTask(task1.id);

      activeTasks = palace.getActiveTasks();
      expect(activeTasks.length).toBe(1);
      expect(activeTasks[0].id).toBe(task2.id);
    });

    it("should remove deleted task from sender queries", () => {
      const task1 = palace.receiveTask({
        content: "Task 1",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender-A");

      const task2 = palace.receiveTask({
        content: "Task 2",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender-A");

      palace.receiveTask({
        content: "Task 3",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender-B");

      let senderATasks = palace.getTasksBySender("sender-A");
      expect(senderATasks.length).toBe(2);

      palace.deleteTask(task1.id);

      senderATasks = palace.getTasksBySender("sender-A");
      expect(senderATasks.length).toBe(1);
      expect(senderATasks[0].id).toBe(task2.id);
    });

    it("should handle deleting completed tasks (removes from index but preserves history)", () => {
      const task = palace.receiveTask({
        content: "Completed task",
        directoryPath: "" as ValidatedRelativePath,
      }, "sender");

      palace.completeTask(task.id, {
        commitSha: "abc123",
        pullRequest: 42
      });

      // History file should exist
      const historyPath = `/test-repo/.palace-work/tasks/history/${task.id}.hist.md`;
      expect(fs.exists(historyPath)).toBe(true);

      const result = palace.deleteTask(task.id);
      expect(result).toBe(true);

      // History file should still exist
      expect(fs.exists(historyPath)).toBe(true);

      // But task should not be retrievable via getTask
      const retrieved = palace.getTask(task.id);
      expect(retrieved).toBeNull();
    });
  });
});