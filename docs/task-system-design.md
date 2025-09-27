# Memory Palace Task System Design

## Overview

The Task System extends Memory Palace to handle work requests from MCP servers and other sources. It provides a persistent queue for development tasks, tracks their lifecycle, and integrates with git for historical tracking.

**Important Design Decision**: Tasks are stored separately from the core Memory Palace data (`.alexandria/`) in a dedicated `.palace-work/` directory. This separation reflects the fundamental difference between knowledge storage (Memory Palace) and operational work queues (Tasks).

## Core Concepts

### 1. Task
A **Task** represents a unit of work requested for a specific directory/repository. Tasks are stored as markdown files and tracked through their lifecycle from request to completion.

### 2. Principal ADE (Autonomous Development Entity)
The system that processes tasks. When available, tasks are sent to the ADE for execution. The system tracks whether the ADE has acknowledged and is working on tasks.

### 3. Task Association
Links between tasks and the Memory Palace elements (notes, rooms, views) that may be created or modified as part of task completion.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 MCP Server                      │
│         (Creates work requests)                 │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│              TaskManager                        │
│  - Receives requests                            │
│  - Creates tasks                                │
│  - Manages lifecycle                            │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│               TaskStore                         │
│  - Persists to .palace-work/tasks/              │
│  - Handles task queries                         │
│  - Manages associations                         │
└────────────────┬────────────────────────────────┘
                 │
        ┌────────┴────────┬──────────────┐
        ▼                 ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Active     │ │   History    │ │   Archive    │
│   Tasks      │ │   Tasks      │ │   Tasks      │
│  (*.task.md) │ │ (*.hist.md)  │ │  (*.arch.md) │
└──────────────┘ └──────────────┘ └──────────────┘
```

## File Structure

```
repository/
├── .alexandria/          # Knowledge & memory storage
│   ├── notes/           # Anchored notes
│   ├── views/           # Codebase views
│   ├── rooms/           # Palace rooms
│   └── drawings/        # Excalidraw diagrams
├── .palace-work/         # Operational work data
│   ├── tasks/
│   │   ├── active/      # Current tasks
│   │   │   ├── {taskId}.task.md
│   │   │   └── ...
│   │   ├── history/     # Completed tasks with git references
│   │   │   ├── {taskId}.hist.md
│   │   │   └── ...
│   │   ├── archive/     # Old tasks for long-term storage
│   │   │   ├── {year}/
│   │   │   │   ├── {taskId}.arch.md
│   │   │   │   └── ...
│   │   └── index.json   # Task index and associations
│   ├── requests/        # Future: other request types
│   └── workflows/       # Future: workflow definitions
```

### Rationale for Separation

1. **Conceptual Clarity**: Memory Palace (`.alexandria/`) stores knowledge and organizational structures, while `.palace-work/` handles operational concerns
2. **Lifecycle Differences**: Tasks are ephemeral work items with different retention policies than permanent knowledge
3. **Access Patterns**: MCP servers and ADEs primarily interact with `.palace-work/`, while knowledge tools focus on `.alexandria/`
4. **Independent Evolution**: The task system can evolve separately from the core Memory Palace
5. **Permission Models**: Different access controls can be applied to knowledge vs work queues

## Task Lifecycle

```
┌─────────┐      ┌──────┐      ┌──────────────┐      ┌────────────┐
│ Pending │ ───► │ Sent │ ───► │ Acknowledged │ ───► │ In Progress│
└─────────┘      └──────┘      └──────────────┘      └────────────┘
                     │                                       │
                     ▼                                       ▼
               ┌─────────┐                           ┌────────────┐
               │ Failed  │                           │ Completed  │
               └─────────┘                           └────────────┘
                     │                                       │
                     └───────────┬───────────────────────────┘
                                 ▼
                           ┌──────────┐
                           │ Archived │
                           └──────────┘
