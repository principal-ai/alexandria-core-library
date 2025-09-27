/**
 * MemoryPalace - Central API for all a24z-Memory operations
 *
 * This class provides a unified interface for managing notes, views, and configurations.
 * Tools should use this class instead of directly accessing stores.
 */

import { FileSystemAdapter } from "./pure-core/abstractions/filesystem";
import {
  AnchoredNotesStore,
  StaleAnchoredNote,
} from "./pure-core/stores/AnchoredNotesStore";
import { CodebaseViewsStore } from "./pure-core/stores/CodebaseViewsStore";
import { A24zConfigurationStore } from "./pure-core/stores/A24zConfigurationStore";
import { DrawingStore, DrawingMetadata } from "./pure-core/stores/DrawingStore";
import { ExcalidrawData, RoomDrawingMetadata } from "./pure-core/types/drawing";
import { PalaceRoomStore } from "./pure-core/stores/PalaceRoomStore";
import {
  generateFullGuidanceContent,
  GuidanceContent,
} from "./pure-core/utils/guidanceGenerator";
import { buildLocalPalaceUri } from "./pure-core/utils/palaceUri";
import {
  CodebaseViewValidator,
  ValidationResult,
} from "./pure-core/validation/CodebaseViewValidator";
import { ALEXANDRIA_DIRS } from "./constants/paths";
import type {
  StoredAnchoredNote,
  AnchoredNoteWithPath,
  MemoryPalaceConfiguration,
  CodebaseView,
  ValidatedRepositoryPath,
  ValidatedRelativePath,
} from "./pure-core/types";
import type { ValidatedAlexandriaPath } from "./pure-core/types/repository";
import type {
  PalaceRoom,
  CreatePalaceRoomOptions,
  UpdatePalaceRoomOptions,
  PalaceRoomOperationResult,
} from "./pure-core/types/palace-room";
import type {
  PalacePortal,
  CreatePortalOptions,
  PortalContent,
} from "./pure-core/types/palace-portal";

export interface SaveNoteOptions {
  note: string;
  tags: string[];
  anchors: string[];
  metadata?: Record<string, unknown>;
  codebaseViewId?: string;
}

export interface CoverageReport {
  totalNotes: number;
  staleNotesCount: number;
  message: string;
}

/**
 * Central access point for all memory operations
 */
export class MemoryPalace {
  private notesStore: AnchoredNotesStore;
  private viewsStore: CodebaseViewsStore;
  private configStore: A24zConfigurationStore;
  private drawingStore: DrawingStore;
  private palaceRoomStore: PalaceRoomStore;
  private validator: CodebaseViewValidator;
  private repositoryRoot: ValidatedRepositoryPath;
  private fs: FileSystemAdapter;

  constructor(repositoryRoot: string, fileSystem: FileSystemAdapter) {
    this.fs = fileSystem;
    this.repositoryRoot = MemoryPalace.validateRepositoryPath(
      fileSystem,
      repositoryRoot,
    );
    const alexandriaPath = MemoryPalace.getAlexandriaPath(
      this.repositoryRoot,
      fileSystem,
    );

    // Initialize stores with the validated Alexandria path
    this.notesStore = new AnchoredNotesStore(fileSystem, alexandriaPath);
    this.viewsStore = new CodebaseViewsStore(fileSystem, alexandriaPath);
    this.configStore = new A24zConfigurationStore(fileSystem, alexandriaPath);
    this.drawingStore = new DrawingStore(fileSystem, alexandriaPath);
    this.palaceRoomStore = new PalaceRoomStore(fileSystem, alexandriaPath);
    this.validator = new CodebaseViewValidator(fileSystem);
  }

