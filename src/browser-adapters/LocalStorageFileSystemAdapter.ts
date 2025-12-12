/**
 * Browser localStorage implementation of FileSystemAdapter
 *
 * This adapter uses browser localStorage to persist data.
 * It simulates a filesystem using localStorage keys as "paths".
 *
 * Key format: `${prefix}:${path}`
 * Directory markers: `${prefix}:${path}/.dir`
 *
 * Note: localStorage has a ~5MB limit in most browsers.
 * For larger data needs, consider IndexedDB.
 */

import { FileSystemAdapter } from "../pure-core/abstractions/filesystem";

/**
 * Storage interface to allow dependency injection for testing
 * Compatible with both localStorage and sessionStorage
 */
export interface StorageProvider {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export interface LocalStorageFileSystemAdapterOptions {
  /**
   * Prefix for all localStorage keys to avoid collisions
   * @default 'alexandria'
   */
  prefix?: string;

  /**
   * Storage provider (localStorage, sessionStorage, or custom)
   * @default globalThis.localStorage
   */
  storage?: StorageProvider;
}

/**
 * Browser localStorage implementation of FileSystemAdapter
 *
 * Provides a filesystem-like interface backed by localStorage.
 * Useful for browser-based applications that need to persist
 * workspace and configuration data locally.
 */
export class LocalStorageFileSystemAdapter implements FileSystemAdapter {
  private readonly prefix: string;
  private readonly storage: StorageProvider;

  constructor(options: LocalStorageFileSystemAdapterOptions = {}) {
    this.prefix = options.prefix ?? "alexandria";

    // Use provided storage or default to localStorage
    if (options.storage) {
      this.storage = options.storage;
    } else if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      this.storage = globalThis.localStorage;
    } else {
      throw new Error(
        "localStorage is not available. Provide a storage option or run in a browser environment.",
      );
    }
  }

  /**
   * Generate the localStorage key for a given path
   */
  private getKey(path: string): string {
    return `${this.prefix}:${path}`;
  }

