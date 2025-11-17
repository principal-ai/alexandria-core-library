# Alexandria Core Library Adapter Architecture

## Overview

The Alexandria core library uses an adapter pattern for filesystem operations, allowing it to work in different JavaScript environments (Node.js, browser, testing, etc.). This design ensures the core logic remains pure and platform-agnostic while enabling environment-specific implementations.

## Core Concepts

### The FileSystemAdapter Interface

The library defines a single, clean interface for all filesystem operations:

```typescript
export interface FileSystemAdapter {
  // File operations
  exists(path: string): boolean;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  deleteFile(path: string): void;

  // Binary file operations (NEW)
  readBinaryFile(path: string): Uint8Array;
  writeBinaryFile(path: string, content: Uint8Array): void;

  // Directory operations
  createDir(path: string): void;
  readDir(path: string): string[];
  deleteDir(path: string): void;
  isDirectory(path: string): boolean;

  // Path operations
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
  dirname(path: string): string;
  isAbsolute(path: string): boolean;

  // Repository operations
  normalizeRepositoryPath(inputPath: string): string;
  findProjectRoot(inputPath: string): string;
  getRepositoryName(repositoryPath: string): string;
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                Alexandria Core Library                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │  FileSystemAdapter Interface (Abstract)           │  │
│  └───────────────────────────────────────────────────┘  │
│                          ↑                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Pure Core Logic (MemoryPalace, Stores, etc.)    │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           ↑
                    Implements
                           ↑
┌─────────────────────────────────────────────────────────┐
│                     Implementations                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────┐ │
│  │NodeFileSystem   │  │InMemoryFileSystem│  │Browser │ │
│  │Adapter          │  │Adapter           │  │Adapter │ │
│  └─────────────────┘  └─────────────────┘  └─────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Built-in Adapters

### NodeFileSystemAdapter

Production adapter for Node.js environments using native `fs` and `path` modules.

**Features:**

- Atomic writes using temp files
- Recursive directory creation
- Synchronous operations for simplicity
- Git repository detection
- Binary file support for images and other non-text formats

**Usage:**

```typescript
import { MemoryPalace } from "@principal-ai/alexandria-core-library";
import { NodeFileSystemAdapter } from "@principal-ai/alexandria-core-library/node";

const fsAdapter = new NodeFileSystemAdapter();
const palace = new MemoryPalace(fsAdapter, "/path/to/repo");
```

### InMemoryFileSystemAdapter

Testing adapter that simulates a filesystem in memory. Now located in `src/test-adapters/` for better organization.

**Features:**

- No disk I/O
- Binary file support for testing image/document operations
- Predictable behavior
- Easy state inspection
- Perfect for unit tests

**Usage:**

```typescript
import { InMemoryFileSystemAdapter, MemoryPalace } from "@principal-ai/alexandria-core-library";

const fsAdapter = new InMemoryFileSystemAdapter();
// Pre-populate with test data
fsAdapter.writeFile("/test/file.md", "# Test Content");

const palace = new MemoryPalace(fsAdapter, "/test");
```

## Using the Adapter Pattern

### In Applications

When building applications with the Alexandria core library, inject the appropriate adapter:

```typescript
import {
  MemoryPalace,
  NodeFileSystemAdapter,
  ProjectRegistryStore,
} from "@principal-ai/alexandria-core-library";
import * as os from "os";

// Create adapter instance
const fsAdapter = new NodeFileSystemAdapter();

// Use with MemoryPalace
const palace = new MemoryPalace(fsAdapter, process.cwd());

// Use with ProjectRegistryStore
const registry = new ProjectRegistryStore(fsAdapter, os.homedir());
```

### In Tests

Use the in-memory adapter for fast, isolated tests:

```typescript
import { InMemoryFileSystemAdapter } from "@principal-ai/alexandria-core-library";