  /**
   * Get the Alexandria data directory path
   * Checks for existing directory and creates if needed
   */
  static getAlexandriaPath(
    repositoryPath: ValidatedRepositoryPath,
    fs: FileSystemAdapter,
  ): ValidatedAlexandriaPath {
    const alexandriaPath = fs.join(repositoryPath, ALEXANDRIA_DIRS.PRIMARY);

    // Check if alexandria exists
    if (fs.exists(alexandriaPath)) {
      return alexandriaPath as ValidatedAlexandriaPath;
    }

    // Create the alexandria directory
    try {
      fs.createDir(alexandriaPath);
      return alexandriaPath as ValidatedAlexandriaPath;
    } catch (error) {
      throw new Error(
        `Cannot create Alexandria data directory at ${alexandriaPath}. ` +
          `Make sure the repository path is writable. Error: ${error}`,
      );
    }
  }

  /**
   * Validate a repository path and return a branded type.
   * This is the single point of path validation for the entire system.
   * Can be used to validate paths before creating MemoryPalace instances.
   */
  static validateRepositoryPath(
    fs: FileSystemAdapter,
    path: string,
  ): ValidatedRepositoryPath {
    // Validate that path is absolute
    if (!fs.isAbsolute(path)) {
      throw new Error(
        `❌ directoryPath must be an absolute path starting with '/'. ` +
          `Received: "${path}". ` +
          `💡 Tip: Use absolute paths like /Users/username/projects/my-repo or /home/user/project. ` +
          `You can get the current working directory and build the absolute path from there.`,
      );
    }

    // Validate that path exists
    if (!fs.exists(path)) {
      throw new Error(
        `❌ directoryPath must point to an existing directory. ` +
          `Path does not exist: "${path}". ` +
          `Check your current working directory and build the correct absolute path.`,
      );
    }

    // Validate that it's a directory
    if (!fs.isDirectory(path)) {
      throw new Error(
        `❌ directoryPath must point to a directory, not a file. ` +
          `Received: "${path}"`,
      );
    }

    // Try to find a git repository root from this path
    try {
      const repoRoot = fs.findProjectRoot(path);
      if (repoRoot !== path) {
        throw new Error(
          `❌ directoryPath must be the git repository root, not a subdirectory. ` +
            `Received: "${path}", but repository root is: "${repoRoot}". ` +
            `💡 Tip: Navigate to the repository root directory that contains the .git folder.`,
        );
      }
    } catch {
      throw new Error(
        `❌ directoryPath must be a git repository root containing a .git directory. ` +
          `Path: "${path}" is not a git repository. ` +
          `💡 Tip: Initialize a git repository with 'git init' in your project root, or navigate to an existing git repository. ` +
          `Repository roots contain a .git directory and serve as the base for all note storage.`,
      );
    }

    // Return the branded type
    return path as ValidatedRepositoryPath;
  }

  /**
   * Validate that a target path is within a repository and return a clean relative path.
   * This ensures the target path is safe and properly formatted.
   */
  static validateRelativePath(
    repositoryRoot: ValidatedRepositoryPath,
    targetPath: string,
    fs: FileSystemAdapter,
  ): ValidatedRelativePath {
    // Ensure targetPath is absolute
    if (!fs.isAbsolute(targetPath)) {
      throw new Error(
        `❌ targetPath must be an absolute path starting with '/'. ` +
          `Received: "${targetPath}". ` +
          `💡 Tip: Use absolute paths like /Users/username/projects/my-repo/src/file.ts`,
      );
    }

    // Get relative path
    const relativePath = fs.relative(repositoryRoot, targetPath);

    // Ensure targetPath is within repositoryRoot (not outside with ../)
    if (
      relativePath.startsWith("../") ||
      relativePath === ".." ||
      relativePath.includes("..")
    ) {
      throw new Error(
        `❌ targetPath "${targetPath}" is not within repository root "${repositoryRoot}". ` +
          `Target paths must be within the repository.`,
      );
    }

    // Clean up the relative path - remove './' prefix if present
    const cleanPath = relativePath.startsWith("./")
      ? relativePath.slice(2)
      : relativePath;

    // Handle root case - if target is the repository root, return empty string
    const finalPath = cleanPath === "." ? "" : cleanPath;

    return finalPath as ValidatedRelativePath;
  }

