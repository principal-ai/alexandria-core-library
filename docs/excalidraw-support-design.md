# Excalidraw Support Design Document

## Overview

This document outlines the technical design for adding Excalidraw file support to the Alexandria Memory Palace system. The primary challenge is extending our text-only file system to handle binary data while maintaining backward compatibility.

## Understanding Excalidraw Files

### File Format Characteristics

Excalidraw files (`.excalidraw`) are **NOT purely binary files** - they're JSON documents with a specific structure:

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [
    {
      "id": "element-1",
      "type": "rectangle",
      "x": 100,
      "y": 100,
      "width": 200,
      "height": 100,
      "strokeColor": "#000000",
      "backgroundColor": "#ffffff"
    },
    {
      "id": "element-2",
      "type": "text",
      "x": 150,
      "y": 140,
      "text": "System Architecture",
      "fontSize": 20
    }
  ],
  "files": {
    "image-id-1": {
      "mimeType": "image/png",
      "id": "image-id-1",
      "dataURL": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA..."
    }
  }
}
```

### Key Insights

1. **Hybrid Format**: Excalidraw files are text-based JSON that can contain embedded binary data (images) as base64 strings
2. **Searchable Content**: Text elements, labels, and annotations are directly accessible in the JSON structure
3. **File Size Considerations**: Files with embedded images can become large (several MB)
4. **Version Control Friendly**: Being JSON, they work well with git (except when containing large embedded images)

## Why Binary Support Is Still Needed

While Excalidraw files are JSON, we need binary support for several reasons:

### 1. Performance Optimization

```typescript
// Current approach (text-only) - INEFFICIENT for large files
const content = fs.readFileSync(path, "utf-8"); // Forces UTF-8 decoding
const data = JSON.parse(content); // Additional parsing step

// Binary approach - MORE EFFICIENT
const buffer = fs.readFileSync(path); // Raw bytes, no decoding
const content = buffer.toString("utf-8"); // Decode only when needed
const data = JSON.parse(content); // Parse
```

### 2. Export Formats

Excalidraw can export to truly binary formats:

- **PNG exports**: Raster images of drawings
- **SVG exports**: While text-based, often treated as binary for consistency
- **PDF exports**: Binary document format

### 3. Future Extensibility

Supporting binary operations enables:

- Image attachments in notes
- PDF documentation storage
- Audio/video annotations
- Compressed file formats

### 4. Data Integrity

Binary operations preserve exact byte sequences, important for:

- Cryptographic signatures
- Checksums
- Compressed data
- Non-UTF-8 text encodings

## Current System Limitations

### FileSystemAdapter Interface

```typescript
// CURRENT - Text only
interface FileSystemAdapter {
  readFile(path: string): string; // Always returns string
  writeFile(path: string, content: string): void; // Only accepts string
}
```

**Problems:**

- Forces UTF-8 encoding on all data
- Cannot handle raw bytes
- Inefficient for large files
- Cannot store non-text formats

### Storage Assumptions

The system assumes all stored content is:

- UTF-8 encoded text
- Human-readable
- Suitable for string operations
- JSON-serializable

## Proposed Solution

### 1. Extended FileSystemAdapter

```typescript
interface FileSystemAdapter {
  // Existing text methods (backward compatible)
  readFile(path: string): string;
  writeFile(path: string, content: string): void;

  // New binary methods
  readBinaryFile(path: string): Buffer;
  writeBinaryFile(path: string, content: Buffer): void;

  // Helper to detect file type
  getFileMetadata(path: string): {
    size: number;
    mimeType?: string;
    encoding?: string;
  };
}
```

### 2. Excalidraw-Specific Handler

```typescript
class ExcalidrawHandler {
  private fs: FileSystemAdapter;

  async saveDrawing(noteId: string, drawing: ExcalidrawData): string {
    // Option 1: Save as JSON (if no large embedded images)
    if (this.isSmallDrawing(drawing)) {
      const json = JSON.stringify(drawing, null, 2);
      await this.fs.writeFile(path, json);
    }

    // Option 2: Save as binary (for large files or optimization)
    else {
      const buffer = Buffer.from(JSON.stringify(drawing));
      await this.fs.writeBinaryFile(path, buffer);
    }
  }

  async loadDrawing(attachmentId: string): ExcalidrawData {
    const path = this.getAttachmentPath(attachmentId);

    // Try binary read first (more general)
    const buffer = await this.fs.readBinaryFile(path);
    const json = buffer.toString("utf-8");
    return JSON.parse(json);
  }

  extractSearchableText(drawing: ExcalidrawData): string {
    // Extract all text elements for search indexing
    return drawing.elements
      .filter((el) => el.type === "text")
      .map((el) => el.text)
      .join(" ");
  }
}
```

### 3. Storage Organization

### 4. Room-Aware Content Updates
.alexandria/
.### 4. Room-Aware Content Updates

The MemoryPalace API now includes `updateRoomDrawingContent`, allowing callers to replace an Excalidraw payload in place while preserving existing room associations. This method delegates to `DrawingStore.updateExcalidrawDrawingContent`, which merges `appState` names safely so Excalidraw metadata stays consistent when tools apply incremental updates.

├── notes/              # Text notes (existing)
├── attachments/        # Binary and large files (new)
│   ├── excalidraw/    # Excalidraw drawings
│   │   ├── 2024/
│   │   │   ├── 01/
│   │   │   │   ├── drawing-uuid1.excalidraw
│   │   │   │   └── drawing-uuid2.excalidraw
│   ├── images/        # Exported images
│   │   ├── 2024/
│   │   │   ├── 01/
│   │   │   │   ├── export-uuid1.png
│   │   │   │   └── export-uuid2.svg
```

### 4. Metadata Integration

