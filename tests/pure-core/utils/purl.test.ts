import { describe, it, expect } from "bun:test";
import {
  createPurl,
  parsePurl,
  isValidPurl,
  githubIdToPurl,
  purlToGithubId,
  extractPurlFromRemoteUrl,
  PurlBuilders,
  type Purl,
} from "../../../src/pure-core/utils/purl";

describe("PURL utilities", () => {
  describe("createPurl", () => {
    it("should create a simple PURL", () => {
      const purl = createPurl({
        type: "github",
        namespace: "anthropic",
        name: "claude",
      });

      expect(purl).toBe("pkg:github/anthropic/claude");
    });

    it("should create a PURL with version", () => {
      const purl = createPurl({
        type: "npm",
        namespace: "@scope",
        name: "package",
        version: "1.0.0",
      });

      expect(purl).toBe("pkg:npm/@scope/package@1.0.0");
    });

    it("should create a PURL without namespace", () => {
      const purl = createPurl({
        type: "generic",
        name: "my-app",
      });

      expect(purl).toBe("pkg:generic/my-app");
    });

    it("should handle qualifiers and subpath", () => {
      const purl = createPurl({
        type: "github",
        namespace: "owner",
        name: "repo",
        qualifiers: { arch: "x64", os: "linux" },
        subpath: "src/main.ts",
      });

      expect(purl).toContain("pkg:github/owner/repo?");
      expect(purl).toContain("arch=x64");
      expect(purl).toContain("os=linux");
      expect(purl).toContain("#src/main.ts");
    });
  });

  describe("parsePurl", () => {
    it("should parse a simple GitHub PURL", () => {
      const parsed = parsePurl("pkg:github/anthropic/claude");

      expect(parsed).toEqual({
        type: "github",
        namespace: "anthropic",
        name: "claude",
        version: undefined,
        qualifiers: undefined,
        subpath: undefined,
      });
    });

    it("should parse a PURL with version", () => {
      const parsed = parsePurl("pkg:npm/@scope/package@1.0.0");

      expect(parsed).toEqual({
        type: "npm",
        namespace: "@scope",
        name: "package",
        version: "1.0.0",
        qualifiers: undefined,
        subpath: undefined,
      });
    });

    it("should parse a PURL without namespace", () => {
      const parsed = parsePurl("pkg:generic/my-app");

      expect(parsed).toEqual({
        type: "generic",
        namespace: undefined,
        name: "my-app",
        version: undefined,
        qualifiers: undefined,
        subpath: undefined,
      });
    });

    it("should parse a git PURL with domain", () => {
      const parsed = parsePurl("pkg:git/example.com/owner/repo");

      expect(parsed).toEqual({
        type: "git",
        namespace: "example.com/owner",
        name: "repo",
        version: undefined,
        qualifiers: undefined,
        subpath: undefined,
      });
    });

    it("should return null for invalid PURL", () => {
      expect(parsePurl("not-a-purl")).toBeNull();
      expect(parsePurl("pkg:")).toBeNull();
      expect(parsePurl("pkg:invalid")).toBeNull();
    });
  });

  describe("isValidPurl", () => {
    it("should validate correct PURLs", () => {
      expect(isValidPurl("pkg:github/owner/repo")).toBe(true);
      expect(isValidPurl("pkg:npm/@scope/package")).toBe(true);
      expect(isValidPurl("pkg:generic/app")).toBe(true);
    });

    it("should reject invalid PURLs", () => {
      expect(isValidPurl("not-a-purl")).toBe(false);
      expect(isValidPurl("pkg:")).toBe(false);
      expect(isValidPurl("")).toBe(false);
    });
  });

  describe("githubIdToPurl", () => {
    it("should convert github.id to PURL", () => {
      const purl = githubIdToPurl("anthropic/claude");

      expect(purl).toBe("pkg:github/anthropic/claude");
    });

    it("should throw error for invalid github.id", () => {
      expect(() => githubIdToPurl("invalid")).toThrow("Invalid GitHub ID format");
      expect(() => githubIdToPurl("a/b/c")).toThrow("Invalid GitHub ID format");
    });
  });

  describe("purlToGithubId", () => {
    it("should extract github.id from GitHub PURL", () => {
      const purl = "pkg:github/anthropic/claude" as Purl;
      const githubId = purlToGithubId(purl);

      expect(githubId).toBe("anthropic/claude");
    });

    it("should return null for non-GitHub PURL", () => {
      const purl = "pkg:npm/@scope/package" as Purl;
      const githubId = purlToGithubId(purl);

      expect(githubId).toBeNull();
    });

    it("should return null for PURL without namespace", () => {
      const purl = "pkg:github/repo" as Purl;
      const githubId = purlToGithubId(purl);

      expect(githubId).toBeNull();
    });
  });

  describe("extractPurlFromRemoteUrl", () => {
    it("should extract PURL from GitHub HTTPS URL", () => {
      const purl = extractPurlFromRemoteUrl("https://github.com/anthropic/claude.git");

      expect(purl).toBe("pkg:github/anthropic/claude");
    });

    it("should extract PURL from GitHub SSH URL", () => {
      const purl = extractPurlFromRemoteUrl("git@github.com:owner/repo.git");

      expect(purl).toBe("pkg:github/owner/repo");
    });

    it("should extract PURL from GitHub URL without .git", () => {
      const purl = extractPurlFromRemoteUrl("https://github.com/owner/repo");

      expect(purl).toBe("pkg:github/owner/repo");
    });

    it("should extract PURL from GitLab URL", () => {
      const purl = extractPurlFromRemoteUrl("https://gitlab.com/owner/repo.git");

      expect(purl).toBe("pkg:gitlab/owner/repo");
    });

    it("should extract PURL from Bitbucket URL", () => {
      const purl = extractPurlFromRemoteUrl("https://bitbucket.org/owner/repo.git");

      expect(purl).toBe("pkg:bitbucket/owner/repo");
    });

    it("should extract PURL from generic git HTTPS URL", () => {
      const purl = extractPurlFromRemoteUrl("https://example.com/owner/repo.git");

      expect(purl).toBe("pkg:git/example.com/owner/repo");
    });

    it("should extract PURL from generic git SSH URL", () => {
      const purl = extractPurlFromRemoteUrl("git@example.com:owner/repo.git");

      expect(purl).toBe("pkg:git/example.com/owner/repo");
    });

    it("should return null for invalid URL", () => {
      expect(extractPurlFromRemoteUrl("not-a-url")).toBeNull();
      expect(extractPurlFromRemoteUrl("https://example.com")).toBeNull();
    });
  });

  describe("PurlBuilders", () => {
    it("should build GitHub PURL", () => {
      const purl = PurlBuilders.github("anthropic", "claude");

      expect(purl).toBe("pkg:github/anthropic/claude");
    });

    it("should build GitHub PURL with version", () => {
      const purl = PurlBuilders.github("anthropic", "claude", "1.0.0");

      expect(purl).toBe("pkg:github/anthropic/claude@1.0.0");
    });

    it("should build GitLab PURL", () => {
      const purl = PurlBuilders.gitlab("owner", "repo");

      expect(purl).toBe("pkg:gitlab/owner/repo");
    });

    it("should build npm PURL with scope", () => {
      const purl = PurlBuilders.npm("@scope", "package");

      expect(purl).toBe("pkg:npm/@scope/package");
    });

    it("should build npm PURL without scope", () => {
      const purl = PurlBuilders.npm(undefined, "package");

      expect(purl).toBe("pkg:npm/package");
    });

    it("should build generic PURL", () => {
      const purl = PurlBuilders.generic("my-app");

      expect(purl).toBe("pkg:generic/my-app");
    });

    it("should build git PURL with custom host", () => {
      const purl = PurlBuilders.git("example.com", "owner", "repo");

      expect(purl).toBe("pkg:git/example.com/owner/repo");
    });
  });
});
