/**
 * MemoryPalace - Central API for all Alexandria Memory operations
 *
 * This class provides a unified interface for managing views, drawings, and configurations.
 * Tools should use this class instead of directly accessing stores.
 */

import { FileSystemAdapter } from "./pure-core/abstractions/filesystem";
import { GlobAdapter } from "./pure-core/abstractions/glob";
import { CodebaseViewsStore } from "./pure-core/stores/CodebaseViewsStore";
import { DrawingStore, DrawingMetadata } from "./pure-core/stores/DrawingStore";
import { ExcalidrawData } from "./pure-core/types/drawing";
import {
  CodebaseViewValidator,
  ValidationResult,
} from "./pure-core/validation/CodebaseViewValidator";
import { ALEXANDRIA_DIRS } from "./constants/paths";
import type {
  CodebaseView,
  ValidatedRepositoryPath,
  ValidatedRelativePath,
} from "./pure-core/types";
import type { ValidatedAlexandriaPath } from "./pure-core/types/repository";

/**
 * Overview information about a markdown document in the repository
 */
export interface DocumentOverview {
  /** Absolute path to the markdown file */
  path: string;
  /** Path relative to repository root */
  relativePath: string;
  /** Document title (derived from filename) */
  title: string;
  /** Whether this document is tracked by a CodebaseView */
  isTracked: boolean;
  /** The CodebaseView ID if tracked */
  viewId?: string;
  /** The CodebaseView name if tracked */
  viewName?: string;
  /** Associated source files from the CodebaseView's referenceGroups */
  associatedFiles?: string[];
}

/**
 * Options for getDocumentsOverview
 */
export interface GetDocumentsOverviewOptions {
  /** Include documents not tracked by any view (default: true) */
  includeUntracked?: boolean;
  /** Glob patterns to exclude (default: ['.palace-work/**', '.backlog/**']) */
  excludePatterns?: string[];
}

/**
 * Central access point for all memory operations
 */
