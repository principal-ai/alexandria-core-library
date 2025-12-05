/**
 * Pure DrawingStore - Platform-agnostic drawing storage
 *
 * This version uses dependency injection with FileSystemAdapter to work in any environment
 * Handles Excalidraw and other drawing formats
 */

import { FileSystemAdapter } from "../abstractions/filesystem";
import { ValidatedAlexandriaPath } from "../types/repository";
import { ExcalidrawData } from "../types/drawing";
import { generateId } from "../utils/idGenerator";

export interface DrawingMetadata {
  id: string;
  name: string;
  fileName: string;
  format: "excalidraw" | "svg" | "png";
  created: string;
  modified: string;
  size: number;
}

/**
 * Pure DrawingStore - Platform-agnostic drawing storage using FileSystemAdapter
 */
export class DrawingStore {
  private fs: FileSystemAdapter;
  private alexandriaPath: ValidatedAlexandriaPath;
  private drawingsDir: string;

  constructor(
    fileSystemAdapter: FileSystemAdapter,
    alexandriaPath: ValidatedAlexandriaPath,
  ) {
    this.fs = fileSystemAdapter;
    this.alexandriaPath = alexandriaPath;
    this.drawingsDir = this.fs.join(alexandriaPath, "drawings");
    // Note: Directory creation is deferred to write operations via ensureDrawingsDirectory()
  }

  /**
   * Save a drawing to storage
   */
  saveDrawing(name: string, content: string): void {
    this.ensureDrawingsDirectory();

    const fileName = this.normalizeDrawingName(name);
    const filePath = this.fs.join(this.drawingsDir, fileName);

    // For now, save as text since Excalidraw files are JSON
    // Later we can optimize with binary if needed
    this.fs.writeFile(filePath, content);
  }

  /**
   * Save a binary drawing (PNG, etc)
   */
  saveBinaryDrawing(name: string, content: Uint8Array): void {
    this.ensureDrawingsDirectory();

    const fileName = this.normalizeDrawingName(name);
    const filePath = this.fs.join(this.drawingsDir, fileName);

    this.fs.writeBinaryFile(filePath, content);
  }

  /**
   * Load a drawing from storage
   */
  loadDrawing(name: string): string | null {
    const fileName = this.normalizeDrawingName(name);
    const filePath = this.fs.join(this.drawingsDir, fileName);

    if (!this.fs.exists(filePath)) {
      return null;
    }

    try {
      return this.fs.readFile(filePath);
    } catch (error) {
      console.error(`Error reading drawing ${name}:`, error);
      return null;
    }
  }

  /**
   * Load a binary drawing
   */
  loadBinaryDrawing(name: string): Uint8Array | null {
    const fileName = this.normalizeDrawingName(name);
    const filePath = this.fs.join(this.drawingsDir, fileName);

    if (!this.fs.exists(filePath)) {
      return null;
    }

    try {
      return this.fs.readBinaryFile(filePath);
    } catch (error) {
      console.error(`Error reading binary drawing ${name}:`, error);
      return null;
    }
  }

  /**
   * List all drawings in storage
   */
  listDrawings(): string[] {
    if (!this.fs.exists(this.drawingsDir)) {
      return [];
    }

    const files = this.fs.readDir(this.drawingsDir);
    return files.filter(
      (f) =>
        f.endsWith(".excalidraw") || f.endsWith(".svg") || f.endsWith(".png"),
    );
  }

  /**
   * List drawings with metadata
   */
  listDrawingsWithMetadata(): DrawingMetadata[] {
    const drawings = this.listDrawings();
    const metadata: DrawingMetadata[] = [];

    for (const fileName of drawings) {
      // Extract format from extension
      const format = fileName.endsWith(".excalidraw")
        ? "excalidraw"
        : fileName.endsWith(".svg")
          ? "svg"
          : fileName.endsWith(".png")
            ? "png"
            : "excalidraw";

      // For now, we'll use file name as ID and name
      // In future, could read file stats for dates and size
      metadata.push({
        id: fileName,
        name: fileName,
        fileName: fileName,
        format: format as "excalidraw" | "svg" | "png",
        created: new Date().toISOString(), // Would need file stats
        modified: new Date().toISOString(), // Would need file stats
        size: 0, // Would need file stats
      });
    }

    return metadata;
  }

  /**
   * Delete a drawing
   */
  deleteDrawing(name: string): boolean {
    const fileName = this.normalizeDrawingName(name);
    const filePath = this.fs.join(this.drawingsDir, fileName);

    if (this.fs.exists(filePath)) {
      this.fs.deleteFile(filePath);
      return true;
    }

    return false;
  }