```typescript
interface AttachmentMetadata {
  id: string;
  type: "excalidraw" | "image" | "document";
  filename: string;
  mimeType: string;
  size: number;
  created: Date;

  // Excalidraw-specific metadata
  excalidrawMeta?: {
    version: number;
    elementCount: number;
    hasEmbeddedImages: boolean;
    textContent: string[]; // Extracted text for search
  };
}

interface StoredAnchoredNote {
  // Existing fields...
  metadata: {
    attachments?: AttachmentMetadata[];
  };
}
```

## Implementation Summary (Completed)

### What Was Built

We implemented a standalone drawing storage system that keeps things simple while providing full functionality:

1. **Binary File Support** ✅
   - Extended FileSystemAdapter interface with `readBinaryFile()` and `writeBinaryFile()` methods
   - Implemented binary operations in NodeFileSystemAdapter with atomic writes
   - Added binary support to InMemoryFileSystemAdapter for testing

2. **DrawingStore Class** ✅
   - Standalone store in `src/pure-core/stores/DrawingStore.ts`
   - Stores drawings in `.alexandria/drawings/` directory
   - Supports both text (Excalidraw JSON) and binary formats (PNG, SVG)
   - Full CRUD operations: save, load, list, delete, rename
   - Auto-adds `.excalidraw` extension if not provided

3. **MemoryPalace Integration** ✅
   - Added 9 basic methods for drawing management
   - Text operations: `saveDrawing()`, `loadDrawing()`
   - Binary operations: `saveBinaryDrawing()`, `loadBinaryDrawing()`
   - Management: `listDrawings()`, `deleteDrawing()`, `renameDrawing()`, `drawingExists()`
   - Metadata: `listDrawingsWithMetadata()`

   **NEW Room-Aware Drawing API** ✅ (Added 2025-09-26)
   - `saveRoomDrawing()` - Save and auto-associate with room in one operation
   - `loadRoomDrawing()` - Load drawing with room verification
   - `listRoomDrawings()` - List all drawings for a room with names from appState
   - `updateDrawingName()` - Update name without loading full content
   - `unlinkDrawingFromRoom()` - Remove from room but keep file
   - `deleteDrawingCompletely()` - Remove from all rooms and delete
   - `copyDrawingsToRoom()` - Copy drawings between rooms
   - `moveDrawingsToRoom()` - Move drawings between rooms
   - `listAllDrawings()` - List all drawings with room associations

4. **Comprehensive Testing** ✅
   - Full test coverage in `tests/pure-core/stores/DrawingStore.test.ts`
   - Tests for text and binary formats
   - Edge cases like extension handling and directory creation
   - All 18 tests passing

### Design Decisions

1. **Standalone vs Integrated**: We chose standalone storage (not linked to notes or CodebaseViews) to keep the initial implementation simple and let usage patterns emerge naturally.

2. **File Organization**: Drawings are stored flat in `.alexandria/drawings/` rather than with date-based organization, making them easier to find and manage.

3. **Simple API**: Rather than complex metadata structures, we provide straightforward save/load operations by name.

4. **Export Type Fixes**: Fixed TypeScript export issues by using `export type` for type-only exports throughout the codebase.

## Technical Considerations

### Performance

- **Large Files**: Excalidraw files with embedded images can be several MB
- **Solution**: Stream processing for files > 1MB
- **Caching**: Consider memory cache for frequently accessed drawings

### Search Integration

- **Text Extraction**: Parse Excalidraw JSON to extract text elements
- **Indexing**: Store extracted text in note metadata for full-text search
- **Labels**: Support searching drawing labels and annotations

### Version Control

- **Git Compatibility**: Large embedded images may bloat repository
- **Solution**: Option to store images separately or use Git LFS
- **Diff-Friendly**: Pretty-print JSON for better diffs

### Security

- **Input Validation**: Validate Excalidraw JSON structure
- **Size Limits**: Implement configurable file size limits
- **Sanitization**: Sanitize embedded data URLs

## Migration Path

### For Existing Users

1. **No Action Required**: Existing notes continue working unchanged
2. **Opt-in Feature**: Excalidraw support activated when first drawing is saved
3. **Automatic Structure**: Attachment directories created on-demand

### For Developers

1. **Update Dependencies**: Ensure FileSystemAdapter implementation supports binary
2. **API Additions**: New methods are additive, no breaking changes
3. **Testing**: Run migration tests before upgrading

## Success Criteria

1. ✅ Can save and retrieve Excalidraw files without data loss
2. ✅ Text within drawings is searchable
3. ✅ Existing functionality remains unchanged
4. ✅ Performance acceptable for files up to 10MB
5. ✅ Clear API for attachment management
6. ✅ Comprehensive test coverage

## Alternatives Considered

### Alternative 1: Store as Pure JSON

**Pros:**

- No binary support needed
- Simple implementation

**Cons:**

- Inefficient for large embedded images
- Doesn't support other binary formats
- Limited extensibility

### Alternative 2: External Storage

**Pros:**

- Keeps core library simple
- Delegates to specialized service

**Cons:**

- Additional dependency
- Complex deployment
- Synchronization challenges

### Alternative 3: Base64 Everything

**Pros:**

- Everything stays as text
- Works with current system

**Cons:**

- 33% size overhead
- Performance impact
- Not suitable for large files

## Conclusion

Adding Excalidraw support requires extending the FileSystemAdapter to handle binary data, even though Excalidraw files themselves are JSON. This extension provides the foundation for supporting not just Excalidraw drawings, but also exported images, PDFs, and future binary formats. The implementation maintains full backward compatibility while enabling rich visual documentation capabilities in the memory palace system.

---

_Last reviewed: 2025-09-27 - Added coverage for room drawing content updates alongside existing room-aware API details._