export class MemoryPalace {
  private viewsStore: CodebaseViewsStore;
  private drawingStore: DrawingStore;
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
    this.viewsStore = new CodebaseViewsStore(fileSystem, alexandriaPath);
    this.drawingStore = new DrawingStore(fileSystem, alexandriaPath);
    this.validator = new CodebaseViewValidator(fileSystem);
  }

  /**
   * Get the Alexandria data directory path.
   * Returns the path whether or not the directory exists - stores handle
   * missing directories gracefully (returning empty data for reads).
   */
  static getAlexandriaPath(
    repositoryPath: ValidatedRepositoryPath,
    fs: FileSystemAdapter,
  ): ValidatedAlexandriaPath {
    const alexandriaPath = fs.join(repositoryPath, ALEXANDRIA_DIRS.PRIMARY);
    return alexandriaPath as ValidatedAlexandriaPath;
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
   * List all codebase views
   */
  listViews(): CodebaseView[] {
    return this.viewsStore.listViews(this.repositoryRoot);
  }

  /**
   * Async version of listViews for environments with async file access
   */
  async listViewsAsync(): Promise<CodebaseView[]> {
    return this.viewsStore.listViewsAsync(this.repositoryRoot);
  }

  /**
   * Get a specific codebase view by ID
   */
  getView(viewId: string): CodebaseView | null {
    return this.viewsStore.getView(this.repositoryRoot, viewId);
  }

  /**
   * Async version of getView for environments with async file access
   */
  async getViewAsync(viewId: string): Promise<CodebaseView | null> {
    return this.viewsStore.getViewAsync(this.repositoryRoot, viewId);
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
   * Get an overview of all markdown documents in the repository
   * with their Alexandria tracking status and associated files.
   *
   * @param globAdapter - Glob adapter for finding markdown files
   * @param options - Options for filtering documents
   * @returns Array of document overviews
   */
  async getDocumentsOverview(
    globAdapter: GlobAdapter,
    options: GetDocumentsOverviewOptions = {},
  ): Promise<DocumentOverview[]> {
    const { includeUntracked = true, excludePatterns = [] } = options;

    // Default exclude patterns for Alexandria internal directories
    const defaultExcludes = [
      "**/.palace-work/**",
      "**/.backlog/**",
      "**/.alexandria/**",
      "**/node_modules/**",
    ];
    const allExcludes = [...defaultExcludes, ...excludePatterns];

    // Find all markdown files using the glob adapter
    const markdownFiles = await globAdapter.findFiles(["**/*.md", "**/*.mdx"], {
      cwd: this.repositoryRoot,
      ignore: allExcludes,
      onlyFiles: true,
    });

    // Load all views and build a map of overviewPath -> view
    // Use async version to support browser environments with async file access
    const views = await this.listViewsAsync();
    const overviewPathToView = new Map<string, CodebaseView>();

    for (const view of views) {
      if (view.overviewPath) {
        // Normalize the path for comparison
        const normalizedPath = view.overviewPath.startsWith("./")
          ? view.overviewPath.slice(2)
          : view.overviewPath;
        overviewPathToView.set(normalizedPath, view);
      }
    }

    // Build document overviews
    const results: DocumentOverview[] = [];

    for (const relativePath of markdownFiles) {
      const normalizedPath = relativePath.startsWith("./")
        ? relativePath.slice(2)
        : relativePath;

      const view = overviewPathToView.get(normalizedPath);
      const isTracked = !!view;

      // Skip untracked documents if not requested
      if (!isTracked && !includeUntracked) {
        continue;
      }

      // Extract title from filename
      const filename = this.fs.basename(relativePath);
      const title = this.extractTitleFromFilename(filename);

      // Get associated files from the view's reference groups
      let associatedFiles: string[] | undefined;
      if (view?.referenceGroups) {
        const files: string[] = [];
        for (const groupName in view.referenceGroups) {
          const group = view.referenceGroups[groupName];
          if ("files" in group && Array.isArray(group.files)) {
            files.push(...group.files);
          }
        }
        if (files.length > 0) {
          associatedFiles = [...new Set(files)]; // Deduplicate
        }
      }

      const overview: DocumentOverview = {
        path: this.fs.join(this.repositoryRoot, relativePath),
        relativePath,
        title,
        isTracked,
      };

      if (view) {
        overview.viewId = view.id;
        overview.viewName = view.name;
        if (associatedFiles) {
          overview.associatedFiles = associatedFiles;
        }
      }

      results.push(overview);
    }

    // Sort by relativePath for consistent ordering
    results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    return results;
  }

  /**
   * Extract a human-readable title from a filename
   */
  private extractTitleFromFilename(filename: string): string {
    // Remove extension
    const withoutExt = filename.replace(/\.(md|mdx)$/i, "");

    // Convert kebab-case or snake_case to Title Case
    return withoutExt
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
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
  // Excalidraw Drawing Management
  // ============================================================================

  /**
   * Save an Excalidraw drawing
   */
  saveExcalidrawDrawing(drawingData: ExcalidrawData): string {
    return this.drawingStore.saveExcalidrawDrawing(drawingData);
  }

  /**
   * Load an Excalidraw drawing by ID
   */
  loadExcalidrawDrawing(drawingId: string): ExcalidrawData | null {
    return this.drawingStore.loadExcalidrawDrawing(drawingId);
  }

  /**
   * Update drawing name without loading full content
   */
  updateDrawingName(drawingId: string, newName: string): boolean {
    return this.drawingStore.updateDrawingName(drawingId, newName);
  }

  /**
   * Update the full content of a drawing
   */
  updateExcalidrawDrawingContent(
    drawingId: string,
    drawingData: ExcalidrawData,
  ): boolean {
    return this.drawingStore.updateExcalidrawDrawingContent(
      drawingId,
      drawingData,
    );
  }

  /**
   * Delete a drawing by ID
   */
  deleteDrawingById(drawingId: string): boolean {
    return this.drawingStore.deleteDrawingById(drawingId);
  }

  /**
   * Get drawing metadata
   */
  getDrawingMetadata(drawingId: string): DrawingMetadata | null {
    return this.drawingStore.getDrawingMetadata(drawingId);
  }

  /**
   * List all drawings with extracted names
   */
  listDrawingsWithExtractedNames(): DrawingMetadata[] {
    return this.drawingStore.listDrawingsWithExtractedNames();
  }
}
