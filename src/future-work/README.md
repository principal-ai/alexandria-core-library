# Future Work

This directory contains code and types for features that were designed but not yet implemented in the core library.

## Contents

### Types

#### `types/coverage.ts`

Comprehensive coverage analysis types for tracking which files have anchored notes.

**Purpose**: Track documentation coverage across the codebase

- `CoverageMetrics` - Overall coverage statistics
- `NoteCoverageReport` - Full coverage report with analysis
- `FileWithCoverage` - Individual file coverage data

**Why not implemented**: This feature would complement the existing `codebase-coverage` rule (which tracks files in views) by tracking which files have explanatory notes anchored to them.

#### `types/validation.ts`

Rich validation error types with custom message formatting.

**Purpose**: Provide customizable validation error messages

- `ValidationMessageData` - Typed error data for different validation scenarios
- `ValidationMessageFormatter` - Class for formatting custom messages
- `DEFAULT_VALIDATION_MESSAGES` - Default message templates

**Why not implemented**: The current validation system uses simpler error messages. This would enable repository-specific error message customization.

#### `types/alexandria-bookmarks.ts`

Document bookmarking system types (part of unused storage system).

**Purpose**: Track user bookmarks of documents/chapters

- `AlexandriaBookmark` - Bookmark data structure
- `BookmarkPreferences` - User bookmark settings
- `BookmarkStats` - Usage statistics

**Why not implemented**: Part of a reading records/bookmarks feature that may be better suited for client applications.

### Utils

#### `utils/validation.ts`

Utilities for loading/saving custom validation messages from `.alexandria/validation-messages.json`.

**Purpose**: Enable per-repository validation message customization

- `loadValidationMessages()` - Load custom messages from repository
- `saveValidationMessages()` - Save custom messages to repository
- `ValidationMessageFormatter` - Message formatting with overrides

**Why not implemented**: Depends on the validation types feature above.

## Usage

These files are intentionally excluded from the build and from knip analysis. They serve as:

1. **Design documentation** for future features
2. **Type references** for understanding planned functionality
3. **Starting points** when implementing these features

If you want to implement any of these features, move the relevant files back into the main source tree and update the imports accordingly.
