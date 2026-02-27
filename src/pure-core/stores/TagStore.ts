/**
 * Pure TagStore - Platform-agnostic document tag storage
 *
 * Stores tag definitions and assignments in a single tags.json file.
 * Uses dependency injection with FileSystemAdapter to work in any environment.
 */

import { FileSystemAdapter } from "../abstractions/filesystem";
import {
  DocumentTags,
  TagDefinition,
  TagAssignmentResult,
  TagValidationResult,
} from "../types/tags";
import { ValidatedAlexandriaPath } from "../types/repository";

/**
 * Default empty tags structure
 */
function createEmptyTags(): DocumentTags {
  return {
    definitions: {},
    assignments: {},
  };
}

/**
 * Pure TagStore - Platform-agnostic tag storage using FileSystemAdapter
 */
export class TagStore {
  private fs: FileSystemAdapter;
  private alexandriaPath: ValidatedAlexandriaPath;
  private tagsFilePath: string;

  constructor(
    fileSystemAdapter: FileSystemAdapter,
    alexandriaPath: ValidatedAlexandriaPath,
  ) {
    this.fs = fileSystemAdapter;
    this.alexandriaPath = alexandriaPath;
    this.tagsFilePath = this.fs.join(alexandriaPath, "tags.json");
  }

  // ============================================================================
  // Core Read/Write Operations
  // ============================================================================

  /**
   * Get all tags data (definitions and assignments).
   */
  getTags(): DocumentTags {
    if (!this.fs.exists(this.tagsFilePath)) {
      return createEmptyTags();
    }

    try {
      const content = this.fs.readFile(this.tagsFilePath);
      return JSON.parse(content) as DocumentTags;
    } catch (error) {
      console.error("Error reading tags.json:", error);
      return createEmptyTags();
    }
  }

  /**
   * Async version of getTags for environments with async file access.
   */
  async getTagsAsync(): Promise<DocumentTags> {
    if (!this.fs.exists(this.tagsFilePath)) {
      return createEmptyTags();
    }

    try {
      const content = this.fs.readFileAsync
        ? await this.fs.readFileAsync(this.tagsFilePath)
        : this.fs.readFile(this.tagsFilePath);
      return JSON.parse(content) as DocumentTags;
    } catch (error) {
      console.error("Error reading tags.json:", error);
      return createEmptyTags();
    }
  }

  /**
   * Save all tags data.
   */
  saveTags(tags: DocumentTags): void {
    // Ensure .alexandria directory exists
    if (!this.fs.exists(this.alexandriaPath)) {
      this.fs.createDir(this.alexandriaPath);
    }
    this.fs.writeFile(this.tagsFilePath, JSON.stringify(tags, null, 2));
  }

  // ============================================================================
  // Tag Definition Operations
  // ============================================================================

  /**
   * Get all tag definitions.
   */
  getDefinitions(): Record<string, TagDefinition> {
    return this.getTags().definitions;
  }

  /**
   * Get a specific tag definition.
   */
  getDefinition(tagName: string): TagDefinition | null {
    return this.getTags().definitions[tagName] || null;
  }

  /**
   * Check if a tag is defined.
   */
  isTagDefined(tagName: string): boolean {
    return tagName in this.getTags().definitions;
  }

  /**
   * Define a new tag or update an existing one.
   */
  defineTag(name: string, definition: TagDefinition): void {
    const tags = this.getTags();
    tags.definitions[name] = definition;
    this.saveTags(tags);
  }

  /**
   * Define multiple tags at once.
   */
  defineTags(definitions: Record<string, TagDefinition>): void {
    const tags = this.getTags();
    tags.definitions = { ...tags.definitions, ...definitions };
    this.saveTags(tags);
  }

  /**
   * Remove a tag definition and all its assignments.
   */
  removeTagDefinition(tagName: string): boolean {
    const tags = this.getTags();

    if (!(tagName in tags.definitions)) {
      return false;
    }

    // Remove the definition
    delete tags.definitions[tagName];

    // Remove from all assignments
    for (const filePath of Object.keys(tags.assignments)) {
      tags.assignments[filePath] = tags.assignments[filePath].filter(
        (t) => t !== tagName,
      );
      // Clean up empty assignments
      if (tags.assignments[filePath].length === 0) {
        delete tags.assignments[filePath];
      }
    }

    this.saveTags(tags);
    return true;
  }

  /**
   * Rename a tag, updating all assignments.
   */
  renameTag(oldName: string, newName: string): boolean {
    const tags = this.getTags();

    if (!(oldName in tags.definitions) || newName in tags.definitions) {
      return false;
    }

    // Move definition
    tags.definitions[newName] = tags.definitions[oldName];
    delete tags.definitions[oldName];

    // Update all assignments
    for (const filePath of Object.keys(tags.assignments)) {
      tags.assignments[filePath] = tags.assignments[filePath].map((t) =>
        t === oldName ? newName : t,
      );
    }

    this.saveTags(tags);
    return true;
  }

  // ============================================================================
  // Tag Assignment Operations
  // ============================================================================

  /**
   * Assign tags to a document with validation.
   * Only tags that exist in definitions will be assigned.
   */
  assignTags(filePath: string, tagNames: string[]): TagAssignmentResult {
    const tags = this.getTags();
    const assigned: string[] = [];
    const invalidTags: string[] = [];

    for (const tagName of tagNames) {
      if (tagName in tags.definitions) {
        assigned.push(tagName);
      } else {
        invalidTags.push(tagName);
      }
    }

    if (assigned.length > 0) {
      // Merge with existing tags, avoiding duplicates
      const existing = tags.assignments[filePath] || [];
      const merged = [...new Set([...existing, ...assigned])];
      tags.assignments[filePath] = merged;
      this.saveTags(tags);
    }

    return {
      success: invalidTags.length === 0,
      assigned,
      invalidTags,
    };
  }

