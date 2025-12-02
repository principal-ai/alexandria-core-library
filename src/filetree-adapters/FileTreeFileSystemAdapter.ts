/**
 * FileSystemAdapter implementation that uses a FileTree for metadata
 * and a host-provided readFile function for file contents.
 *
 * This adapter is designed for browser environments where filesystem
 * access is mediated through a host application.
 */

import type { FileTree, FileInfo, DirectoryInfo } from "@principal-ai/repository-abstraction";
import type { FileSystemAdapter } from "../pure-core/abstractions/filesystem";

export interface FileTreeFileSystemAdapterOptions {
  /** The FileTree containing file/directory metadata */
  fileTree: FileTree;
  /** The repository root path */
  repositoryPath: string;
  /** Function to read file contents (provided by host) */
  readFile: (path: string) => string | Promise<string>;
  /** Optional function to write file contents */
  writeFile?: (path: string, content: string) => void | Promise<void>;
  /** Optional function to delete files */
  deleteFile?: (path: string) => void | Promise<void>;
}

export class FileTreeFileSystemAdapter implements FileSystemAdapter {
  private fileTree: FileTree;
  private repositoryPath: string;
  private fileMap: Map<string, FileInfo>;
  private dirMap: Map<string, DirectoryInfo>;
  private readFileFn: (path: string) => string | Promise<string>;
  private writeFileFn?: (path: string, content: string) => void | Promise<void>;
  private deleteFileFn?: (path: string) => void | Promise<void>;

  constructor(options: FileTreeFileSystemAdapterOptions) {
    this.fileTree = options.fileTree;
    this.repositoryPath = options.repositoryPath;
    this.readFileFn = options.readFile;
    this.writeFileFn = options.writeFile;
    this.deleteFileFn = options.deleteFile;

    // Build lookup maps for fast access
    this.fileMap = new Map();
    this.dirMap = new Map();

    for (const file of this.fileTree.allFiles) {
      // Store by both absolute and relative paths
      this.fileMap.set(file.path, file);
      this.fileMap.set(file.relativePath, file);
    }

    for (const dir of this.fileTree.allDirectories) {
      this.dirMap.set(dir.path, dir);
      this.dirMap.set(dir.relativePath, dir);
    }

    // Also add root directory
    this.dirMap.set(this.repositoryPath, this.fileTree.root);
    this.dirMap.set("", this.fileTree.root);
    this.dirMap.set(".", this.fileTree.root);
  }

  exists(path: string): boolean {
    const normalizedPath = this.normalizePath(path);
    return this.fileMap.has(normalizedPath) || this.dirMap.has(normalizedPath);
  }

  readFile(path: string): string {
    const result = this.readFileFn(path);
    if (result instanceof Promise) {
      throw new Error(
        "FileTreeFileSystemAdapter.readFile() requires a synchronous readFile function. " +
        "The provided readFile function returned a Promise. " +
        "Consider using readFileAsync() or providing a sync readFile function."
      );
    }
    return result;
  }

  /**
   * Async version of readFile for environments with async file access
   */
  async readFileAsync(path: string): Promise<string> {
    return this.readFileFn(path);
  }

  writeFile(path: string, content: string): void {
    if (!this.writeFileFn) {
      throw new Error(
        "Write operations not supported. Provide a writeFile function in options."
      );
    }
    const result = this.writeFileFn(path, content);
    if (result instanceof Promise) {
      throw new Error(
        "FileTreeFileSystemAdapter.writeFile() requires a synchronous writeFile function."
      );
    }
  }

  deleteFile(path: string): void {
    if (!this.deleteFileFn) {
      throw new Error(
        "Delete operations not supported. Provide a deleteFile function in options."
      );
    }
    const result = this.deleteFileFn(path);
    if (result instanceof Promise) {
      throw new Error(
        "FileTreeFileSystemAdapter.deleteFile() requires a synchronous deleteFile function."
      );
    }
  }

  readBinaryFile(_path: string): Uint8Array {
    throw new Error("Binary file operations not supported in FileTreeFileSystemAdapter");
  }