```

### States

1. **Pending**: Task created but not yet sent to ADE
2. **Sent**: Task sent to ADE, awaiting acknowledgment
3. **Acknowledged**: ADE confirmed receipt
4. **In Progress**: ADE is actively working on the task
5. **Completed**: Task finished successfully
6. **Failed**: Task could not be completed
7. **Archived**: Task moved to long-term storage

## Task Format (Markdown)

```markdown
---
id: task-uuid-here
status: pending
priority: normal
created: 2025-01-15T10:30:00Z
updated: 2025-01-15T10:30:00Z
directory: /path/to/directory
repository: /path/to/repo
tags: [feature, api, documentation]
anchors: [src/api.ts, docs/api.md]
ade_id: principal-ade-1
---

# Task: Implement User Authentication API

## Request
Add JWT-based authentication to the REST API with the following requirements:
- Support login/logout endpoints
- Implement token refresh mechanism
- Add middleware for protected routes

## Context
This is part of the security enhancement initiative. The existing API has no authentication.

## Acceptance Criteria
- [ ] Login endpoint validates credentials and returns JWT
- [ ] Logout endpoint invalidates tokens
- [ ] Refresh endpoint extends token validity
- [ ] Protected routes require valid JWT
- [ ] Tests cover all auth flows

## Metadata
requester: john.doe
source: mcp_server
estimated_minutes: 240
```

## Task Completion Format (Lightweight)

When a task is completed, it becomes a lightweight reference to the git history:

```markdown
---
id: task-uuid-here
status: completed
completed: 2025-01-16T14:20:00Z
title: Implement User Authentication API
tags: [feature, api, authentication]
---

# Task: Implement User Authentication API

## Git References
- Commit: abc123def456
- PR: #42
- Branch: feature/auth-api

## Summary
JWT authentication implemented with login/logout endpoints and token refresh.

## Details
See PR #42 for full implementation details and discussion.
```

**Note**: The full task content and history is preserved in the git commit message and PR description. The completed task file only maintains essential references to avoid duplication and save space.

## API Design

### TaskManager Class

```typescript
class TaskManager {
  // ====== RECEIVER SIDE (Memory Palace/ADE) ======
  // These methods are used by the system receiving and processing tasks

  // Receive a new task from a sender (MCP server, CLI, etc)
  receiveTask(input: CreateTaskInput, senderId: string): Task

  // ADE acknowledges receipt of task
  acknowledgeTask(taskId: string, adeId: string): Task

  // ADE starts working on task
  startTask(taskId: string, adeId: string): Task

  // ADE completes task with git reference
  completeTask(taskId: string, commitSha: string, prNumber?: number): Task

  // ADE reports task failure
  failTask(taskId: string, reason: string): Task

  // Query tasks (for ADE to find work)
  queryPendingTasks(adeId?: string): Task[]
  queryTasks(options: TaskQueryOptions): Task[]

  // Associate task with created/modified Memory Palace elements
  addTaskAssociation(taskId: string, elementType: string, elementId: string): void

  // ====== SENDER SIDE (MCP Server) ======
  // These methods are used by systems sending tasks

  // Check if task was received
  getTaskStatus(taskId: string): TaskStatus | null

  // Get updates on sent tasks
  getTaskUpdates(senderId: string, since?: number): Task[]

  // ====== MAINTENANCE (System) ======
  // These methods are used for system maintenance

  // Archive old tasks based on policy
  archiveTasks(policy: TaskArchivalPolicy): number

  // Get task statistics
  getStatistics(): TaskStatistics

  // Clean up orphaned tasks
  cleanupOrphanedTasks(): number
}
```

### Integration with MemoryPalace

```typescript
class MemoryPalace {
  // Existing methods...

  // ====== RECEIVER SIDE (Used by ADE) ======

  // Receive and queue a task
  receiveTask(input: CreateTaskInput, senderId: string): Task

  // Get next task to work on
  getNextPendingTask(): Task | null

  // Update task progress
  acknowledgeTask(taskId: string): Task
  startWorkingOnTask(taskId: string): Task
  completeTask(taskId: string, gitRefs: GitReferences): Task
  failTask(taskId: string, error: string): Task

