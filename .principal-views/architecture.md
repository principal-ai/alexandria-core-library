# Alexandria Core Library Architecture

## What it does

The Alexandria Core Library provides a comprehensive system for managing codebase documentation, including views, drawings, validation, and project registry. It serves as the foundation for organizing and understanding complex codebases.

## Problem it solves

Large codebases are difficult to navigate and understand. Alexandria provides structured ways to document architecture, relationships, and important patterns through validated views and drawings that are stored alongside the code.

## Main components

- **MemoryPalace**: High-level API for managing codebase documentation
- **CodebaseViewsStore**: Persistent storage for architectural views
- **DrawingStore**: Storage for visual diagrams and drawings
- **CodebaseViewValidator**: Ensures documentation follows required schemas
- **LibraryRulesEngine**: Enforces quality rules on documentation
- **ProjectRegistryStore**: Tracks registered repositories
- **ReadingRecordManager**: Manages reading history and progress

## Design choices

- **Validation-first**: All views are validated before saving to catch errors early
- **Adapter pattern**: Storage and glob operations use adapters for platform independence
- **Separation of concerns**: Views, drawings, and configuration are managed independently
- **Type safety**: Branded types (like ValidatedPaths) prevent invalid data propagation

## Common workflows

1. Register a repository in the ProjectRegistry
2. Create codebase views documenting architecture
3. Validate views through the MemoryPalace API
4. Persist validated views to .alexandria directory
5. Query and retrieve views for display