describe("MyComponent", () => {
  let fsAdapter: InMemoryFileSystemAdapter;

  beforeEach(() => {
    fsAdapter = new InMemoryFileSystemAdapter();
    // Set up test filesystem state
    fsAdapter.writeFile("/.alexandria/config.json", "{}");
  });

  it("should handle file operations", () => {
    // Your test using the adapter
  });
});
```

## Creating Custom Adapters

To support new environments, implement the `FileSystemAdapter` interface:

### Example: Browser Adapter

```typescript
import { FileSystemAdapter } from "@principal-ai/alexandria-core-library";

export class BrowserFileSystemAdapter implements FileSystemAdapter {
  private storage = new Map<string, string>();

  exists(path: string): boolean {
    return (
      this.storage.has(path) ||
      localStorage.getItem(this.prefixPath(path)) !== null
    );
  }

  readFile(path: string): string {
    const content =
      this.storage.get(path) || localStorage.getItem(this.prefixPath(path));
    if (!content) throw new Error(`File not found: ${path}`);
    return content;
  }

  writeFile(path: string, content: string): void {
    this.storage.set(path, content);
    localStorage.setItem(this.prefixPath(path), content);
  }

  // ... implement other required methods

  private prefixPath(path: string): string {
    return `alexandria:${path}`;
  }
}
```

### Example: Remote API Adapter

```typescript
export class RemoteAPIAdapter implements FileSystemAdapter {
  constructor(
    private apiUrl: string,
    private authToken: string,
  ) {}

  async exists(path: string): boolean {
    const response = await fetch(`${this.apiUrl}/files/${path}`, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    return response.ok;
  }

  async readFile(path: string): string {
    const response = await fetch(`${this.apiUrl}/files/${path}`, {
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    if (!response.ok) throw new Error(`File not found: ${path}`);
    return response.text();
  }

  // ... implement other methods
}
```

## Key Design Decisions

### Synchronous vs Asynchronous

The current interface uses synchronous methods for simplicity. This works well for:

- Node.js filesystem operations
- In-memory operations
- Local storage in browsers

For async environments, consider:

1. Creating an `AsyncFileSystemAdapter` interface
2. Wrapping async operations in sync-like APIs
3. Using separate async methods where needed

### Pure Core Separation

The adapter pattern enables complete separation between:

- **Pure Core**: Business logic, data structures, algorithms
- **Adapters**: Platform-specific I/O operations
- **Applications**: Environment-specific initialization

This separation ensures:

- Testability without real filesystem
- Portability across JavaScript runtimes
- Clear boundaries and responsibilities

## Benefits

1. **Environment Agnostic**: Core logic works anywhere JavaScript runs
2. **Testability**: In-memory adapter enables fast, reliable tests
3. **Extensibility**: Easy to add support for new environments
4. **Type Safety**: TypeScript interfaces ensure implementation correctness
5. **Dependency Injection**: Clean separation of concerns

## Usage Examples

### CLI Tool

```typescript
const fsAdapter = new NodeFileSystemAdapter();
const palace = new MemoryPalace(fsAdapter, process.cwd());
const notes = palace.listNotes();
```

### VS Code Extension

```typescript
const fsAdapter = new NodeFileSystemAdapter();
const workspace = vscode.workspace.workspaceFolders[0].uri.fsPath;
const palace = new MemoryPalace(fsAdapter, workspace);
```

### Web Application

```typescript
const fsAdapter = new BrowserFileSystemAdapter();
const palace = new MemoryPalace(fsAdapter, "/virtual/root");
```

### Unit Tests

```typescript
const fsAdapter = new InMemoryFileSystemAdapter();
fsAdapter.writeFile("/test.md", "# Test");
const palace = new MemoryPalace(fsAdapter, "/");
```

## See Also

- [FileSystemAdapter Interface](src/pure-core/abstractions/filesystem.ts)
- [NodeFileSystemAdapter Implementation](src/node-adapters/NodeFileSystemAdapter.ts)
- [InMemoryFileSystemAdapter Implementation](src/test-adapters/InMemoryFileSystemAdapter.ts)

---

_Last reviewed: 2025-09-23 - Document confirmed to be up-to-date with current implementation._