  /**
   * Get all keys that belong to this adapter
   */
  private getAllKeys(): string[] {
    const keys: string[] = [];
    const prefixWithColon = `${this.prefix}:`;

    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(prefixWithColon)) {
        keys.push(key);
      }
    }

    return keys;
  }

  /**
   * Extract the path from a localStorage key
   */
  private getPathFromKey(key: string): string {
    return key.slice(this.prefix.length + 1); // +1 for the colon
  }

  exists(path: string): boolean {
    const key = this.getKey(path);
    return (
      this.storage.getItem(key) !== null ||
      this.storage.getItem(key + "/.dir") !== null ||
      this.isDirectory(path)
    );
  }

  readFile(path: string): string {
    const key = this.getKey(path);
    const content = this.storage.getItem(key);

    if (content === null) {
      throw new Error(`File not found: ${path}`);
    }

    return content;
  }

  writeFile(path: string, content: string): void {
    // Ensure parent directory exists
    const dir = this.dirname(path);
    if (dir && dir !== "/" && dir !== path) {
      this.createDir(dir);
    }

    const key = this.getKey(path);
    this.storage.setItem(key, content);
  }

  deleteFile(path: string): void {
    const key = this.getKey(path);
    this.storage.removeItem(key);
  }

  readBinaryFile(path: string): Uint8Array {
    const key = this.getKey(path);
    const content = this.storage.getItem(key);

    if (content === null) {
      throw new Error(`Binary file not found: ${path}`);
    }

    // Decode from base64
    const binaryString = atob(content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  writeBinaryFile(path: string, content: Uint8Array): void {
    // Ensure parent directory exists
    const dir = this.dirname(path);
    if (dir && dir !== "/" && dir !== path) {
      this.createDir(dir);
    }

    // Encode to base64 for localStorage storage
    const binaryString = Array.from(content)
      .map((byte) => String.fromCharCode(byte))
      .join("");
    const base64 = btoa(binaryString);

    const key = this.getKey(path);
    this.storage.setItem(key, base64);
  }

  createDir(path: string): void {
    if (!path || path === "/") return;

    // Add a marker for the directory
    const key = this.getKey(path + "/.dir");
    this.storage.setItem(key, "");
  }

  readDir(path: string): string[] {
    // Check if this path is actually a file (not a directory)
    const fileKey = this.getKey(path);
    if (
      this.storage.getItem(fileKey) !== null &&
      !path.endsWith("/.dir") &&
      !this.isDirectory(path)
    ) {
      throw new Error(`ENOTDIR: not a directory, scandir '${path}'`);
    }

    // Check if the directory exists
    if (!this.isDirectory(path)) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }

    const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
    const prefix =
      normalizedPath === "/" || normalizedPath === ""
        ? ""
        : `${normalizedPath}/`;
    const items = new Set<string>();

    const allKeys = this.getAllKeys();

    for (const key of allKeys) {
      const filePath = this.getPathFromKey(key);

      if (filePath.startsWith(prefix)) {
        const relativePath = filePath.slice(prefix.length);
        if (relativePath) {
          // Skip .dir markers at the current level
          if (relativePath === ".dir") {
            continue;
          }

          // Check if this is a subdirectory .dir marker
          if (relativePath.endsWith("/.dir")) {
            const dirName = relativePath.slice(0, -5).split("/")[0];
            if (dirName) {
              items.add(dirName);
            }
          } else {
            // Get the first segment (either a file or directory name)
            const firstSegment = relativePath.split("/")[0];
            if (firstSegment && firstSegment !== ".dir") {
              items.add(firstSegment);
            }
          }
        }
      }
    }

    return Array.from(items);
  }

  deleteDir(path: string): void {
    const prefix = `${this.prefix}:${path}/`;
    const dirMarker = this.getKey(path + "/.dir");

    // Remove all files in the directory
    const allKeys = this.getAllKeys();
    for (const key of allKeys) {
      if (key.startsWith(prefix) || key === dirMarker) {
        this.storage.removeItem(key);
      }
    }
  }

  isDirectory(path: string): boolean {
    // Check if we have a directory marker
    const dirMarkerKey = this.getKey(path + "/.dir");
    if (this.storage.getItem(dirMarkerKey) !== null) {
      return true;
    }

    // Check if any files exist under this path
    const prefix = `${this.prefix}:${path}/`;
    const allKeys = this.getAllKeys();

    for (const key of allKeys) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }

    return false;
  }

  join(...paths: string[]): string {
    return (
      paths
        .filter(Boolean)
        .join("/")
        .replace(/\/+/g, "/")
        .replace(/\/$/, "") || "/"
    );
  }

  dirname(path: string): string {
    const lastSlash = path.lastIndexOf("/");
    return lastSlash <= 0 ? "/" : path.slice(0, lastSlash);
  }

  basename(filePath: string, ext?: string): string {
    const lastSlash = filePath.lastIndexOf("/");
    let name = lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
    if (ext && name.endsWith(ext)) {
      name = name.slice(0, -ext.length);
    }
    return name;
  }

  extname(filePath: string): string {
    const name = this.basename(filePath);
    const lastDot = name.lastIndexOf(".");
    if (lastDot <= 0) return "";
    return name.slice(lastDot);
  }

  isAbsolute(path: string): boolean {
    // In browser context, we treat paths starting with / as absolute
    return path.startsWith("/");
  }

  relative(from: string, to: string): string {
    // Simple implementation - for browser use cases this is sufficient
    if (to.startsWith(from)) {
      const rel = to.slice(from.length);
      return rel.startsWith("/") ? rel.slice(1) : rel;
    }
    return to;
  }

  // Repository operations - simplified for browser context
  normalizeRepositoryPath(inputPath: string): string {
    // In browser context, we don't have git roots
    // Just return the path as-is or find a .git marker
    let current = inputPath;
    while (current && current !== "/") {
      if (this.exists(this.join(current, ".git"))) {
        return current;
      }
      current = this.dirname(current);
    }

    // For browser, if no .git found, use the input path directly
    // This allows workspace-only usage without git simulation
    return inputPath;
  }

  findProjectRoot(inputPath: string): string {
    return this.normalizeRepositoryPath(inputPath);
  }

  getRepositoryName(repositoryPath: string): string {
    const segments = repositoryPath.split("/").filter((s) => s);
    return segments[segments.length - 1] || "workspace";
  }

  // Browser-specific utilities

  /**
   * Clear all data managed by this adapter
   * Useful for testing or resetting state
   */
  clear(): void {
    const allKeys = this.getAllKeys();
    for (const key of allKeys) {
      this.storage.removeItem(key);
    }
  }

  /**
   * Get the total size of data stored by this adapter (approximate)
   * Useful for monitoring localStorage usage
   */
  getStorageSize(): number {
    let totalSize = 0;
    const allKeys = this.getAllKeys();

    for (const key of allKeys) {
      const value = this.storage.getItem(key);
      if (value) {
        // Approximate size: key length + value length (UTF-16 = 2 bytes per char)
        totalSize += (key.length + value.length) * 2;
      }
    }

    return totalSize;
  }

  /**
   * Debug: list all files managed by this adapter
   */
  listAllFiles(): string[] {
    const files: string[] = [];
    const allKeys = this.getAllKeys();

    for (const key of allKeys) {
      const path = this.getPathFromKey(key);
      if (!path.endsWith("/.dir")) {
        files.push(path);
      }
    }

    return files;
  }
}