  // ====== QUERY SIDE (Used by both) ======

  // Query tasks
  getTask(taskId: string): Task | null
  getTasks(options?: TaskQueryOptions): Task[]
  getActiveTasks(): Task[]  // All non-archived tasks

  // Task associations
  getTasksForNote(noteId: string): Task[]
  getTasksForRoom(roomId: string): Task[]
  getTasksForView(viewId: string): Task[]

  // ====== MAINTENANCE (System) ======

  // Archive completed/failed tasks
  archiveTasks(): number

  // Clean up old archives
  cleanupArchives(olderThanDays: number): number
}

interface GitReferences {
  commitSha: string;
  pullRequest?: number;
  branch?: string;
  filesModified?: string[];
}
```

## Git Integration

### Commit Message Generation

Tasks can generate standardized commit messages:

```
[Task: {taskId}] {summary}

{description}

Task completed: {completedAt}
Files modified: {files}
Tags: {tags}
```

### Commit Metadata

Store task reference in commit message for traceability:

```bash
git commit -m "[Task: abc-123] Implement auth API" \
  --trailer "Task-Id: abc-123" \
  --trailer "Task-Priority: high" \
  --trailer "Task-Tags: auth, api"
```

## Archival Strategy

### Active Tasks
- Stored in `.palace-work/tasks/active/`
- Retained while status is pending, sent, acknowledged, or in_progress
- Indexed for fast queries

### History
- Moved to `.palace-work/tasks/history/` when completed or failed
- Includes git references (commit SHA, PR number)
- Retained for configurable period (default: 90 days)

### Archive
- Long-term storage in `.palace-work/tasks/archive/{year}/`
- Compressed and organized by year
- Searchable through index
- Never automatically deleted

### Cleanup Policy

```typescript
interface TaskArchivalPolicy {
  archiveCompletedAfterDays: 90,    // Move to history
  archiveFailedAfterDays: 30,       // Move failed tasks sooner
  moveToArchiveAfterDays: 365,      // Move to long-term archive
  deleteArchivedAfterDays: 0,       // Never delete (0 = keep forever)
  maxActiveTasks: 1000,             // Limit active tasks
  preserveTags: ["important", "milestone"]  // Never archive these
}
```

## Query Capabilities

### By Status
```typescript
// Get all pending tasks
palace.getTasks({ status: "pending" })

// Get active tasks (multiple statuses)
palace.getTasks({ status: ["pending", "sent", "in_progress"] })
```

### By Time
```typescript
// Tasks from last week
palace.getTasks({
  createdAfter: Date.now() - 7 * 24 * 60 * 60 * 1000
})
```

### By Directory
```typescript
// Tasks for specific directory
palace.getTasks({
  directoryPath: "src/api" as ValidatedRelativePath
})
```

### By Association
```typescript
// Tasks that modified a specific note
palace.getTasksForNote(noteId)

// Tasks in a palace room
palace.getTasksForRoom(roomId)
```

## MCP Server Integration

### Sender Side (MCP Server)

```typescript
// MCP Server sends a task to Memory Palace
const task = await palaceClient.receiveTask({
  content: "Implement new feature as described...",
  directoryPath: "/project/src",
  priority: "high",
  tags: ["feature", "urgent"],
  metadata: {
    requesterId: "user-123",
    source: "mcp_server"
  }
}, "mcp-server-1");

console.log(`Task ${task.id} sent to Palace, status: ${task.status}`);

// Later, check status
const status = await palaceClient.getTaskStatus(task.id);
if (status === "completed") {
  const completedTask = await palaceClient.getTask(task.id);
  console.log(`Task completed in PR #${completedTask.pullRequest}`);
}
```

### Receiver Side (Principal ADE)

```typescript
// ADE polls for pending tasks
const pendingTasks = await palace.getNextPendingTask();

