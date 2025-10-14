/**
 * Task Types - Work request management for Memory Palace
 */

import { ValidatedRepositoryPath, ValidatedRelativePath } from "./index";

// ============================================================================
// Task Status Types
// ============================================================================

export type TaskStatus =
  | "pending" // Task received but not yet acknowledged by ADE
  | "acknowledged" // ADE confirmed receipt
  | "in_progress" // ADE is actively working on the task
  | "completed" // Task completed successfully with git references
  | "failed"; // Task failed or was rejected

export type TaskPriority = "low" | "normal" | "high" | "critical";

// ============================================================================
// Task Core Types
// ============================================================================

/**
 * A work request task in the palace work queue
 */
export interface Task {
  /** Unique identifier for the task */
  id: string;

  /** Human-readable title extracted from content */
  title: string;

  /** The full work request in markdown format (for active tasks) */
  content: string;

  /** Current status of the task */
  status: TaskStatus;

  /** Priority level */
  priority: TaskPriority;

  /** Directory path where this task applies */
  directoryPath: ValidatedRelativePath;

  /** Repository this task belongs to */
  repositoryPath: ValidatedRepositoryPath;

  /** Relative path to the task file from repository root */
  filePath: string;

  /** Tags for categorizing the task */
  tags: string[];

  /** Files or directories this task relates to */
  anchors: string[];

  /** ID of the system/user that sent this task */
  senderId: string;

  /** ID of the principal ADE working on this task */
  adeId?: string;

  /** When the task was received */
  receivedAt: number;

  /** When the task was last updated */
  updatedAt: number;

  /** When the task was acknowledged by ADE */
  acknowledgedAt?: number;

  /** When work started on the task */
  startedAt?: number;

  /** When the task was completed */
  completedAt?: number;

  /** When the task failed */
  failedAt?: number;

  /** Git references for completed tasks */
  gitRefs?: GitReferences;

  /** Additional metadata */
  metadata?: TaskMetadata;
}

/**
 * Git references for completed tasks (lightweight)
 */
export interface GitReferences {
  /** Git commit SHA */
  commitSha: string;

  /** Pull request number */
  pullRequest?: number;

  /** Branch name */
  branch?: string;

  /** Files that were modified (optional, for quick reference) */
  filesModified?: string[];
}

/**
 * Task metadata for tracking additional information
 */
export interface TaskMetadata {
  /** Name/identifier of the requester */
  requesterName?: string;

  /** Source of the task (e.g., "mcp_server", "cli", "web") */
  source?: string;

  /** Estimated time to complete in minutes */
  estimatedMinutes?: number;

  /** Actual time spent in minutes */
  actualMinutes?: number;

  /** Error message if task failed */
  errorMessage?: string;

  /** Memory Palace elements created/modified */
  associations?: TaskAssociations;

  /** Related task IDs */
  relatedTaskIds?: string[];

  /** Parent task ID if this is a subtask */
  parentTaskId?: string;

  /** Child task IDs if this task has subtasks */
  childTaskIds?: string[];

  /** Custom fields for extensibility */
  custom?: Record<string, unknown>;
}

/**
 * Associations between tasks and Memory Palace elements
 */
export interface TaskAssociations {
  /** Note IDs created or modified */
  notes?: string[];

  /** View IDs created or modified */
  views?: string[];

  /** Room IDs created or modified */
  rooms?: string[];

  /** Drawing IDs created or modified */
  drawings?: string[];
}

// ============================================================================
// Task Request Types (Receiver Side)
// ============================================================================

/**
 * Input for receiving a new task
 */
export interface CreateTaskInput {
  /** The work request content in markdown */
  content: string;

  /** Directory where this task should be executed */
  directoryPath: ValidatedRelativePath;

  /** Priority level (defaults to "normal") */
  priority?: TaskPriority;

  /** Tags for categorization */
  tags?: string[];

  /** Related files/directories */
  anchors?: string[];

  /** Optional metadata */
  metadata?: Partial<TaskMetadata>;
}

/**
 * Options for updating a task (used by ADE)
 */
export interface UpdateTaskOptions {
  /** Update the status */
  status?: TaskStatus;

  /** Set ADE assignment */
  adeId?: string;

