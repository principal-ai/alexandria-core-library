/**
 * TaskStore - Manages task persistence in .palace-work directory
 */

// We only use section-matter for parsing, we'll handle stringifying ourselves
import { FileSystemAdapter } from "../abstractions/filesystem";
import {
  Task,
  TaskStatus,
  TaskPriority,
  TaskMetadata,
  CreateTaskInput,
  TaskQueryOptions,
  TaskIndex,
  TaskIndexEntry,
  TaskEvent,
  GitReferences,
  CompletedTask,
} from "../types/task";
import { ValidatedRepositoryPath, ValidatedRelativePath } from "../types";
import { idGenerator } from "../utils/idGenerator";

// ============================================================================
// Constants
// ============================================================================

const PALACE_WORK_DIR = ".palace-work";
const TASKS_DIR = "tasks";
const ACTIVE_DIR = "active";
const HISTORY_DIR = "history";
const INDEX_FILE = "index.json";
const EVENTS_FILE = "events.jsonl";

// ============================================================================
// TaskStore Class
// ============================================================================

export class TaskStore {
  private fs: FileSystemAdapter;
  private repositoryRoot: ValidatedRepositoryPath;
  private workPath: string;
  private tasksPath: string;
  private activePath: string;
  private historyPath: string;
  private indexPath: string;
  private eventsPath: string;
  private index: TaskIndex | null = null;

