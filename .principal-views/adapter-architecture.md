# Adapter Architecture

## What it does

The adapter architecture provides platform-agnostic file system and glob operations through a ports-and-adapters pattern. This allows the Alexandria Core Library to run in multiple environments (Node.js, browser, tests) without changing core business logic.

## Problem it solves

Different runtime environments (Node.js, browsers, test frameworks) provide different APIs for file system operations. Without adapters, the core library would need environment-specific code throughout, making it harder to maintain and test.

## Available operations

- **FileSystemAdapter**: Read/write files, manage directories, handle binary data, path operations
- **GlobAdapter**: Pattern matching for file discovery

## Design choices

- **Hexagonal architecture**: Core logic depends on interfaces, not implementations
- **Platform-specific implementations**: Node.js uses native fs, browsers use localStorage/FileTree, tests use in-memory storage
- **Dependency injection**: Environment-specific adapters are injected at runtime

## Common patterns

1. Application code uses the FileSystemAdapter interface
2. At startup, inject the appropriate adapter (NodeFileSystemAdapter, InMemoryFileSystemAdapter, etc.)
3. Core logic remains unchanged across environments