  /**
   * Get a specific note by ID
   */
  getNoteById(noteId: string): StoredAnchoredNote | null {
    return this.notesStore.getNoteById(this.repositoryRoot, noteId);
  }

  /**
   * Delete a note by ID
   */
  deleteNoteById(noteId: string): boolean {
    return this.notesStore.deleteNoteById(this.repositoryRoot, noteId);
  }

  /**
   * Get all notes for this repository
   */
  getNotes(includeParentNotes = true): AnchoredNoteWithPath[] {
    // Get all notes from the repository root (empty string = repository root)
    const rootPath = "" as ValidatedRelativePath; // Root is represented as empty string
    return this.notesStore.getNotesForPath(
      this.repositoryRoot,
      rootPath,
      includeParentNotes,
    );
  }

  /**
   * Get notes for a specific path within the repository
   */
  getNotesForPath(
    relativePath: ValidatedRelativePath,
    includeParentNotes = true,
  ): AnchoredNoteWithPath[] {
    return this.notesStore.getNotesForPath(
      this.repositoryRoot,
      relativePath,
      includeParentNotes,
    );
  }

  /**
   * Check for stale anchored notes (anchors pointing to non-existent files)
   */
  getStaleNotes(): StaleAnchoredNote[] {
    return this.notesStore.checkStaleAnchoredNotes(this.repositoryRoot);
  }

  /**
   * Save a new note to the repository
   * Returns the saved note
   */
  saveNote(options: SaveNoteOptions): AnchoredNoteWithPath {
    return this.notesStore.saveNote({
      note: options.note,
      anchors: options.anchors,
      tags: options.tags,
      codebaseViewId: options.codebaseViewId || "default",
      metadata: options.metadata || {},
      directoryPath: this.repositoryRoot,
    });
  }

  /**
   * Get repository configuration
   */
  getConfiguration(): MemoryPalaceConfiguration {
    return this.notesStore.getConfiguration();
  }

  /**
   * Get tag descriptions
   */
  getTagDescriptions(): Record<string, string> {
    return this.notesStore.getTagDescriptions();
  }

  /**
   * Get all used tags in the repository
   */
  getUsedTags(): string[] {
    return this.notesStore.getUsedTagsForPath(this.repositoryRoot);
  }

  /**
   * Get repository guidance content
   */
  getGuidance(): string | null {
    return this.notesStore.getRepositoryGuidance(this.repositoryRoot);
  }

  /**
   * Generate full guidance content with configuration
   */
  getFullGuidance(): GuidanceContent {
    const guidance = this.getGuidance();
    const configuration = this.getConfiguration();
    const tagDescriptions = this.getTagDescriptions();
    return generateFullGuidanceContent(
      guidance,
      configuration,
      tagDescriptions,
    );
  }

  /**
   * Get basic coverage information (deprecated - returns minimal info)
   */
  getCoverageReport(): CoverageReport {
    // This is deprecated - just return basic stats
    const notes = this.getNotes(true);
    const staleNotes = this.getStaleNotes();

    return {
      totalNotes: notes.length,
      staleNotesCount: staleNotes.length,
      message:
        "Coverage reports are deprecated. Use getNotes() for note information.",
    };
  }

  /**
   * List all codebase views
   */
  listViews(): CodebaseView[] {
    return this.viewsStore.listViews(this.repositoryRoot);
  }

  /**
   * Get a specific codebase view by ID
   */
  getView(viewId: string): CodebaseView | null {
    return this.viewsStore.getView(this.repositoryRoot, viewId);
  }

  /**
   * Save a codebase view
   */
  saveView(view: CodebaseView): void {
    return this.viewsStore.saveView(this.repositoryRoot, view);
  }

  /**
   * Validate a codebase view
   */
  validateView(view: CodebaseView): ValidationResult {
    const existingViews = this.viewsStore.listViews(this.repositoryRoot);
    return this.validator.validate(this.repositoryRoot, view, existingViews);
  }

