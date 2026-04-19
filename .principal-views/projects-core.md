# Projects Core Architecture

## What it does

The Projects Core manages registered repositories, workspaces, and workspace memberships. It provides the foundation for multi-project organization and enables users to group repositories into workspaces.

## Problem it solves

Developers work with multiple repositories that often relate to each other. Without organization, it's difficult to manage related projects or switch between different contexts. The Projects Core provides workspace-based organization with persistent tracking.

## Available operations

- **Project Registry**: Register/unregister repositories, track metadata, GitHub integration
- **Workspace Management**: Create workspaces, manage memberships, organize projects
- **Outpost Management**: High-level API combining registry, workspaces, and MemoryPalace
- **Configuration**: Load and apply Alexandria configuration per repository

## Design choices

- **AlexandriaOutpostManager**: Single entry point that orchestrates all project-level operations
- **Separation of concerns**: Registry and workspace data stored separately
- **Type hierarchy**: AlexandriaEntry extends AlexandriaRepository with local path information
- **GitHub enrichment**: Optional GitHub metadata enhances project information
- **File-based persistence**: Projects, workspaces, and memberships stored as JSON

## Common workflows

1. User registers a repository via AlexandriaOutpostManager
2. Repository is added to ProjectRegistry with metadata
3. User creates workspace and adds project memberships
4. Outpost manager scans for documentation and creates MemoryPalace instance
5. Configuration is loaded and applied to repository

## Data model

- **AlexandriaEntry**: Local repository with validated path
- **AlexandriaRepository**: Base repository with GitHub metadata, views, timestamps
- **Workspace**: Group of related projects
- **WorkspaceMembership**: Links projects to workspaces
