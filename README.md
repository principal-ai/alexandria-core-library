# @principal-ai/alexandria-core-library

Core library for the Principal AI Alexandria ecosystem, providing essential functionality for managing notes, views, and configurations.

## Installation

```bash
npm install @principal-ai/alexandria-core-library
# or
yarn add @principal-ai/alexandria-core-library
# or
pnpm add @principal-ai/alexandria-core-library
# or
bun add @principal-ai/alexandria-core-library
```

## Features

- **MemoryPalace**: Primary API for managing anchored notes and codebase views
- **Project Management**: Tools for managing Alexandria repositories and projects
- **Validation Rules**: Extensible rules engine for codebase validation
- **FileSystem Abstraction**: Dependency injection for filesystem operations
- **In-Memory Testing**: Built-in InMemoryFileSystemAdapter for testing

## Basic Usage

### Using MemoryPalace

```typescript
import { MemoryPalace } from "@principal-ai/alexandria-core-library";
import { NodeFileSystemAdapter } from "@principal-ai/alexandria-core-library/node";

// Initialize with filesystem adapter
const fsAdapter = new NodeFileSystemAdapter();
const memory = new MemoryPalace("/path/to/repo", fsAdapter);

// Save a note
const noteId = await memory.saveNote({
  note: "This function handles user authentication",
  anchors: ["src/auth.ts", "src/middleware/auth.ts"],
  tags: ["authentication", "security"],
  metadata: {
    author: "john.doe",
    jiraTicket: "AUTH-123",
  },
});

// Retrieve notes for a path
const notes = memory.getNotesForPath("src/auth.ts");

// List all views
const views = memory.listViews();

// Get repository guidance
const guidance = memory.getGuidance();
```

### Project Management

```typescript
import {
  ProjectRegistryStore,
  AlexandriaOutpostManager,
} from "@principal-ai/alexandria-core-library";
import { NodeFileSystemAdapter, NodeGlobAdapter } from "@principal-ai/alexandria-core-library/node";

const fsAdapter = new NodeFileSystemAdapter();

// Manage projects
const registry = new ProjectRegistryStore(fsAdapter, "/home/user");
registry.registerProject("my-project", "/path/to/project");
const projects = registry.listProjects();

// Manage Alexandria repositories
const globAdapter = new NodeGlobAdapter();
const outpost = new AlexandriaOutpostManager(fsAdapter, globAdapter);
const repos = await outpost.getAllRepositories();

// Get documentation information
const entry = repos[0];
const allDocs = await outpost.getAllDocs(entry);
const untrackedDocs = await outpost.getUntrackedDocs(entry);
```

### Testing with InMemoryFileSystemAdapter

```typescript
import { MemoryPalace, InMemoryFileSystemAdapter } from "@principal-ai/alexandria-core-library";

// Use in-memory adapter for testing
const fsAdapter = new InMemoryFileSystemAdapter();
fsAdapter.setupTestRepo("/test-repo");

const memory = new MemoryPalace("/test-repo", fsAdapter);
// ... run tests without touching real filesystem
```

## Core Exports

### Primary APIs

- `MemoryPalace` - Main API for note and view management
- `ProjectRegistryStore` - Project registry management
- `AlexandriaOutpostManager` - Alexandria repository management

### FileSystem Adapters

- `NodeFileSystemAdapter` - Node.js filesystem implementation
- `InMemoryFileSystemAdapter` - In-memory implementation for testing

### Stores

- `CodebaseViewsStore` - Manage codebase views
- `generateViewIdFromName` - Utility for view ID generation

### Utilities

- `LibraryRulesEngine` - Validation rules engine
- `ConfigValidator` - Configuration validation
- `OverviewPathAutoFix` - Auto-fix for overview paths

### Types

See the TypeScript definitions for comprehensive type exports including:

- Note types (`StoredAnchoredNote`, `AnchoredNoteWithPath`)
- View types (`CodebaseView`, `CodebaseViewSummary`)
- Repository types (`AlexandriaRepository`, `AlexandriaEntry`)
- Validation types (`ValidationResult`, `ValidationIssue`)

## License

MIT

## Contributing

This is a core library for the Principal AI Alexandria ecosystem. For issues and contributions, please visit the main repository.