  /**
   * Save a codebase view with validation
   * Always saves the view (even if invalid) but provides validation feedback
   */
  saveViewWithValidation(view: CodebaseView): ValidationResult {
    // Validate and get potentially modified view (e.g., scope removal)
    const existingViews = this.viewsStore.listViews(this.repositoryRoot);
    const validationResult = this.validator.validate(
      this.repositoryRoot,
      view,
      existingViews,
    );

    // Add default version if missing
    let viewToSave = validationResult.validatedView;
    if (!viewToSave.version) {
      viewToSave = {
        ...viewToSave,
        version: "1.0.0",
      };
    }

    // Add timestamp if missing
    if (!viewToSave.timestamp) {
      viewToSave = {
        ...viewToSave,
        timestamp: new Date().toISOString(),
      };
    }

    // Always save the view, regardless of validation results
    this.viewsStore.saveView(this.repositoryRoot, viewToSave);

    return {
      ...validationResult,
      validatedView: viewToSave,
    };
  }

  /**
   * Replace a tag across all notes
   */
  replaceTagInNotes(oldTag: string, newTag: string): number {
    return this.notesStore.replaceTagInNotes(
      this.repositoryRoot,
      oldTag,
      newTag,
    );
  }

  /**
   * Save a tag description
   */
  saveTagDescription(tag: string, description: string): void {
    return this.notesStore.saveTagDescription(tag, description);
  }

  /**
   * Delete a tag description
   */
  deleteTagDescription(tag: string): boolean {
    return this.notesStore.deleteTagDescription(tag);
  }

  /**
   * Remove a tag from all notes
   */
  removeTagFromNotes(tag: string): number {
    return this.notesStore.removeTagFromNotes(this.repositoryRoot, tag);
  }

  /**
   * Get the repository root path
   */
  getRepositoryPath(): string {
    return this.repositoryRoot;
  }

  /**
   * Check if a file exists
   */
  fileExists(path: string): boolean {
    return this.fs.exists(path);
  }

  /**
   * Read a file
   */
  readFile(path: string): string {
    return this.fs.readFile(path);
  }

  /**
   * Write a file
   */
  writeFile(path: string, content: string): void {
    return this.fs.writeFile(path, content);
  }

  /**
   * Create a directory
   */
  createDirectory(path: string): void {
    return this.fs.createDir(path);
  }

  /**
   * Delete a file
   */
  deleteFile(path: string): void {
    return this.fs.deleteFile(path);
  }

  // ============================================================================
  // Drawing Management
  // ============================================================================

  /**
   * Save a drawing (Excalidraw JSON format)
   */
  saveDrawing(name: string, content: string): void {
    return this.drawingStore.saveDrawing(name, content);
  }

  /**
   * Save a binary drawing (PNG, etc)
   */
  saveBinaryDrawing(name: string, content: Uint8Array): void {
    return this.drawingStore.saveBinaryDrawing(name, content);
  }

  /**
   * Load a drawing
   */
  loadDrawing(name: string): string | null {
    return this.drawingStore.loadDrawing(name);
  }

  /**
   * Load a binary drawing
   */
  loadBinaryDrawing(name: string): Uint8Array | null {
    return this.drawingStore.loadBinaryDrawing(name);
  }

  /**
   * List all drawings
   */
  listDrawings(): string[] {
    return this.drawingStore.listDrawings();
  }

  /**
   * List drawings with metadata
   */
  listDrawingsWithMetadata(): DrawingMetadata[] {
    return this.drawingStore.listDrawingsWithMetadata();
  }

  /**
   * Delete a drawing
   */
  deleteDrawing(name: string): boolean {
    return this.drawingStore.deleteDrawing(name);
  }

  /**
   * Rename a drawing
   */
  renameDrawing(oldName: string, newName: string): boolean {
    return this.drawingStore.renameDrawing(oldName, newName);
  }

  /**
   * Check if a drawing exists
   */
  drawingExists(name: string): boolean {
    return this.drawingStore.drawingExists(name);
  }

  // ============================================================================
  // Room-Aware Drawing Management
  // ============================================================================

