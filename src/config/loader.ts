import { AlexandriaConfig } from "./types";
import { CONFIG_FILENAMES, DEFAULT_CONFIG } from "./schema";
import { FileSystemAdapter } from "../pure-core/abstractions/filesystem";

export class ConfigLoader {
  private configCache: Map<string, AlexandriaConfig> = new Map();
  private fsAdapter: FileSystemAdapter;

  constructor(fsAdapter: FileSystemAdapter) {
    this.fsAdapter = fsAdapter;
  }

  findConfigFile(startDir: string): string | null {
    let currentDir = startDir;

    // Walk up the directory tree looking for config files
    while (currentDir) {
      for (const filename of CONFIG_FILENAMES) {
        const configPath = this.fsAdapter.join(currentDir, filename);
        if (this.fsAdapter.exists(configPath)) {
          return configPath;
        }
      }

      const parentDir = this.fsAdapter.dirname(currentDir);
      // Stop if we've reached the root (dirname returns the same path)
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }

    return null;
  }

  /**
   * Load configuration from a specific path or search from a starting directory.
   *
   * @param configPathOrStartDir - Either a direct path to a config file, or a directory to start searching from
   * @returns The loaded configuration, or null if not found
   */
  loadConfig(configPathOrStartDir?: string): AlexandriaConfig | null {
    if (!configPathOrStartDir) {
      return null;
    }

    // Check if this is a direct config file path or a directory to search from
    const path = this.fsAdapter.exists(configPathOrStartDir) &&
      !this.fsAdapter.isDirectory(configPathOrStartDir)
      ? configPathOrStartDir
      : this.findConfigFile(configPathOrStartDir);

    if (!path) {
      return null;
    }

    if (this.configCache.has(path)) {
      return this.configCache.get(path)!;
    }

    try {
      const content = this.fsAdapter.readFile(path);
      const config = JSON.parse(content) as AlexandriaConfig;

      const merged = this.mergeWithDefaults(config);
      this.configCache.set(path, merged);

      return merged;
    } catch (error) {
      console.error(`Failed to load config from ${path}:`, error);
      return null;
    }
  }

  private mergeWithDefaults(
    config: Partial<AlexandriaConfig>,
  ): AlexandriaConfig {
    return {
      ...DEFAULT_CONFIG,
      ...config,
      context: {
        ...DEFAULT_CONFIG.context,
        ...config.context,
        patterns: {
          ...DEFAULT_CONFIG.context?.patterns,
          ...config.context?.patterns,
        },
      },
      reporting: {
        ...DEFAULT_CONFIG.reporting,
        ...config.reporting,
      },
    } as AlexandriaConfig;
  }

  clearCache(): void {
    this.configCache.clear();
  }
}