  constructor(
    fileSystemAdapter: FileSystemAdapter,
    repositoryRoot: ValidatedRepositoryPath,
  ) {
    this.fs = fileSystemAdapter;
    this.repositoryRoot = repositoryRoot;

    // Set up paths
    this.workPath = this.fs.join(repositoryRoot, PALACE_WORK_DIR);
    this.tasksPath = this.fs.join(this.workPath, TASKS_DIR);
    this.activePath = this.fs.join(this.tasksPath, ACTIVE_DIR);
    this.historyPath = this.fs.join(this.tasksPath, HISTORY_DIR);
    this.indexPath = this.fs.join(this.tasksPath, INDEX_FILE);
    this.eventsPath = this.fs.join(this.tasksPath, EVENTS_FILE);

    // Load index
    this.loadIndex();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private ensureWorkDir(): void {
    if (!this.fs.exists(this.workPath)) {
      this.fs.createDir(this.workPath);
    }
    if (!this.fs.exists(this.tasksPath)) {
      this.fs.createDir(this.tasksPath);
    }
  }

  private ensureActiveDir(): void {
    this.ensureWorkDir();
    if (!this.fs.exists(this.activePath)) {
      this.fs.createDir(this.activePath);
    }
  }

  private ensureHistoryDir(): void {
    this.ensureWorkDir();
    if (!this.fs.exists(this.historyPath)) {
      this.fs.createDir(this.historyPath);
    }
  }

  private loadIndex(): void {
    if (this.fs.exists(this.indexPath)) {
      try {
        const content = this.fs.readFile(this.indexPath);
        this.index = JSON.parse(content);
      } catch (error) {
        console.error("Failed to load task index, creating new one:", error);
        this.index = this.createEmptyIndex();
      }
    } else {
      this.index = this.createEmptyIndex();
    }
  }

  private createEmptyIndex(): TaskIndex {
    return {
      version: "1.0.0",
      lastUpdated: Date.now(),
      tasks: {},
      byStatus: {
        pending: [],
        acknowledged: [],
        in_progress: [],
        completed: [],
        failed: [],
      },
      bySender: {},
      byADE: {},
    };
  }

  private saveIndex(): void {
    if (!this.index) return;

    this.ensureWorkDir();

    this.index.lastUpdated = Date.now();
    this.fs.writeFile(this.indexPath, JSON.stringify(this.index, null, 2));
  }

  // ============================================================================
  // Task Creation & Receiving
  // ============================================================================

  /**
   * Receive a new task from a sender
   */
  receiveTask(input: CreateTaskInput, senderId: string): Task {
    const taskId = idGenerator.generate("task");
    const now = Date.now();

    // Extract title from content (first line or first 50 chars)
    const title = this.extractTitle(input.content);

    const task: Task = {
      id: taskId,
      title,
      content: input.content,
      status: "pending",
      priority: input.priority || "normal",
      directoryPath: input.directoryPath,
      repositoryPath: this.repositoryRoot,
      filePath: `${PALACE_WORK_DIR}/${TASKS_DIR}/${ACTIVE_DIR}/${taskId}.task.md`,
      tags: input.tags || [],
      anchors: input.anchors || [],
      senderId,
      receivedAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    // Save task file
    this.saveTaskFile(task);

    // Update index
    this.updateIndex(task);

    // Record event
    this.recordEvent({
      taskId: task.id,
      timestamp: now,
      eventType: "received",
      actor: senderId,
    });

    return task;
  }

  // ============================================================================
  // Task Status Updates
  // ============================================================================

  /**
   * Update task status when ADE acknowledges
   */
  acknowledgeTask(taskId: string, adeId: string): Task | null {
    const task = this.getTask(taskId);
    if (!task || task.status !== "pending") {
      return null;
    }

    task.status = "acknowledged";
    task.adeId = adeId;
    task.acknowledgedAt = Date.now();
    task.updatedAt = Date.now();

    this.saveTaskFile(task);
    this.updateIndex(task);
    this.recordEvent({
      taskId,
      timestamp: task.updatedAt,
      eventType: "acknowledged",
      actor: adeId,
    });

    return task;
  }

  /**
   * Mark task as in progress
   */
  startTask(taskId: string, adeId: string): Task | null {
    const task = this.getTask(taskId);
    if (
      !task ||
      (task.status !== "acknowledged" && task.status !== "pending")
    ) {
      return null;
    }

    task.status = "in_progress";
    task.adeId = adeId;
    task.startedAt = Date.now();
    task.updatedAt = Date.now();

    this.saveTaskFile(task);
    this.updateIndex(task);
    this.recordEvent({
      taskId,
      timestamp: task.updatedAt,
      eventType: "started",
      actor: adeId,
    });

    return task;
  }

  /**
   * Complete a task with git references
   */
  completeTask(taskId: string, gitRefs: GitReferences): Task | null {
    const task = this.getTask(taskId);
    if (!task || task.status === "completed") {
      return null;
    }

    task.status = "completed";
    task.gitRefs = gitRefs;
    task.completedAt = Date.now();
    task.updatedAt = Date.now();

    // Move to history (lightweight version)
    const completedTask: CompletedTask = {
      id: task.id,
      title: task.title,
      completedAt: task.completedAt,
      tags: task.tags,
      gitRefs: gitRefs,
      summary: `Completed in PR #${gitRefs.pullRequest || "N/A"}`,
      detailsUrl: gitRefs.pullRequest
        ? `${this.repositoryRoot}/pull/${gitRefs.pullRequest}`
        : undefined,
    };

    // Save lightweight completed task
    this.saveCompletedTask(completedTask);

    // Remove active task file
    const activeFile = this.fs.join(this.activePath, `${taskId}.task.md`);
    if (this.fs.exists(activeFile)) {
      this.fs.deleteFile(activeFile);
    }

    // Update index
    this.updateIndex(task);
    this.recordEvent({
      taskId,
      timestamp: task.updatedAt,
      eventType: "completed",
      actor: task.adeId || "system",
      details: { gitRefs },
    });

    return task;
  }

  /**
   * Mark task as failed
   */
  failTask(taskId: string, reason: string): Task | null {
    const task = this.getTask(taskId);
    if (!task || task.status === "failed" || task.status === "completed") {
      return null;
    }

    task.status = "failed";
    task.failedAt = Date.now();
    task.updatedAt = Date.now();

    if (!task.metadata) {
      task.metadata = {};
    }
    task.metadata.errorMessage = reason;

    this.saveTaskFile(task);
    this.updateIndex(task);
    this.recordEvent({
      taskId,
      timestamp: task.updatedAt,
      eventType: "failed",
      actor: task.adeId || "system",
      details: { reason },
    });

    return task;
  }

  /**
   * Delete a task permanently (removes from filesystem and index)
   * Unlike completeTask or failTask, this does not move to history
   */
  deleteTask(taskId: string): boolean {
    // Check if task exists in index
    if (!this.index || !this.index.tasks[taskId]) {
      return false;
    }

    const entry = this.index.tasks[taskId];

    // Remove task file from active directory (don't delete completed tasks from history)
    if (entry.status !== "completed") {
      const activeFile = this.fs.join(this.activePath, `${taskId}.task.md`);
      if (this.fs.exists(activeFile)) {
        this.fs.deleteFile(activeFile);
      }
    }

    // Remove from status lists
    const statusList = this.index.byStatus[entry.status];
    if (statusList) {
      const idx = statusList.indexOf(taskId);
      if (idx >= 0) {
        statusList.splice(idx, 1);
      }
    }

    // Remove from sender index
    if (entry.senderId && this.index.bySender[entry.senderId]) {
      const senderList = this.index.bySender[entry.senderId];
      const idx = senderList.indexOf(taskId);
      if (idx >= 0) {
        senderList.splice(idx, 1);
      }
    }

    // Remove from ADE index
    if (entry.adeId && this.index.byADE[entry.adeId]) {
      const adeList = this.index.byADE[entry.adeId];
      const idx = adeList.indexOf(taskId);
      if (idx >= 0) {
        adeList.splice(idx, 1);
      }
    }

    // Remove from main tasks index
    delete this.index.tasks[taskId];

    // Save updated index
    this.saveIndex();

    // Record event
    this.recordEvent({
      taskId,
      timestamp: Date.now(),
      eventType: "deleted",
      actor: "system",
    });

    return true;
  }

  // ============================================================================
  // Task Queries
  // ============================================================================

  /**
   * Get a single task by ID
   */
  getTask(taskId: string): Task | null {
    if (!this.index || !this.index.tasks[taskId]) {
      return null;
    }

    const entry = this.index.tasks[taskId];

    // If completed, load from history
    if (entry.status === "completed") {
      return this.loadCompletedTaskAsFull(taskId);
    }

    // Load from active directory
    const filePath = this.fs.join(this.activePath, `${taskId}.task.md`);
    if (!this.fs.exists(filePath)) {
      return null;
    }

    return this.loadTaskFromFile(filePath);
  }

  /**
   * Get next pending task (for ADE to pick up work)
   */
  getNextPendingTask(): Task | null {
    if (!this.index) return null;

    const pendingIds = this.index.byStatus.pending || [];
    if (pendingIds.length === 0) return null;

    // Get highest priority pending task
    let highestPriorityTask: Task | null = null;
    let highestPriority = -1;

    const priorityValues = { low: 0, normal: 1, high: 2, critical: 3 };

    for (const taskId of pendingIds) {
      const task = this.getTask(taskId);
      if (task) {
        const priority = priorityValues[task.priority] || 0;
        if (priority > highestPriority) {
          highestPriority = priority;
          highestPriorityTask = task;
        }
      }
    }

    return highestPriorityTask;
  }

  /**
   * Query tasks with filters
   */
  queryTasks(options?: TaskQueryOptions): Task[] {
    if (!this.index) return [];

    let taskIds = Object.keys(this.index.tasks);

    // Apply filters
    if (options) {
      // Filter by status
      if (options.status) {
        const statuses = Array.isArray(options.status)
          ? options.status
          : [options.status];
        taskIds = taskIds.filter((id) =>
          statuses.includes(this.index!.tasks[id].status),
        );
      }

      // Filter by priority
      if (options.priority) {
        const priorities = Array.isArray(options.priority)
          ? options.priority
          : [options.priority];
        taskIds = taskIds.filter((id) =>
          priorities.includes(this.index!.tasks[id].priority),
        );
      }

      // Filter by sender
      if (options.senderId) {
        taskIds = taskIds.filter(
          (id) => this.index!.tasks[id].senderId === options.senderId,
        );
      }

      // Filter by ADE
      if (options.adeId) {
        taskIds = taskIds.filter(
          (id) => this.index!.tasks[id].adeId === options.adeId,
        );
      }

      // Filter by directory
      if (options.directoryPath) {
        taskIds = taskIds.filter(
          (id) => this.index!.tasks[id].directoryPath === options.directoryPath,
        );
      }

      // Filter by tags
      if (options.tags && options.tags.length > 0) {
        taskIds = taskIds.filter((id) => {
          const taskTags = this.index!.tasks[id].tags;
          return options.tags!.some((tag) => taskTags.includes(tag));
        });
      }

      // Filter by time
      if (options.receivedAfter) {
        taskIds = taskIds.filter(
          (id) => this.index!.tasks[id].receivedAt > options.receivedAfter!,
        );
      }

      if (options.receivedBefore) {
        taskIds = taskIds.filter(
          (id) => this.index!.tasks[id].receivedAt < options.receivedBefore!,
        );
      }

      // Sort
      if (options.sortBy) {
        const direction = options.sortDirection === "desc" ? -1 : 1;

        // Special handling for priority sorting
        if (options.sortBy === "priority") {
          const priorityValues: Record<string, number> = {
            low: 0,
            normal: 1,
            high: 2,
            critical: 3,
          };

          taskIds.sort((a, b) => {
            const aPriority =
              priorityValues[this.index!.tasks[a].priority] || 0;
            const bPriority =
              priorityValues[this.index!.tasks[b].priority] || 0;
            return (aPriority - bPriority) * direction;
          });
        } else {
          taskIds.sort((a, b) => {
            const aVal = this.index!.tasks[a][options.sortBy!] as
              | string
              | number;
            const bVal = this.index!.tasks[b][options.sortBy!] as
              | string
              | number;
            return aVal > bVal ? direction : -direction;
          });
        }
      }

      // Pagination
      if (options.offset) {
        taskIds = taskIds.slice(options.offset);
      }
      if (options.limit) {
        taskIds = taskIds.slice(0, options.limit);
      }
    }

    // Load tasks
    return taskIds
      .map((id) => this.getTask(id))
      .filter((task): task is Task => task !== null);
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  private saveTaskFile(task: Task): void {
    this.ensureActiveDir();
    const filePath = this.fs.join(this.activePath, `${task.id}.task.md`);
    const content = this.serializeTask(task);
    this.fs.writeFile(filePath, content);
  }

  private saveCompletedTask(task: CompletedTask): void {
    this.ensureHistoryDir();
    const filePath = this.fs.join(this.historyPath, `${task.id}.hist.md`);
    const content = this.serializeCompletedTask(task);
    this.fs.writeFile(filePath, content);
  }

  private loadTaskFromFile(filePath: string): Task | null {
    if (!this.fs.exists(filePath)) return null;

    const content = this.fs.readFile(filePath);
    return this.deserializeTask(content);
  }

  private loadCompletedTaskAsFull(taskId: string): Task | null {
    const filePath = this.fs.join(this.historyPath, `${taskId}.hist.md`);
    if (!this.fs.exists(filePath)) return null;

    const content = this.fs.readFile(filePath);
    const completed = this.deserializeCompletedTask(content);
    if (!completed) return null;

    // Convert completed task back to full task format
    const entry = this.index!.tasks[taskId];
    return {
      id: completed.id,
      title: completed.title,
      content: `See PR #${completed.gitRefs.pullRequest} for details`,
      status: "completed",
      priority: entry.priority,
      directoryPath: entry.directoryPath as ValidatedRelativePath,
      repositoryPath: this.repositoryRoot,
      filePath: `${PALACE_WORK_DIR}/${TASKS_DIR}/${HISTORY_DIR}/${taskId}.hist.md`,
      tags: completed.tags,
      anchors: [],
      senderId: entry.senderId,
      receivedAt: entry.receivedAt,
      updatedAt: entry.updatedAt,
      completedAt: completed.completedAt,
      gitRefs: completed.gitRefs,
      adeId: entry.adeId,
    };
  }

  // ============================================================================
  // Serialization - Simple frontmatter implementation
  // ============================================================================

  /**
   * Simple frontmatter stringify function
   */
  private stringifyFrontmatter(
    content: string,
    data: Record<string, unknown>,
  ): string {
    const yaml = this.objectToYaml(data);
    return `---\n${yaml}---\n\n${content}`;
  }

  /**
   * Simple frontmatter parse function
   */
  private parseFrontmatter(content: string): {
    data: Record<string, unknown>;
    content: string;
  } {
    const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
    if (!match) {
      return { data: {}, content };
    }

    const data = this.yamlToObject(match[1]);
    return { data, content: match[2] };
  }

  /**
   * Convert object to simple YAML format
   */
  private objectToYaml(obj: Record<string, unknown>): string {
    let yaml = "";
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        yaml += `${key}:\n`;
        value.forEach((item) => {
          if (typeof item === "object") {
            yaml += `  - ${JSON.stringify(item)}\n`;
          } else {
            yaml += `  - ${item}\n`;
          }
        });
      } else if (typeof value === "object") {
        yaml += `${key}: ${JSON.stringify(value)}\n`;
      } else if (
        typeof value === "string" &&
        (value.includes(":") || value.includes("\n"))
      ) {
        yaml += `${key}: "${value.replace(/"/g, '\\"')}"\n`;
      } else {
        yaml += `${key}: ${value}\n`;
      }
    }
    return yaml;
  }

  /**
   * Parse simple YAML to object
   */
  private yamlToObject(yaml: string): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    const lines = yaml.split("\n");
    let currentKey: string | null = null;
    let currentArray: unknown[] | null = null;

    for (const line of lines) {
      if (!line.trim()) continue;

      if (line.startsWith("  - ")) {
        // Array item
        if (currentKey && currentArray) {
          const value = line.substring(4).trim();
          try {
            currentArray.push(JSON.parse(value));
          } catch {
            currentArray.push(value);
          }
        }
      } else if (line.includes(":")) {
        // Key-value pair
        const colonIndex = line.indexOf(":");
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();

        if (!value) {
          // Start of array
          currentKey = key;
          currentArray = [];
          obj[key] = currentArray;
        } else {
          // Simple value
          currentKey = null;
          currentArray = null;
          try {
            // Try to parse as JSON first (for objects, booleans, numbers)
            obj[key] = JSON.parse(value);
          } catch {
            // If it's a quoted string, remove quotes
            if (value.startsWith('"') && value.endsWith('"')) {
              obj[key] = value.slice(1, -1).replace(/\\"/g, '"');
            } else {
              obj[key] = value;
            }
          }
        }
      }
    }

    return obj;
  }

  private serializeTask(task: Task): string {
    const frontmatter = {
      id: task.id,
      status: task.status,
      priority: task.priority,
      receivedAt: new Date(task.receivedAt).toISOString(),
      updatedAt: new Date(task.updatedAt).toISOString(),
      directory: task.directoryPath,
      repository: task.repositoryPath,
      tags: task.tags,
      anchors: task.anchors,
      senderId: task.senderId,
      adeId: task.adeId,
      acknowledgedAt: task.acknowledgedAt
        ? new Date(task.acknowledgedAt).toISOString()
        : undefined,
      startedAt: task.startedAt
        ? new Date(task.startedAt).toISOString()
        : undefined,
      metadata: task.metadata,
    };

    // Remove undefined values
    const cleanFrontmatter = Object.fromEntries(
      Object.entries(frontmatter).filter(([_, v]) => v !== undefined),
    );

    const content = `# ${task.title}\n\n${task.content}`;
    return this.stringifyFrontmatter(content, cleanFrontmatter);
  }

  private serializeCompletedTask(task: CompletedTask): string {
    const frontmatter = {
      id: task.id,
      status: "completed",
      completedAt: new Date(task.completedAt).toISOString(),
      title: task.title,
      tags: task.tags,
      commitSha: task.gitRefs.commitSha,
      pullRequest: task.gitRefs.pullRequest,
      branch: task.gitRefs.branch,
      filesModified: task.gitRefs.filesModified,
    };

    // Remove undefined values
    const cleanFrontmatter = Object.fromEntries(
      Object.entries(frontmatter).filter(([_, v]) => v !== undefined),
    );

    let content = `# ${task.title}\n\n`;
    content += `## Git References\n`;
    content += `- Commit: ${task.gitRefs.commitSha}\n`;
    if (task.gitRefs.pullRequest) {
      content += `- PR: #${task.gitRefs.pullRequest}\n`;
    }
    if (task.gitRefs.branch) {
      content += `- Branch: ${task.gitRefs.branch}\n`;
    }
    content += `\n## Summary\n${task.summary || "Task completed successfully."}\n`;
    if (task.detailsUrl) {
      content += `\n## Details\nSee ${task.detailsUrl} for full implementation details.\n`;
    }

    return this.stringifyFrontmatter(content, cleanFrontmatter);
  }

  private deserializeTask(content: string): Task | null {
    try {
      const parsed = this.parseFrontmatter(content);
      const data = parsed.data;
      const body = parsed.content;

      // Extract title from body
      const titleMatch = body.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : String(data.id);

      const taskId = String(data.id);
      const status = data.status as TaskStatus;

      return {
        id: taskId,
        title,
        content: body.replace(/^#\s+.+\n\n/, ""), // Remove title line
        status,
        priority: data.priority as TaskPriority,
        directoryPath: String(data.directory) as ValidatedRelativePath,
        repositoryPath: String(data.repository) as ValidatedRepositoryPath,
        filePath:
          status === "completed"
            ? `${PALACE_WORK_DIR}/${TASKS_DIR}/${HISTORY_DIR}/${taskId}.hist.md`
            : `${PALACE_WORK_DIR}/${TASKS_DIR}/${ACTIVE_DIR}/${taskId}.task.md`,
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        anchors: Array.isArray(data.anchors) ? data.anchors.map(String) : [],
        senderId: String(data.senderId),
        adeId: data.adeId ? String(data.adeId) : undefined,
        receivedAt: new Date(String(data.receivedAt)).getTime(),
        updatedAt: new Date(String(data.updatedAt)).getTime(),
        acknowledgedAt: data.acknowledgedAt
          ? new Date(String(data.acknowledgedAt)).getTime()
          : undefined,
        startedAt: data.startedAt
          ? new Date(String(data.startedAt)).getTime()
          : undefined,
        metadata: data.metadata as TaskMetadata | undefined,
      };
    } catch (error) {
      console.error("Failed to deserialize task:", error);
      return null;
    }
  }

  private deserializeCompletedTask(content: string): CompletedTask | null {
    try {
      const parsed = this.parseFrontmatter(content);
      const data = parsed.data;

      return {
        id: String(data.id),
        title: String(data.title),
        completedAt: new Date(String(data.completedAt)).getTime(),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        gitRefs: {
          commitSha: String(data.commitSha),
          pullRequest: data.pullRequest ? Number(data.pullRequest) : undefined,
          branch: data.branch ? String(data.branch) : undefined,
          filesModified: Array.isArray(data.filesModified)
            ? data.filesModified.map(String)
            : undefined,
        },
      };
    } catch (error) {
      console.error("Failed to deserialize completed task:", error);
      return null;
    }
  }

  // ============================================================================
  // Index Management
  // ============================================================================

  private updateIndex(task: Task): void {
    if (!this.index) return;

    const entry: TaskIndexEntry = {
      id: task.id,
      status: task.status,
      priority: task.priority,
      directoryPath: task.directoryPath,
      senderId: task.senderId,
      adeId: task.adeId,
      tags: task.tags,
      receivedAt: task.receivedAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
      filePath:
        task.status === "completed"
          ? `${HISTORY_DIR}/${task.id}.hist.md`
          : `${ACTIVE_DIR}/${task.id}.task.md`,
    };

    // Remove from old status lists
    const oldEntry = this.index.tasks[task.id];
    if (oldEntry && oldEntry.status !== task.status) {
      const oldStatusList = this.index.byStatus[oldEntry.status];
      if (oldStatusList) {
        const idx = oldStatusList.indexOf(task.id);
        if (idx >= 0) oldStatusList.splice(idx, 1);
      }
    }

    // Add to new status list
    if (!this.index.byStatus[task.status]) {
      this.index.byStatus[task.status] = [];
    }
    if (!this.index.byStatus[task.status].includes(task.id)) {
      this.index.byStatus[task.status].push(task.id);
    }

    // Update sender index
    if (!this.index.bySender[task.senderId]) {
      this.index.bySender[task.senderId] = [];
    }
    if (!this.index.bySender[task.senderId].includes(task.id)) {
      this.index.bySender[task.senderId].push(task.id);
    }

    // Update ADE index
    if (task.adeId) {
      if (!this.index.byADE[task.adeId]) {
        this.index.byADE[task.adeId] = [];
      }
      if (!this.index.byADE[task.adeId].includes(task.id)) {
        this.index.byADE[task.adeId].push(task.id);
      }
    }

    // Update main entry
    this.index.tasks[task.id] = entry;

    // Save index
    this.saveIndex();
  }

  // ============================================================================
  // Event Recording
  // ============================================================================

  private recordEvent(event: TaskEvent): void {
    const line = JSON.stringify(event) + "\n";

    // Append to events file
    this.ensureWorkDir();
    if (this.fs.exists(this.eventsPath)) {
      const current = this.fs.readFile(this.eventsPath);
      this.fs.writeFile(this.eventsPath, current + line);
    } else {
      this.fs.writeFile(this.eventsPath, line);
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private extractTitle(content: string): string {
    const lines = content.split("\n");
    const firstLine = lines[0].trim();

    if (firstLine.startsWith("#")) {
      return firstLine.replace(/^#+\s*/, "");
    }

    return firstLine.substring(0, 50) + (firstLine.length > 50 ? "..." : "");
  }
}