  /**
   * Save an Excalidraw drawing and associate it with a room
   */
  saveRoomDrawing(
    roomId: string,
    drawingName: string,
    drawingData: ExcalidrawData
  ): string | null {
    // Ensure the drawing has a name in appState
    if (!drawingData.appState) {
      drawingData.appState = { name: drawingName };
    } else {
      drawingData.appState.name = drawingName;
    }

    // Save the drawing and get its ID
    const drawingId = this.drawingStore.saveExcalidrawDrawing(drawingData);

    // Associate the drawing with the room
    const success = this.palaceRoomStore.addDrawingToRoom(roomId, drawingId);

    if (!success) {
      // If we couldn't add to room, delete the drawing
      this.drawingStore.deleteDrawingById(drawingId);
      return null;
    }

    return drawingId;
  }

  /**
   * Load a specific drawing for a room
   */
  loadRoomDrawing(
    roomId: string,
    drawingId: string
  ): ExcalidrawData | null {
    // Verify the drawing belongs to the room
    const room = this.palaceRoomStore.getRoom(roomId);
    if (!room || !room.drawingIds.includes(drawingId)) {
      return null;
    }

    return this.drawingStore.loadExcalidrawDrawing(drawingId);
  }

  /**
   * List all drawings for a room with metadata (names extracted from appState)
   */
  listRoomDrawings(roomId: string): RoomDrawingMetadata[] {
    const room = this.palaceRoomStore.getRoom(roomId);
    if (!room) {
      return [];
    }

    const drawings: RoomDrawingMetadata[] = [];

    for (const drawingId of room.drawingIds) {
      const metadata = this.drawingStore.getDrawingMetadata(drawingId);
      if (metadata) {
        // Add the room association
        metadata.roomIds = [roomId];
        drawings.push(metadata);
      }
    }

    return drawings;
  }

  /**
   * Update drawing name without loading full content
   */
  updateDrawingName(drawingId: string, newName: string): boolean {
    return this.drawingStore.updateDrawingName(drawingId, newName);
  }

  /**
   * Update the full content of a drawing associated with a room
   */
  updateRoomDrawingContent(
    roomId: string,
    drawingId: string,
    drawingData: ExcalidrawData,
  ): boolean {
    const room = this.palaceRoomStore.getRoom(roomId);
    if (!room || !room.drawingIds.includes(drawingId)) {
      return false;
    }

    const preparedData: ExcalidrawData = {
      ...drawingData,
      appState: {
        ...(drawingData.appState ?? {}),
      },
    };

    return this.drawingStore.updateExcalidrawDrawingContent(
      drawingId,
      preparedData,
    );
  }

  /**
   * Remove drawing from room (but keep the file)
   */
  unlinkDrawingFromRoom(roomId: string, drawingId: string): boolean {
    return this.palaceRoomStore.removeDrawingFromRoom(roomId, drawingId);
  }

  /**
   * Delete drawing completely (remove from all rooms and delete file)
   */
  deleteDrawingCompletely(drawingId: string): boolean {
    // Find all rooms that contain this drawing
    const allRooms = this.palaceRoomStore.listRooms();

    // Remove from all rooms
    for (const room of allRooms) {
      if (room.drawingIds.includes(drawingId)) {
        this.palaceRoomStore.removeDrawingFromRoom(room.id, drawingId);
      }
    }

    // Delete the file
    return this.drawingStore.deleteDrawingById(drawingId);
  }

  /**
   * Copy drawings between rooms
   */
  copyDrawingsToRoom(
    sourceRoomId: string,
    targetRoomId: string,
    drawingIds: string[]
  ): boolean {
    const sourceRoom = this.palaceRoomStore.getRoom(sourceRoomId);
    const targetRoom = this.palaceRoomStore.getRoom(targetRoomId);

    if (!sourceRoom || !targetRoom) {
      return false;
    }

    let allSuccessful = true;

    for (const drawingId of drawingIds) {
      // Verify drawing exists in source room
      if (!sourceRoom.drawingIds.includes(drawingId)) {
        allSuccessful = false;
        continue;
      }

      // Add to target room (drawing file remains the same)
      const success = this.palaceRoomStore.addDrawingToRoom(targetRoomId, drawingId);
      if (!success) {
        allSuccessful = false;
      }
    }

    return allSuccessful;
  }