  writeBinaryFile(_path: string, _content: Uint8Array): void {
    throw new Error("Binary file operations not supported in FileTreeFileSystemAdapter");
  }

  createDir(_path: string): void {
    throw new Error(
      "Directory creation not supported in FileTreeFileSystemAdapter. " +
      "FileTree is read-only metadata."
    );
  }

  readDir(path: string): string[] {
    const normalizedPath = this.normalizePath(path);
    const dir = this.dirMap.get(normalizedPath);

    if (!dir) {
      throw new Error(`Directory not found: ${path}`);
    }

    return dir.children.map((child) => child.name);
  }

  deleteDir(_path: string): void {
    throw new Error(
      "Directory deletion not supported in FileTreeFileSystemAdapter. " +
      "FileTree is read-only metadata."
    );
  }

  isDirectory(path: string): boolean {
    const normalizedPath = this.normalizePath(path);
    return this.dirMap.has(normalizedPath);
  }

  // Path utilities - pure functions, no filesystem access needed

  join(...paths: string[]): string {
    return paths
      .join("/")
      .replace(/\/+/g, "/")
      .replace(/\/$/, "") || "/";
  }

  relative(from: string, to: string): string {
    const fromParts = from.split("/").filter(Boolean);
    const toParts = to.split("/").filter(Boolean);

    // Find common prefix
    let commonLength = 0;
    while (
      commonLength < fromParts.length &&
      commonLength < toParts.length &&
      fromParts[commonLength] === toParts[commonLength]
    ) {
      commonLength++;
    }

    // Build relative path
    const upCount = fromParts.length - commonLength;
    const remainingPath = toParts.slice(commonLength);

    const relativeParts: string[] = [];
    for (let i = 0; i < upCount; i++) {
      relativeParts.push("..");
    }
    relativeParts.push(...remainingPath);

    return relativeParts.join("/") || ".";
  }

  dirname(path: string): string {
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash <= 0) return lastSlash === 0 ? "/" : ".";
    return path.slice(0, lastSlash);
  }

  basename(path: string, ext?: string): string {
    const lastSlash = path.lastIndexOf("/");
    let name = lastSlash === -1 ? path : path.slice(lastSlash + 1);
    if (ext && name.endsWith(ext)) {
      name = name.slice(0, -ext.length);
    }
    return name;
  }

  extname(path: string): string {
    const name = this.basename(path);
    const lastDot = name.lastIndexOf(".");
    if (lastDot <= 0) return "";
    return name.slice(lastDot);
  }

  isAbsolute(path: string): boolean {
    return path.startsWith("/");
  }

  normalizeRepositoryPath(inputPath: string): string {
    // For FileTree adapter, the repository path is fixed
    return this.repositoryPath;
  }

  findProjectRoot(_inputPath: string): string {
    // For FileTree adapter, the repository path is the project root
    return this.repositoryPath;
  }

  getRepositoryName(repositoryPath: string): string {
    const segments = repositoryPath.split("/").filter(Boolean);
    return segments[segments.length - 1] || "root";
  }

  // Helper methods

  private normalizePath(path: string): string {
    // Remove leading ./ if present
    if (path.startsWith("./")) {
      path = path.slice(2);
    }

    // If it's an absolute path starting with repositoryPath, make it relative
    if (path.startsWith(this.repositoryPath + "/")) {
      path = path.slice(this.repositoryPath.length + 1);
    } else if (path === this.repositoryPath) {
      path = "";
    }

    return path;
  }

  /**
   * Get the underlying FileTree
   */
  getFileTree(): FileTree {
    return this.fileTree;
  }

  /**
   * Get file info by path
   */
  getFileInfo(path: string): FileInfo | undefined {
    const normalizedPath = this.normalizePath(path);
    return this.fileMap.get(normalizedPath);
  }

  /**
   * Get directory info by path
   */
  getDirectoryInfo(path: string): DirectoryInfo | undefined {
    const normalizedPath = this.normalizePath(path);
    return this.dirMap.get(normalizedPath);
  }
}
