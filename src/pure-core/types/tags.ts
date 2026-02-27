/**
 * Types for document tagging functionality
 */

// ============================================================================
// Tag Definition Types
// ============================================================================

/**
 * Definition of a tag that can be applied to documents.
 * Tags are predefined with colors and descriptions for consistency.
 */
export interface TagDefinition {
  /** Display color in hex format (e.g., "#e53e3e") */
  color: string;
  /** Human-readable description of what this tag means */
  description?: string;
}

// ============================================================================
// Tag Storage Types
// ============================================================================

/**
 * Complete tags storage structure.
 * Stored as a single JSON file in .alexandria/tags.json
 */
export interface DocumentTags {
  /** Tag definitions keyed by tag name (e.g., "critical", "onboarding") */
  definitions: Record<string, TagDefinition>;
  /** File paths (relative to repo root) mapped to their assigned tag names */
  assignments: Record<string, string[]>;
}

// ============================================================================
// Tag Operation Result Types
// ============================================================================

/**
 * Result of tag validation operations.
 */
export interface TagValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Result of assigning tags to a document.
 */
export interface TagAssignmentResult {
  success: boolean;
  /** Tags that were successfully assigned */
  assigned: string[];
  /** Tags that failed validation (not defined) */
  invalidTags: string[];
}