  /**
   * Move drawings between rooms
   */
  moveDrawingsToRoom(
    sourceRoomId: string,
    targetRoomId: string,
    drawingIds: string[]
  ): boolean {
    const sourceRoom = this.palaceRoomStore.getRoom(sourceRoomId);
    const targetRoom = this.palaceRoomStore.getRoom(targetRoomId);

    if (!sourceRoom || !targetRoom) {
      return false;
    }

    let allSuccessful = true;

    for (const drawingId of drawingIds) {
      // Verify drawing exists in source room
      if (!sourceRoom.drawingIds.includes(drawingId)) {
        allSuccessful = false;
        continue;
      }

      // Add to target room
      const addSuccess = this.palaceRoomStore.addDrawingToRoom(targetRoomId, drawingId);

      if (addSuccess) {
        // Remove from source room
        const removeSuccess = this.palaceRoomStore.removeDrawingFromRoom(sourceRoomId, drawingId);
        if (!removeSuccess) {
          allSuccessful = false;
        }
      } else {
        allSuccessful = false;
      }
    }

    return allSuccessful;
  }

  /**
   * List all drawings across all rooms
   */
  listAllDrawings(): RoomDrawingMetadata[] {
    const allDrawings = this.drawingStore.listDrawingsWithExtractedNames();
    const allRooms = this.palaceRoomStore.listRooms();

    // Populate room associations
    for (const drawing of allDrawings) {
      drawing.roomIds = [];
      for (const room of allRooms) {
        if (room.drawingIds.includes(drawing.id)) {
          drawing.roomIds.push(room.id);
        }
      }
    }

    return allDrawings;
  }

  // ============================================================================
  // Palace Room Management
  // ============================================================================

  /**
   * List all palace rooms
   */
  listPalaceRooms(): PalaceRoom[] {
    return this.palaceRoomStore.listRooms();
  }

  /**
   * Get a specific palace room by ID
   */
  getPalaceRoom(roomId: string): PalaceRoom | null {
    return this.palaceRoomStore.getRoom(roomId);
  }

  /**
   * Create a new palace room
   */
  createPalaceRoom(
    options: CreatePalaceRoomOptions,
  ): PalaceRoomOperationResult {
    return this.palaceRoomStore.createRoom(options);
  }

  /**
   * Update a palace room
   */
  updatePalaceRoom(
    roomId: string,
    options: UpdatePalaceRoomOptions,
  ): PalaceRoomOperationResult {
    return this.palaceRoomStore.updateRoom(roomId, options);
  }

  /**
   * Delete a palace room
   */
  deletePalaceRoom(roomId: string): boolean {
    return this.palaceRoomStore.deleteRoom(roomId);
  }


  /**
   * Add a drawing to a palace room
   */
  addDrawingToPalaceRoom(roomId: string, drawingName: string): boolean {
    // Verify drawing exists
    if (!this.drawingExists(drawingName)) {
      return false;
    }
    return this.palaceRoomStore.addDrawingToRoom(roomId, drawingName);
  }

  /**
   * Remove a drawing from a palace room
   */
  removeDrawingFromPalaceRoom(roomId: string, drawingName: string): boolean {
    return this.palaceRoomStore.removeDrawingFromRoom(roomId, drawingName);
  }

  /**
   * Add a codebase view to a palace room
   */
  addCodebaseViewToPalaceRoom(roomId: string, viewId: string): boolean {
    // Verify view exists
    const view = this.getView(viewId);
    if (!view) {
      return false;
    }
    return this.palaceRoomStore.addCodebaseViewToRoom(roomId, viewId);
  }

  /**
   * Remove a codebase view from a palace room
   */
  removeCodebaseViewFromPalaceRoom(roomId: string, viewId: string): boolean {
    return this.palaceRoomStore.removeCodebaseViewFromRoom(roomId, viewId);
  }

