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

- **MemoryPalace**: Primary API for managing codebase views, drawings, and repository knowledge
- **CodebaseViews**: Structured documentation-to-code linking with grid-based layouts
- **Drawing Support**: Excalidraw integration for visual diagrams and architecture drawings
- **Project Management**: Tools for managing Alexandria repositories, projects, and workspaces
- **Validation Rules**: Extensible rules engine with 7+ built-in validation rules
- **Configuration System**: YAML-based configuration with schema validation
- **Storage & Bookmarking**: Track reading history and bookmarks across Alexandria documents
- **FileSystem Abstraction**: Dependency injection for filesystem operations (Node.js, browser, in-memory)
- **Multi-Platform Support**: Separate entry points for Node.js, browser, and GitHub environments

## Basic Usage

### Using MemoryPalace

```typescript
import { MemoryPalace } from "@principal-ai/alexandria-core-library";
import { NodeFileSystemAdapter, NodeGlobAdapter } from "@principal-ai/alexandria-core-library/node";

// Initialize with filesystem adapter
const fsAdapter = new NodeFileSystemAdapter();
const palace = new MemoryPalace("/path/to/repo", fsAdapter);

// List all codebase views
const views = palace.listViews();

// Get a specific view
const view = palace.getView("authentication-overview");

// Save a view with validation
const result = palace.saveViewWithValidation({
  id: "my-view",
  name: "My View",
  description: "Overview of authentication system",
  grid: [
    [{ type: "file", files: ["src/auth.ts", "src/middleware/auth.ts"] }]
  ],
});

// Get documents overview (requires glob adapter)
const globAdapter = new NodeGlobAdapter();
const docs = await palace.getDocumentsOverview(globAdapter);

// Work with drawings
palace.saveDrawing("architecture", excalidrawContent);
const drawings = palace.listDrawingsWithMetadata();
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

const palace = new MemoryPalace("/test-repo", fsAdapter);
// ... run tests without touching real filesystem
```

### Browser Usage with FileTree Adapters

For browser environments (panels, web apps) where direct filesystem access isn't available, use the FileTree-based adapters. These work with `FileTree` data from `@principal-ai/repository-abstraction`.

```typescript
import {
  MemoryPalace,
  FileTreeFileSystemAdapter,
  FileTreeGlobAdapter,
} from "@principal-ai/alexandria-core-library";
import type { FileTree } from "@principal-ai/repository-abstraction";
import { minimatch } from "minimatch"; // or picomatch, micromatch, etc.

// FileTree and readFile are provided by your host environment
declare const fileTree: FileTree;
declare const repositoryPath: string;
declare function readFile(path: string): Promise<string>;

// Create filesystem adapter
const fsAdapter = new FileTreeFileSystemAdapter({
  fileTree,
  repositoryPath,
  readFile,
});

// Create glob adapter with your preferred glob matching library
const globAdapter = new FileTreeGlobAdapter({
  fileTree,
  repositoryPath,
  matchesPath: (pattern, path) => minimatch(path, pattern),
});

// Use MemoryPalace as normal
const palace = new MemoryPalace(repositoryPath, fsAdapter);

// Get document overview (requires glob adapter)
const docs = await palace.getDocumentsOverview(globAdapter);
```

**Key points:**
- `FileTreeFileSystemAdapter` uses `FileTree.allFiles` for metadata operations and delegates file reading to your host-provided `readFile` function
- `FileTreeGlobAdapter` efficiently filters `FileTree.allFiles` without recursive directory traversal
- You must provide a `matchesPath` function using whatever glob library is available in your environment (minimatch, picomatch, micromatch, etc.)

## Entry Points

The library provides multiple entry points for different environments:

```typescript
// Main entry - full implementation
import { MemoryPalace, LibraryRulesEngine } from "@principal-ai/alexandria-core-library";

// Node.js-specific adapters
import { NodeFileSystemAdapter, NodeGlobAdapter } from "@principal-ai/alexandria-core-library/node";

// Browser-compatible APIs
import { /* browser exports */ } from "@principal-ai/alexandria-core-library/browser";

// GitHub integration
import { /* github exports */ } from "@principal-ai/alexandria-core-library/github";

// Type-only exports (no runtime code)
import type { CodebaseView, AlexandriaRepository } from "@principal-ai/alexandria-core-library/types";
```

## Core Exports

### Primary APIs

- `MemoryPalace` - Main API for view, drawing, and repository knowledge management
- `ProjectRegistryStore` - Project registry management
- `AlexandriaOutpostManager` - Alexandria repository management
- `WorkspaceManager` - Team workspace and membership management

### FileSystem Adapters

- `NodeFileSystemAdapter` - Node.js filesystem implementation (from `/node` entry point)
- `NodeGlobAdapter` - Node.js glob implementation (from `/node` entry point)
- `InMemoryFileSystemAdapter` - In-memory implementation for testing
- `FileTreeFileSystemAdapter` - Browser-compatible adapter using FileTree metadata
- `FileTreeGlobAdapter` - Browser-compatible glob adapter using FileTree metadata

### Stores

- `CodebaseViewsStore` - Manage codebase views
- `DrawingStore` - Manage Excalidraw drawings and diagrams
- `generateViewIdFromName` - Utility for view ID generation

### Configuration

- `ConfigLoader` - Load and parse Alexandria configuration files
- `ConfigValidator` - Configuration validation
- `CONFIG_FILENAME` - Default configuration filename constant

### Validation & Rules

- `LibraryRulesEngine` - Validation rules engine with 7+ built-in rules
- `OverviewPathAutoFix` - Auto-fix for overview paths

### Storage & Bookmarking

- `ReadingRecordManager` - Track reading history and bookmarks
- `MemoryReadingRecordAdapter` - In-memory storage adapter
- `LocalStorageReadingRecordAdapter` - Browser localStorage adapter

### Utilities

- `matchesPatterns` - Pattern matching utility
- `getExcludePatterns` - Get exclusion patterns from config
- `filterByExcludePatterns` - Filter files by exclusion patterns
- `hasAlexandriaWorkflow` - Check if repository has Alexandria workflow
- `hasMemoryNotes` - Check if repository has memory notes
- `isLocationBound` - Check if a file is location-bound
- `LOCATION_BOUND_FILES` - List of location-bound file patterns

### Types

See the TypeScript definitions for comprehensive type exports including:

- View types (`CodebaseView`, `CodebaseViewSummary`, `CodebaseViewCell`)
- Repository types (`AlexandriaRepository`, `AlexandriaEntry`, `GithubRepository`)
- Drawing types (`DrawingMetadata`, `ExcalidrawData`)
- Validation types (`ValidationResult`, `ValidationIssue`, `LibraryRuleViolation`)
- Storage types (`AlexandriaVisit`, `AlexandriaBookmark`, `AlexandriaLibraryCard`)
- Workspace types (`Workspace`, `WorkspaceMembership`)
- Config types (`AlexandriaConfig`, `RuleOptions`, `RuleSeverity`)

## License

Apache-2.0

## Contributing

This is a core library for the Principal AI Alexandria ecosystem. For issues and contributions, please visit the main repository.
