# Unified Database Architecture (Future)

## What it does

The unified database architecture (planned future state) will enable cross-device workspace synchronization through a cloud database. Users will authenticate and sync their workspaces between desktop and web applications.

## Problem it solves

Currently, workspaces are stored locally (filesystem or localStorage), limiting users to a single device. The database architecture will enable:
- Access workspaces from any device
- Real-time synchronization across devices
- Collaboration features (sharing workspaces)
- Offline-first operation with sync when connected

## Available operations

- Authenticate users across devices
- Sync workspace data to cloud database
- Offline fallback to local storage
- Cross-device workspace access

## Design choices

- **DatabaseStorageAdapter**: New adapter implementing FileSystemAdapter interface
- **User authentication**: Required for cloud sync and data ownership
- **Offline fallback**: Desktop uses filesystem cache, browser uses localStorage
- **Backward compatibility**: Works with existing WorkspaceManager without changes
- **Multi-tier storage**: Cloud as source of truth, local storage as cache

## Planned workflow

1. User authenticates in desktop or web app
2. Application checks network connectivity
3. If online: DatabaseStorageAdapter connects to cloud database
4. If offline: Falls back to NodeFileSystemAdapter or LocalStorageFileSystemAdapter
5. Changes sync when connection restored
6. WorkspaceManager operates uniformly regardless of storage backend

## Migration path

1. Phase 1: LocalStorage for browser (current)
2. Phase 2: DatabaseStorageAdapter with cloud sync
3. Phase 3: Real-time collaboration features
