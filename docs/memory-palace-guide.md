# MemoryPalace Guide

## What is MemoryPalace?

MemoryPalace is the core class for managing CodebaseViews and drawings within a single repository. It provides a context management system where knowledge about your codebase is organized through views and visualizations.

## Basic Usage

```typescript
import { MemoryPalace } from "@principal-ai/alexandria-core-library";
import { NodeFileSystemAdapter } from "@principal-ai/alexandria-core-library/node";

// Create filesystem adapter
const fsAdapter = new NodeFileSystemAdapter();

// Initialize for a repository
const palace = new MemoryPalace(fsAdapter, "/path/to/repo");
```

## Core Functionality

### Working with CodebaseViews

Access and validate the organization of your codebase:

```typescript
// List all available views
const views = palace.listViews();

// Get a specific view by ID
const authView = palace.getView("authentication-system");

// Validate a view's file references
const validation = palace.validateView(authView);
if (!validation.valid) {
  console.log("View has issues:", validation.issues);
}

// Save a new or updated view
palace.saveView(newView);
```

### Working with Drawings

Manage Excalidraw drawings for visual documentation:

```typescript
// Save an Excalidraw drawing
const drawingData = {
  elements: [...],
  appState: { name: "System Architecture" }
};
const drawingId = palace.saveExcalidrawDrawing(drawingData);

// Load a drawing by ID
const drawing = palace.loadExcalidrawDrawing(drawingId);

// Update drawing name
palace.updateDrawingName(drawingId, "Updated Architecture");

// Update drawing content
palace.updateExcalidrawDrawingContent(drawingId, updatedDrawingData);

// List all drawings with metadata
const drawings = palace.listDrawingsWithExtractedNames();

// Delete a drawing
palace.deleteDrawingById(drawingId);
```

### Legacy Drawing API

For simple file-based drawing storage:

```typescript
// Save/load drawings by name
palace.saveDrawing("my-diagram", jsonContent);
const content = palace.loadDrawing("my-diagram");

// List all drawings
const drawings = palace.listDrawings();

// Delete a drawing
palace.deleteDrawing("my-diagram");
```

## Key Concepts

### CodebaseViews

CodebaseViews define logical groupings of files with reference groups that connect documentation to code. They provide structured context for AI agents and developers.

### Spatial Organization

The "palace" metaphor comes from the method of loci - a memory technique using spatial visualization. Your codebase becomes a navigable space where knowledge is stored in specific locations.

### File System Abstraction

MemoryPalace uses a `FileSystemAdapter` for all I/O operations, allowing it to work in different environments (Node.js, browser, testing).

## Error Handling

MemoryPalace operations are generally safe and return null/undefined on failure:

```typescript
// Returns undefined if view doesn't exist
const view = palace.getView("nonexistent");
if (!view) {
  console.error("View not found");
}
```

## Storage Location

MemoryPalace stores all data in the `.alexandria` directory within your repository:

- `.alexandria/views/` - CodebaseView definitions
- `.alexandria/drawings/` - Excalidraw and other drawing files

## Full API

For complete method signatures and advanced usage, see:

- [MemoryPalace Implementation](src/MemoryPalace.ts)
- [TypeScript Types](src/pure-core/types/index.ts)

## Related Documentation

- [CodebaseView Concept](codebase-view-concept.md) - Understanding spatial code organization
- [Adapter Architecture](adapter-architecture.md) - Using different file system adapters

---

_Last reviewed: 2025-12-04 - Updated to reflect removal of notes, task management, and palace rooms._