if (pendingTasks) {
  // Acknowledge receipt
  await palace.acknowledgeTask(pendingTasks.id);

  // Start working
  await palace.startWorkingOnTask(pendingTasks.id);

  // ... do the work ...

  // Complete with git references
  await palace.completeTask(pendingTasks.id, {
    commitSha: "abc123",
    pullRequest: 42,
    branch: "feature/auth-api",
    filesModified: ["src/auth.ts", "tests/auth.test.ts"]
  });
}
```

## Benefits

1. **Persistence**: Tasks survive system restarts
2. **Traceability**: Git integration provides audit trail
3. **Scalability**: Can handle many tasks across repositories
4. **Flexibility**: Works with or without ADE availability
5. **History**: Long-term record of all work done
6. **Association**: Links tasks to Memory Palace elements
7. **Statistics**: Track productivity and patterns

## Directory Management

### Initialization

The `.palace-work/` directory is created separately from `.alexandria/`:

```typescript
class PalaceWorkManager {
  static initializePalaceWork(repositoryPath: string): void {
    const workPath = path.join(repositoryPath, '.palace-work');
    if (!fs.existsSync(workPath)) {
      fs.mkdirSync(workPath);
      fs.mkdirSync(path.join(workPath, 'tasks'));
      fs.mkdirSync(path.join(workPath, 'tasks', 'active'));
      fs.mkdirSync(path.join(workPath, 'tasks', 'history'));
      fs.mkdirSync(path.join(workPath, 'tasks', 'archive'));
    }
  }
}
```

### Cross-Reference with Memory Palace

While stored separately, tasks maintain references to Memory Palace elements:

```typescript
interface TaskAssociations {
  // References to .alexandria/ elements
  notes: string[];      // Note IDs created/modified
  views: string[];      // View IDs created/modified
  rooms: string[];      // Room IDs created/modified
  drawings: string[];   // Drawing IDs created/modified

  // Stored in .palace-work/tasks/index.json
  // Allows querying tasks by their Memory Palace associations
}
```

## Implementation Phases

### Phase 1: Core Task System
- [ ] Task types and interfaces
- [ ] TaskStore for persistence
- [ ] Basic CRUD operations
- [ ] Status management

### Phase 2: ADE Integration
- [ ] Send/acknowledge protocol
- [ ] Status synchronization
- [ ] Error handling
- [ ] Retry logic

### Phase 3: Git Integration
- [ ] Commit message generation
- [ ] Commit SHA tracking
- [ ] PR association
- [ ] File change tracking

### Phase 4: Archival & History
- [ ] Move completed tasks to history
- [ ] Archive old tasks
- [ ] Cleanup policies
- [ ] Search capabilities

### Phase 5: Advanced Features
- [ ] Task dependencies
- [ ] Subtasks
- [ ] Task templates
- [ ] Batch operations
- [ ] Analytics dashboard

## Open Questions

1. **Task Deduplication**: How to handle duplicate requests?
2. **Task Prioritization**: Should we auto-prioritize based on patterns?
3. **ADE Assignment**: Support multiple ADEs working on different tasks?
4. **Task Templates**: Predefined templates for common tasks?
5. **Notifications**: How to notify about task status changes?
6. **Permissions**: Who can create/modify/delete tasks?
7. **Task Dependencies**: Support for dependent/blocking tasks?
8. **Estimation**: How to improve time estimates over time?

## Security Considerations

1. **Input Validation**: Sanitize markdown content
2. **Path Validation**: Ensure paths are within repository
3. **Size Limits**: Cap task content size
4. **Rate Limiting**: Prevent task spam
5. **Access Control**: Verify requester permissions
6. **Audit Logging**: Track all task operations

## Performance Considerations

1. **Indexing**: Maintain index for fast queries
2. **Pagination**: Support for large task lists
3. **Caching**: Cache frequently accessed tasks
4. **Compression**: Compress archived tasks
5. **Batch Operations**: Efficient bulk updates
6. **Lazy Loading**: Load task details on demand