  /** Add git references (for completion) */
  gitRefs?: GitReferences;

  /** Update metadata */
  metadata?: Partial<TaskMetadata>;

  /** Add error message (for failure) */
  errorMessage?: string;
}

// ============================================================================
// Task Query Types
// ============================================================================

/**
 * Options for querying tasks
 */
export interface TaskQueryOptions {
  /** Filter by status */
  status?: TaskStatus | TaskStatus[];

  /** Filter by priority */
  priority?: TaskPriority | TaskPriority[];

  /** Filter by directory path */
  directoryPath?: ValidatedRelativePath;

  /** Filter by sender ID */
  senderId?: string;

  /** Filter by ADE ID */
  adeId?: string;

  /** Filter by tags (any match) */
  tags?: string[];

  /** Only tasks received after this timestamp */
  receivedAfter?: number;

  /** Only tasks received before this timestamp */
  receivedBefore?: number;

  /** Only tasks updated after this timestamp */
  updatedAfter?: number;

  /** Sort order */
  sortBy?: "receivedAt" | "updatedAt" | "priority" | "status";

  /** Sort direction */
  sortDirection?: "asc" | "desc";

  /** Limit number of results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

// ============================================================================
// Task History Types
// ============================================================================

/**
 * A lightweight completed task for history
 */
export interface CompletedTask {
  /** Task ID */
  id: string;

  /** Task title */
  title: string;

  /** Completion timestamp */
  completedAt: number;

  /** Tags for searchability */
  tags: string[];

  /** Git references (the main content) */
  gitRefs: GitReferences;

  /** Summary of what was done */
  summary?: string;

  /** Link back to full details in PR/commit */
  detailsUrl?: string;
}

/**
 * Task event for audit trail
 */
export interface TaskEvent {
  /** Task ID */
  taskId: string;

  /** When this event occurred */
  timestamp: number;

  /** Type of event */
  eventType: TaskEventType;

  /** Who/what triggered this event */
  actor: string;

  /** Additional event details */
  details?: Record<string, unknown>;
}

export type TaskEventType =
  | "received"
  | "acknowledged"
  | "started"
  | "completed"
  | "failed"
  | "deleted"
  | "association_added";

// ============================================================================
// Task Statistics Types
// ============================================================================

/**
 * Statistics about tasks in a repository
 */
export interface TaskStatistics {
  /** Total number of tasks */
  total: number;

  /** Breakdown by status */
  byStatus: Record<TaskStatus, number>;

  /** Breakdown by priority */
  byPriority: Record<TaskPriority, number>;

  /** Average time to completion in minutes */
  averageCompletionTime?: number;

  /** Tasks received in last 7 days */
  receivedLastWeek: number;

  /** Tasks completed in last 7 days */
  completedLastWeek: number;

  /** Number of tasks per directory */
  byDirectory?: Record<string, number>;

  /** Most used tags */
  topTags?: Array<{ tag: string; count: number }>;

  /** Active senders */
  activeSenders?: Array<{ senderId: string; count: number }>;
}

// ============================================================================
// Task Index Types
// ============================================================================

/**
 * Index entry for fast task lookups
 */
export interface TaskIndexEntry {
  /** Task ID */
  id: string;

  /** Current status */
  status: TaskStatus;

  /** Priority */
  priority: TaskPriority;

  /** Directory path */
  directoryPath: string;

  /** Sender ID */
  senderId: string;

  /** ADE ID if assigned */
  adeId?: string;

  /** Tags */
  tags: string[];

  /** Timestamps */
  receivedAt: number;
  updatedAt: number;
  completedAt?: number;

  /** File location */
  filePath: string;
}

/**
 * Full task index
 */
export interface TaskIndex {
  /** Version of the index format */
  version: string;

  /** Last update timestamp */
  lastUpdated: number;

  /** All task entries */
  tasks: Record<string, TaskIndexEntry>;

  /** Tasks by status for quick filtering */
  byStatus: Record<TaskStatus, string[]>;

  /** Tasks by sender for quick filtering */
  bySender: Record<string, string[]>;

  /** Tasks by ADE for quick filtering */
  byADE: Record<string, string[]>;
}
