# Future Work

This directory contains code and types for features that were designed but not yet implemented in the core library.

## Contents

### Types

#### `types/alexandria-bookmarks.ts`

Document bookmarking system types (part of unused storage system).

**Purpose**: Track user bookmarks of documents/chapters

- `AlexandriaBookmark` - Bookmark data structure
- `BookmarkPreferences` - User bookmark settings
- `BookmarkStats` - Usage statistics

**Why not implemented**: Part of a reading records/bookmarks feature that may be better suited for client applications.

## Usage

These files are intentionally excluded from the build and from knip analysis. They serve as:

1. **Design documentation** for future features
2. **Type references** for understanding planned functionality
3. **Starting points** when implementing these features

If you want to implement any of these features, move the relevant files back into the main source tree and update the imports accordingly.
