# Browser Workspace Architecture

## What it does

Workspace management works across both desktop (Electron) and browser (web-ade) environments by using the FileSystemAdapter abstraction. LocalStorage serves as browser storage, while the desktop app uses the native filesystem.

## Problem it solves

Users need to manage workspaces and project memberships in both desktop and web environments. Without a unified abstraction, we'd need separate implementations for each platform, leading to inconsistency and duplication.

## Available operations

- Create and manage workspaces
- Track workspace memberships
- Persist workspace data to platform-appropriate storage
- Query workspace and project information

## Design choices

- **Unified WorkspaceManager**: Same core logic works in both environments
- **Adapter injection**: Electron injects NodeFileSystemAdapter, browser injects LocalStorageFileSystemAdapter
- **Service layer**: AlexandriaRegistryService (desktop) and BrowserWorkspaceStore (web) handle environment-specific concerns
- **localStorage as stepping stone**: Browser uses localStorage initially, with plans to migrate to database storage

## Common patterns

1. Application determines runtime environment (Electron vs browser)
2. Appropriate service layer is instantiated
3. Service injects correct FileSystemAdapter into WorkspaceManager
4. WorkspaceManager operates uniformly regardless of environment
5. Data persists to ~/.alexandria/*.json (desktop) or localStorage (browser)