  /**
   * Set tags for a document, replacing any existing tags.
   * Only tags that exist in definitions will be assigned.
   */
  setTags(filePath: string, tagNames: string[]): TagAssignmentResult {
    const tags = this.getTags();
    const assigned: string[] = [];
    const invalidTags: string[] = [];

    for (const tagName of tagNames) {
      if (tagName in tags.definitions) {
        assigned.push(tagName);
      } else {
        invalidTags.push(tagName);
      }
    }

    if (assigned.length > 0) {
      tags.assignments[filePath] = assigned;
    } else {
      // Remove assignment if no valid tags
      delete tags.assignments[filePath];
    }

    this.saveTags(tags);

    return {
      success: invalidTags.length === 0,
      assigned,
      invalidTags,
    };
  }

  /**
   * Remove specific tags from a document.
   */
  removeTags(filePath: string, tagNames: string[]): void {
    const tags = this.getTags();

    if (!(filePath in tags.assignments)) {
      return;
    }

    tags.assignments[filePath] = tags.assignments[filePath].filter(
      (t) => !tagNames.includes(t),
    );

    // Clean up empty assignments
    if (tags.assignments[filePath].length === 0) {
      delete tags.assignments[filePath];
    }

    this.saveTags(tags);
  }

  /**
   * Remove all tags from a document.
   */
  clearTags(filePath: string): void {
    const tags = this.getTags();
    delete tags.assignments[filePath];
    this.saveTags(tags);
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  /**
   * Get all tags assigned to a document.
   */
  getTagsForDocument(filePath: string): string[] {
    return this.getTags().assignments[filePath] || [];
  }

  /**
   * Get all documents that have a specific tag.
   */
  getDocumentsByTag(tagName: string): string[] {
    const tags = this.getTags();
    const documents: string[] = [];

    for (const [filePath, assignedTags] of Object.entries(tags.assignments)) {
      if (assignedTags.includes(tagName)) {
        documents.push(filePath);
      }
    }

    return documents;
  }

  /**
   * Get all documents that have all of the specified tags.
   */
  getDocumentsByTags(tagNames: string[]): string[] {
    const tags = this.getTags();
    const documents: string[] = [];

    for (const [filePath, assignedTags] of Object.entries(tags.assignments)) {
      if (tagNames.every((t) => assignedTags.includes(t))) {
        documents.push(filePath);
      }
    }

    return documents;
  }

  /**
   * Get all documents that have any of the specified tags.
   */
  getDocumentsByAnyTag(tagNames: string[]): string[] {
    const tags = this.getTags();
    const documents: string[] = [];

    for (const [filePath, assignedTags] of Object.entries(tags.assignments)) {
      if (tagNames.some((t) => assignedTags.includes(t))) {
        documents.push(filePath);
      }
    }

    return documents;
  }

  /**
   * Get all tagged documents with their tags.
   */
  getAllAssignments(): Record<string, string[]> {
    return this.getTags().assignments;
  }

  /**
   * Get tag usage counts.
   */
  getTagCounts(): Record<string, number> {
    const tags = this.getTags();
    const counts: Record<string, number> = {};

    // Initialize all defined tags with 0
    for (const tagName of Object.keys(tags.definitions)) {
      counts[tagName] = 0;
    }

    // Count assignments
    for (const assignedTags of Object.values(tags.assignments)) {
      for (const tagName of assignedTags) {
        counts[tagName] = (counts[tagName] || 0) + 1;
      }
    }

    return counts;
  }

  // ============================================================================
  // Validation Operations
  // ============================================================================

  /**
   * Validate the tags file structure and references.
   */
  validate(): TagValidationResult {
    const tags = this.getTags();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for orphaned tag assignments (tags used but not defined)
    const definedTags = new Set(Object.keys(tags.definitions));
    const usedTags = new Set<string>();

    for (const [filePath, assignedTags] of Object.entries(tags.assignments)) {
      for (const tagName of assignedTags) {
        usedTags.add(tagName);
        if (!definedTags.has(tagName)) {
          errors.push(
            `Tag "${tagName}" assigned to "${filePath}" is not defined`,
          );
        }
      }
    }

    // Check for unused tag definitions
    for (const tagName of definedTags) {
      if (!usedTags.has(tagName)) {
        warnings.push(`Tag "${tagName}" is defined but never used`);
      }
    }

    // Check for empty color values
    for (const [tagName, definition] of Object.entries(tags.definitions)) {
      if (!definition.color || definition.color.trim() === "") {
        errors.push(`Tag "${tagName}" has no color defined`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Clean up orphaned assignments (remove assignments for undefined tags).
   */
  cleanupOrphanedAssignments(): number {
    const tags = this.getTags();
    const definedTags = new Set(Object.keys(tags.definitions));
    let removedCount = 0;

    for (const filePath of Object.keys(tags.assignments)) {
      const originalLength = tags.assignments[filePath].length;
      tags.assignments[filePath] = tags.assignments[filePath].filter((t) =>
        definedTags.has(t),
      );
      removedCount += originalLength - tags.assignments[filePath].length;

      // Clean up empty assignments
      if (tags.assignments[filePath].length === 0) {
        delete tags.assignments[filePath];
      }
    }

    if (removedCount > 0) {
      this.saveTags(tags);
    }

    return removedCount;
  }
}