  /**
   * Add a note to a palace room
   */
  addNoteToPalaceRoom(roomId: string, noteId: string): boolean {
    // Verify note exists
    const note = this.getNoteById(noteId);
    if (!note) {
      return false;
    }
    return this.palaceRoomStore.addNoteToRoom(roomId, noteId);
  }

  /**
   * Remove a note from a palace room
   */
  removeNoteFromPalaceRoom(roomId: string, noteId: string): boolean {
    return this.palaceRoomStore.removeNoteFromRoom(roomId, noteId);
  }

  /**
   * Find which palace room contains a specific drawing
   */
  findPalaceRoomByDrawing(drawingName: string): PalaceRoom | null {
    return this.palaceRoomStore.findRoomByDrawing(drawingName);
  }

  /**
   * Find which palace room contains a specific codebase view
   */
  findPalaceRoomByCodebaseView(viewId: string): PalaceRoom | null {
    return this.palaceRoomStore.findRoomByCodebaseView(viewId);
  }

  /**
   * Find which palace room contains a specific note
   */
  findPalaceRoomByNote(noteId: string): PalaceRoom | null {
    return this.palaceRoomStore.findRoomByNote(noteId);
  }

  // ============================================================================
  // Palace Portal Management
  // ============================================================================

  /**
   * Add a portal to a palace room
   */
  addPortalToRoom(
    roomId: string,
    portalOptions: CreatePortalOptions,
  ): PalacePortal | null {
    return this.palaceRoomStore.addPortalToRoom(roomId, portalOptions);
  }

  /**
   * Remove a portal from a palace room
   */
  removePortalFromRoom(roomId: string, portalId: string): boolean {
    return this.palaceRoomStore.removePortalFromRoom(roomId, portalId);
  }

  /**
   * Update a portal in a palace room
   */
  updatePortalInRoom(
    roomId: string,
    portalId: string,
    updates: Partial<PalacePortal>,
  ): PalacePortal | null {
    return this.palaceRoomStore.updatePortalInRoom(roomId, portalId, updates);
  }

  /**
   * Get a specific portal from a room
   */
  getPortalFromRoom(roomId: string, portalId: string): PalacePortal | null {
    return this.palaceRoomStore.getPortalFromRoom(roomId, portalId);
  }

  /**
   * List all portals in a room
   */
  listPortalsInRoom(roomId: string): PalacePortal[] {
    return this.palaceRoomStore.listPortalsInRoom(roomId);
  }

  /**
   * Find rooms that have portals to a specific target
   */
  findRoomsByPortalTarget(targetPath: string): PalaceRoom[] {
    return this.palaceRoomStore.findRoomsByPortalTarget(targetPath);
  }

  /**
   * Resolve a portal to fetch content from the target palace
   * This is a placeholder - actual implementation would depend on the target type
   */
  async resolvePortal(
    roomId: string,
    portalId: string,
  ): Promise<PortalContent> {
    const portal = this.getPortalFromRoom(roomId, portalId);

    if (!portal) {
      return {
        portalId,
        success: false,
        error: "Portal not found",
      };
    }

    // For now, just return a pending status
    // Actual implementation would:
    // 1. Check portal.target.type
    // 2. Fetch content based on type (local fs, git clone, HTTP request)
    // 3. Parse and validate the content
    // 4. Apply filters based on portal.references
    // 5. Return the filtered content

    return {
      portalId: portal.id,
      success: false,
      error: "Portal resolution not yet implemented",
      targetMetadata: {
        repositoryPath:
          portal.target.path || portal.target.gitUrl || portal.target.url,
      },
    };
  }

  /**
   * Create a Palace URI for a resource in this palace
   */
  createPalaceUri(
    resourceType: "room" | "view" | "note" | "drawing",
    resourceId: string,
  ): string {
    return buildLocalPalaceUri(this.repositoryRoot, resourceType, resourceId);
  }
}
