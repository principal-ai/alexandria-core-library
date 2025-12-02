import { describe, it, expect, beforeEach } from "vitest";
import {
  filenameConvention,
  convertToConvention,
} from "../../src/rules/implementations/filename-convention";
import { LibraryRuleContext, FileInfo } from "../../src/rules/types";
import { FilenameConventionOptions } from "../../src/config/types";
import { ValidatedRepositoryPath } from "../../src/pure-core/types";
import {
  GlobAdapter,
  GlobOptions,
} from "../../src/pure-core/abstractions/glob";
import { FileSystemAdapter } from "../../src/pure-core/abstractions/filesystem";

describe("filename-convention rule", () => {
  let mockContext: LibraryRuleContext;

  // Stub FileSystemAdapter for tests (only path operations needed)
  const createStubFsAdapter = (): FileSystemAdapter => {
    return {
      exists: () => false,
      readFile: () => "",
      writeFile: () => {},
      deleteFile: () => {},
      readBinaryFile: () => new Uint8Array(),
      writeBinaryFile: () => {},
      createDir: () => {},
      readDir: () => [],
      deleteDir: () => {},
      isDirectory: () => false,
      join: (...paths: string[]) => paths.join("/").replace(/\/+/g, "/"),
      relative: (from: string, to: string) =>
        to.startsWith(from) ? to.slice(from.length + 1) : to,
      dirname: (path: string) => {
        const lastSlash = path.lastIndexOf("/");
        return lastSlash <= 0 ? "/" : path.slice(0, lastSlash);
      },
      basename: (filePath: string, ext?: string) => {
        const lastSlash = filePath.lastIndexOf("/");
        let name = lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
        if (ext && name.endsWith(ext)) {
          name = name.slice(0, -ext.length);
        }
        return name;
      },
      extname: (filePath: string) => {
        const name = filePath.split("/").pop() || "";
        const lastDot = name.lastIndexOf(".");
        if (lastDot <= 0) return "";
        return name.slice(lastDot);
      },
      isAbsolute: (path: string) => path.startsWith("/"),
      normalizeRepositoryPath: (path: string) => path,
      findProjectRoot: (path: string) => path,
      getRepositoryName: (path: string) => path.split("/").pop() || "root",
    };
  };

  const stubFsAdapter = createStubFsAdapter();

  beforeEach(() => {
    mockContext = {
      projectRoot: "/test/project" as ValidatedRepositoryPath,
      views: [],
      notes: [],
      files: [],
      markdownFiles: [],
      fsAdapter: stubFsAdapter,
    };
  });

  const createFileInfo = (relativePath: string): FileInfo => ({
    path: `/test/project/${relativePath}`,
    relativePath,
    exists: true,
    lastModified: new Date(),
    size: 100,
    isMarkdown: relativePath.endsWith(".md") || relativePath.endsWith(".mdx"),
  });

  const createStubGlobAdapter = (): GlobAdapter => {
    return {
      async findFiles(_patterns: string[], _options?: GlobOptions) {
        return [];
      },
      matchesPath(patterns, candidate) {
        if (!patterns || patterns.length === 0) {
          return false;
        }

        return patterns.some((pattern) => globToRegex(pattern).test(candidate));
      },
    };
  };

  const globToRegex = (pattern: string): RegExp => {
    let regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "___DOUBLE_STAR___")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/___DOUBLE_STAR___\//g, "(.*\\/)?")
      .replace(/\/___DOUBLE_STAR___/g, "(\\/.*)?")
      .replace(/___DOUBLE_STAR___/g, ".*");

    regex = regex.replace(/\{([^}]+)\}/g, (_match, group) => {
      const options = group.split(",");
      return "(" + options.join("|") + ")";
    });

    return new RegExp("^" + regex + "$");
  };

  describe("kebab-case style (default)", () => {
    it("should not report violations for correctly formatted files", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/api-reference.md"),
        createFileInfo("getting-started.md"),
        createFileInfo("docs/user-guide.md"),
      ];

      const violations = await filenameConvention.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should report violations for snake_case files", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/api_reference.md"),
        createFileInfo("getting_started.md"),
      ];

      const violations = await filenameConvention.check(mockContext);
      expect(violations).toHaveLength(2);
      expect(violations[0].message).toContain("api-reference.md");
      expect(violations[1].message).toContain("getting-started.md");
    });

    it("should report violations for camelCase files", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/apiReference.md"),
        createFileInfo("gettingStarted.md"),
      ];

      const violations = await filenameConvention.check(mockContext);
      expect(violations).toHaveLength(2);
      expect(violations[0].message).toContain("api-reference.md");
      expect(violations[1].message).toContain("getting-started.md");
    });

    it("should respect exceptions list", async () => {
      mockContext.markdownFiles = [
        createFileInfo("README.md"),
        createFileInfo("CHANGELOG.md"),
        createFileInfo("docs/API_GUIDE.md"),
      ];

      const violations = await filenameConvention.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/API_GUIDE.md");
    });

    it("should honor exclude glob patterns when provided", async () => {
      mockContext.markdownFiles = [
        createFileInfo("tests/fixtures/markdown/bad_file.md"),
      ];

      mockContext.globAdapter = createStubGlobAdapter();
      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "filename-convention",
              options: {
                exclude: ["tests/fixtures/markdown/**"],
              } as FilenameConventionOptions,
            },
          ],
        },
      };

      const violations = await filenameConvention.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("snake_case style", () => {
    it("should enforce snake_case when configured", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/api_reference.md"),
        createFileInfo("getting_started.md"),
        createFileInfo("docs/user-guide.md"),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "filename-convention",
              name: "Filename Convention",
              severity: "warning",
              options: {
                style: "snake_case",
              } as FilenameConventionOptions,
            },
          ],
        },
      };

      const violations = await filenameConvention.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/user-guide.md");
      expect(violations[0].message).toContain("user_guide.md");
    });
  });

  describe("camelCase style", () => {
    it("should enforce camelCase when configured", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/apiReference.md"),
        createFileInfo("gettingStarted.md"),
        createFileInfo("docs/user-guide.md"),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "filename-convention",
              name: "Filename Convention",
              severity: "warning",
              options: {
                style: "camelCase",
              } as FilenameConventionOptions,
            },
          ],
        },
      };

      const violations = await filenameConvention.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/user-guide.md");
      expect(violations[0].message).toContain("userGuide.md");
    });
  });

  describe("PascalCase style", () => {
    it("should enforce PascalCase when configured", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/ApiReference.md"),
        createFileInfo("GettingStarted.md"),
        createFileInfo("docs/user-guide.md"),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "filename-convention",
              name: "Filename Convention",
              severity: "warning",
              options: {
                style: "PascalCase",
              } as FilenameConventionOptions,
            },
          ],
        },
      };

      const violations = await filenameConvention.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/user-guide.md");
      expect(violations[0].message).toContain("UserGuide.md");
    });
  });

  describe("custom separator", () => {
    it("should enforce custom separator when configured", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/api_reference.md"),
        createFileInfo("getting_started.md"),
        createFileInfo("docs/user-guide.md"),
      ];
      // With separator '_' configured:
      // - 'api_reference' should be valid (already uses _)
      // - 'getting_started' should be valid (already uses _)
      // - 'user-guide' should be invalid (uses - instead of _)

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "filename-convention",
              name: "Filename Convention",
              severity: "warning",
              options: {
                separator: "_",
                exceptions: [], // Clear default exceptions for this test
              } as FilenameConventionOptions,
            },
          ],
        },
      };

      const violations = await filenameConvention.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/user-guide.md");
      expect(violations[0].message).toContain("user_guide.md");
    });
  });

  describe("case style enforcement", () => {
    it("should enforce uppercase with separator", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/API_REFERENCE.md"),
        createFileInfo("GETTING_STARTED.md"),
        createFileInfo("docs/user_guide.md"),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "filename-convention",
              name: "Filename Convention",
              severity: "warning",
              options: {
                separator: "_",
                caseStyle: "upper",
                exceptions: [], // Clear default exceptions for this test
              } as FilenameConventionOptions,
            },
          ],
        },
      };

      const violations = await filenameConvention.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/user_guide.md");
      expect(violations[0].message).toContain("USER_GUIDE.md");
    });
  });

  describe("documentFoldersOnly option", () => {
    it("should only check files in documentation folders when enabled", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/api_reference.md"),
        createFileInfo("src/README.md"),
        createFileInfo("test_file.md"),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "filename-convention",
              name: "Filename Convention",
              severity: "warning",
              options: {
                style: "kebab-case",
                documentFoldersOnly: true,
              } as FilenameConventionOptions,
            },
          ],
        },
      };

      const violations = await filenameConvention.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/api_reference.md");
    });
  });

  describe("extensions option", () => {
    it("should check files with specified extensions", async () => {
      mockContext.files = [
        createFileInfo("docs/config.json"),
        createFileInfo("docs/data.yaml"),
        createFileInfo("docs/api_reference.txt"),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "filename-convention",
              name: "Filename Convention",
              severity: "warning",
              options: {
                style: "kebab-case",
                extensions: [".json", ".yaml", ".txt"],
              } as FilenameConventionOptions,
            },
          ],
        },
      };

      const violations = await filenameConvention.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/api_reference.txt");
      expect(violations[0].message).toContain("api-reference.txt");
    });
  });

  describe("exclude option", () => {
    it("should exclude files matching patterns", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/api_reference.md"),
        createFileInfo("legacy/old_file.md"),
        createFileInfo("vendor/external_doc.md"),
      ];

      mockContext.globAdapter = createStubGlobAdapter();
      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "filename-convention",
              name: "Filename Convention",
              severity: "warning",
              options: {
                style: "kebab-case",
                exclude: ["legacy/**", "vendor/**"],
              } as FilenameConventionOptions,
            },
          ],
        },
      };

      const violations = await filenameConvention.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/api_reference.md");
    });
  });

  describe("convertToConvention helper", () => {
    it("should correctly convert various formats to kebab-case", () => {
      const options: FilenameConventionOptions = { style: "kebab-case" };

      expect(convertToConvention("APIReference", options)).toBe(
        "api-reference",
      );
      expect(convertToConvention("api_reference", options)).toBe(
        "api-reference",
      );
      expect(convertToConvention("api.reference", options)).toBe(
        "api-reference",
      );
      expect(convertToConvention("api reference", options)).toBe(
        "api-reference",
      );
      expect(convertToConvention("apiReference", options)).toBe(
        "api-reference",
      );
    });

    it("should correctly convert to snake_case", () => {
      const options: FilenameConventionOptions = { style: "snake_case" };

      expect(convertToConvention("api-reference", options)).toBe(
        "api_reference",
      );
      expect(convertToConvention("apiReference", options)).toBe(
        "api_reference",
      );
      expect(convertToConvention("APIReference", options)).toBe(
        "api_reference",
      );
    });

    it("should correctly convert to camelCase", () => {
      const options: FilenameConventionOptions = { style: "camelCase" };

      expect(convertToConvention("api-reference", options)).toBe(
        "apiReference",
      );
      expect(convertToConvention("api_reference", options)).toBe(
        "apiReference",
      );
      expect(convertToConvention("API_REFERENCE", options)).toBe(
        "apiReference",
      );
    });

    it("should correctly convert to PascalCase", () => {
      const options: FilenameConventionOptions = { style: "PascalCase" };

      expect(convertToConvention("api-reference", options)).toBe(
        "ApiReference",
      );
      expect(convertToConvention("api_reference", options)).toBe(
        "ApiReference",
      );
      expect(convertToConvention("apiReference", options)).toBe("ApiReference");
    });
  });
});
