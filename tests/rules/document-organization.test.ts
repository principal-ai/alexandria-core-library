import { describe, it, expect, beforeEach } from "vitest";
import { documentOrganization } from "../../src/rules/implementations/document-organization";
import { LibraryRuleContext, FileInfo } from "../../src/rules/types";
import { DocumentOrganizationOptions } from "../../src/config/types";
import { ValidatedRepositoryPath } from "../../src/pure-core/types";
import {
  GlobAdapter,
  GlobOptions,
} from "../../src/pure-core/abstractions/glob";

describe("document-organization rule", () => {
  let mockContext: LibraryRuleContext;

  const createFileInfo = (relativePath: string): FileInfo => ({
    path: `/test/project/${relativePath}`,
    relativePath,
    exists: true,
    lastModified: new Date(),
    size: 100,
    isMarkdown: relativePath.endsWith(".md"),
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

  beforeEach(() => {
    mockContext = {
      projectRoot: "/test/project" as ValidatedRepositoryPath,
      views: [],
      notes: [],
      files: [],
      markdownFiles: [],
      globAdapter: createStubGlobAdapter(),
    };
  });

  describe("root-level files", () => {
    it("should allow standard root-level documentation files", async () => {
      mockContext.markdownFiles = [
        createFileInfo("README.md"),
        createFileInfo("CHANGELOG.md"),
        createFileInfo("CONTRIBUTING.md"),
        createFileInfo("LICENSE.md"),
      ];

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should report violations for non-standard root-level files", async () => {
      mockContext.markdownFiles = [
        createFileInfo("api-guide.md"),
        createFileInfo("tutorial.md"),
      ];

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(2);
      expect(violations[0].file).toBe("api-guide.md");
      expect(violations[0].message).toContain(
        "should be in a documentation folder",
      );
      expect(violations[1].file).toBe("tutorial.md");
    });

    it("should be case-insensitive for root exceptions", async () => {
      mockContext.markdownFiles = [
        createFileInfo("readme.md"),
        createFileInfo("Readme.md"),
        createFileInfo("README.MD"),
      ];

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("documentation folders", () => {
    it("should allow files in docs folder", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/api-guide.md"),
        createFileInfo("docs/tutorial.md"),
        createFileInfo("docs/getting-started.md"),
      ];

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should allow files in nested documentation folders", async () => {
      mockContext.markdownFiles = [
        createFileInfo("docs/api/endpoints.md"),
        createFileInfo("docs/guides/tutorial.md"),
        createFileInfo("documentation/setup.md"),
      ];

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should respect custom documentation folder names", async () => {
      mockContext.markdownFiles = [
        createFileInfo("guides/tutorial.md"),
        createFileInfo("manual/setup.md"),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "document-organization",
              options: {
                documentFolders: ["guides", "manual"],
              } as DocumentOrganizationOptions,
            },
          ],
        },
      };

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("special directories", () => {
    it("should allow files in .github directory", async () => {
      mockContext.markdownFiles = [
        createFileInfo(".github/PULL_REQUEST_TEMPLATE.md"),
        createFileInfo(".github/ISSUE_TEMPLATE.md"),
      ];

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should allow files in templates directory", async () => {
      mockContext.markdownFiles = [createFileInfo("templates/bug-report.md")];

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should allow files in examples directory", async () => {
      mockContext.markdownFiles = [createFileInfo("examples/basic-usage.md")];

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("checkNested option", () => {
    it("should check nested folders when checkNested is true", async () => {
      mockContext.markdownFiles = [
        createFileInfo("src/components/docs/component-guide.md"),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "document-organization",
              options: {
                checkNested: true,
                documentFolders: ["docs"],
              } as DocumentOrganizationOptions,
            },
          ],
        },
      };

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(0);
    });

    it("should only check immediate parent when checkNested is false", async () => {
      mockContext.markdownFiles = [
        createFileInfo("src/components/docs/component-guide.md"),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "document-organization",
              options: {
                checkNested: false,
                documentFolders: ["docs"],
              } as DocumentOrganizationOptions,
            },
          ],
        },
      };

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(0); // Immediate parent is "docs"
    });

    it("should report violation when immediate parent is not a doc folder and checkNested is false", async () => {
      mockContext.markdownFiles = [createFileInfo("docs/components/guide.md")];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "document-organization",
              options: {
                checkNested: false,
                documentFolders: ["docs"],
              } as DocumentOrganizationOptions,
            },
          ],
        },
      };

      const violations = await documentOrganization.check(mockContext);
      // With checkNested: false, only the immediate parent "components" is checked, not "docs"
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("docs/components/guide.md");
    });
  });

  describe("custom root exceptions", () => {
    it("should respect custom root exceptions", async () => {
      mockContext.markdownFiles = [
        createFileInfo("CUSTOM_FILE.md"),
        createFileInfo("ANOTHER_FILE.md"),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          rules: [
            {
              id: "document-organization",
              options: {
                rootExceptions: ["CUSTOM_FILE.md"],
              } as DocumentOrganizationOptions,
            },
          ],
        },
      };

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toBe("ANOTHER_FILE.md");
    });
  });

  describe("global exclude patterns", () => {
    it("should respect global exclude patterns", async () => {
      mockContext.markdownFiles = [
        createFileInfo("vendor/guide.md"),
        createFileInfo("legacy/old-docs.md"),
      ];

      mockContext.config = {
        version: "1.0.0",
        context: {
          patterns: {
            exclude: ["vendor/**", "legacy/**"],
          },
        },
      };

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("non-root README files", () => {
    it("should allow README files in subdirectories", async () => {
      mockContext.markdownFiles = [
        createFileInfo("src/README.md"),
        createFileInfo("lib/README.md"),
        createFileInfo("packages/core/README.md"),
      ];

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });

  describe("mixed scenarios", () => {
    it("should handle combination of valid and invalid files", async () => {
      mockContext.markdownFiles = [
        createFileInfo("README.md"), // valid root exception
        createFileInfo("docs/api.md"), // valid in docs folder
        createFileInfo("tutorial.md"), // invalid root file
        createFileInfo("src/guide.md"), // invalid in src folder
        createFileInfo(".github/CONTRIBUTING.md"), // valid in special dir
      ];

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(2);
      expect(violations.map((v) => v.file)).toContain("tutorial.md");
      expect(violations.map((v) => v.file)).toContain("src/guide.md");
    });
  });

  describe("case sensitivity", () => {
    it("should handle case-insensitive folder matching", async () => {
      mockContext.markdownFiles = [
        createFileInfo("Docs/api.md"),
        createFileInfo("DOCS/guide.md"),
        createFileInfo("docs/tutorial.md"),
      ];

      const violations = await documentOrganization.check(mockContext);
      expect(violations).toHaveLength(0);
    });
  });
});