  /**
   * Rename a drawing
   */
  renameDrawing(oldName: string, newName: string): boolean {
    const oldFileName = this.normalizeDrawingName(oldName);
    const newFileName = this.normalizeDrawingName(newName);

    const oldPath = this.fs.join(this.drawingsDir, oldFileName);
    const newPath = this.fs.join(this.drawingsDir, newFileName);

    if (!this.fs.exists(oldPath)) {
      return false;
    }

    if (this.fs.exists(newPath)) {
      console.error(`Drawing ${newName} already exists`);
      return false;
    }

    try {
      const content = this.fs.readFile(oldPath);
      this.fs.writeFile(newPath, content);
      this.fs.deleteFile(oldPath);
      return true;
    } catch (error) {
      console.error(
        `Error renaming drawing from ${oldName} to ${newName}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Check if a drawing exists
   */
  drawingExists(name: string): boolean {
    const fileName = this.normalizeDrawingName(name);
    const filePath = this.fs.join(this.drawingsDir, fileName);
    return this.fs.exists(filePath);
  }

  /**
   * Ensure the drawings directory exists
   */
  private ensureDrawingsDirectory(): void {
    if (!this.fs.exists(this.drawingsDir)) {
      this.fs.createDir(this.drawingsDir);
    }
  }

  /**
   * Normalize drawing name - ensure it has proper extension
   */
  private normalizeDrawingName(name: string): string {
    // If no extension, assume .excalidraw
    if (!name.includes(".")) {
      return `${name}.excalidraw`;
    }
    return name;
  }

  // ============================================================================
  // Excalidraw Drawing Management
  // ============================================================================

  /**
   * Save an Excalidraw drawing and automatically extract the name
   */
  saveExcalidrawDrawing(data: ExcalidrawData): string {
    this.ensureDrawingsDirectory();

    const drawingId = generateId();
    const fileName = `${drawingId}.excalidraw`;
    const filePath = this.fs.join(this.drawingsDir, fileName);

    // Save the drawing
    this.fs.writeFile(filePath, JSON.stringify(data, null, 2));

    return drawingId;
  }

  /**
   * Load an Excalidraw drawing and parse it
   */
  loadExcalidrawDrawing(drawingId: string): ExcalidrawData | null {
    const fileName = `${drawingId}.excalidraw`;
    const filePath = this.fs.join(this.drawingsDir, fileName);

    if (!this.fs.exists(filePath)) {
      return null;
    }

    try {
      const content = this.fs.readFile(filePath);
      return JSON.parse(content) as ExcalidrawData;
    } catch (error) {
      console.error(`Error loading Excalidraw drawing ${drawingId}:`, error);
      return null;
    }
  }

  /**
   * Get drawing metadata including the extracted name from appState
   */
  getDrawingMetadata(drawingId: string): DrawingMetadata | null {
    const fileName = `${drawingId}.excalidraw`;
    const filePath = this.fs.join(this.drawingsDir, fileName);

    if (!this.fs.exists(filePath)) {
      return null;
    }

    try {
      const content = this.fs.readFile(filePath);
      const data = JSON.parse(content) as ExcalidrawData;

      // Get file stats if available (would need to add to FileSystemAdapter)
      const stats = {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        size: content.length,
      };

      return {
        id: drawingId,
        name: data.appState?.name || drawingId,
        fileName: fileName,
        format: "excalidraw",
        created: stats.created,
        modified: stats.modified,
        size: stats.size,
      };
    } catch (error) {
      console.error(`Error getting metadata for drawing ${drawingId}:`, error);
      return null;
    }
  }

  /**
   * Update the name of a drawing without loading the entire content
   */
  updateDrawingName(drawingId: string, newName: string): boolean {
    const fileName = `${drawingId}.excalidraw`;
    const filePath = this.fs.join(this.drawingsDir, fileName);

    if (!this.fs.exists(filePath)) {
      return false;
    }

    try {
      const content = this.fs.readFile(filePath);
      const data = JSON.parse(content) as ExcalidrawData;

      // Update the name in appState
      data.appState = data.appState || {};
      data.appState.name = newName;

      // Save the updated drawing
      this.fs.writeFile(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error(`Error updating drawing name for ${drawingId}:`, error);
      return false;
    }
  }

  /**
   * Update the full content of an Excalidraw drawing
   */
  updateExcalidrawDrawingContent(
    drawingId: string,
    updatedData: ExcalidrawData,
  ): boolean {
    const fileName = `${drawingId}.excalidraw`;
    const filePath = this.fs.join(this.drawingsDir, fileName);

    if (!this.fs.exists(filePath)) {
      return false;
    }

    try {
      let existingData: ExcalidrawData | null = null;

      try {
        const existingContent = this.fs.readFile(filePath);
        existingData = JSON.parse(existingContent) as ExcalidrawData;
      } catch {
        existingData = null;
      }

      const mergedAppState = {
        ...(existingData?.appState ?? {}),
        ...(updatedData.appState ?? {}),
        name:
          updatedData.appState?.name ??
          existingData?.appState?.name ??
          drawingId,
      };

      const contentToSave: ExcalidrawData = {
        ...updatedData,
        appState: mergedAppState,
      };

      this.fs.writeFile(filePath, JSON.stringify(contentToSave, null, 2));
      return true;
    } catch (error) {
      console.error(`Error updating drawing content for ${drawingId}:`, error);
      return false;
    }
  }

  /**
   * List all drawings with their metadata (including extracted names)
   */
  listDrawingsWithExtractedNames(): DrawingMetadata[] {
    const drawings: DrawingMetadata[] = [];

    if (!this.fs.exists(this.drawingsDir)) {
      return drawings;
    }

    const files = this.fs.readDir(this.drawingsDir);

    for (const fileName of files) {
      if (fileName.endsWith(".excalidraw")) {
        const drawingId = fileName.replace(".excalidraw", "");
        const metadata = this.getDrawingMetadata(drawingId);
        if (metadata) {
          drawings.push(metadata);
        }
      }
    }

    return drawings;
  }

  /**
   * Delete a drawing by ID
   */
  deleteDrawingById(drawingId: string): boolean {
    const fileName = `${drawingId}.excalidraw`;
    const filePath = this.fs.join(this.drawingsDir, fileName);

    if (this.fs.exists(filePath)) {
      this.fs.deleteFile(filePath);
      return true;
    }

    return false;
  }
}
