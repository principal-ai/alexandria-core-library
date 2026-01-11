/**
 * Package URL (PURL) utilities for canonical repository identification
 *
 * @see https://github.com/package-url/purl-spec
 */

/**
 * Package URL (PURL) for canonical repository identification
 * Format: pkg:<type>/<namespace>/<name>[@<version>][?<qualifiers>][#<subpath>]
 */
export type Purl = string & { readonly __brand: unique symbol };

/**
 * Supported PURL types for repository identification
 */
export type PurlType = 'github' | 'gitlab' | 'bitbucket' | 'git' | 'npm' | 'pypi' | 'cargo' | 'golang' | 'generic';

/**
 * Parsed PURL components
 */
export interface ParsedPurl {
  type: PurlType;
  namespace?: string;      // owner/org for git hosts, scope for npm
  name: string;
  version?: string;
  qualifiers?: Record<string, string>;
  subpath?: string;
}

/**
 * Create a PURL from components
 */
export function createPurl(components: {
  type: PurlType;
  namespace?: string;
  name: string;
  version?: string;
  qualifiers?: Record<string, string>;
  subpath?: string;
}): Purl {
  const { type, namespace, name, version, qualifiers, subpath } = components;

  let purl = `pkg:${type}`;

  if (namespace) {
    purl += `/${namespace}`;
  }

  purl += `/${name}`;

  if (version) {
    purl += `@${version}`;
  }

  if (qualifiers && Object.keys(qualifiers).length > 0) {
    const qualifierStr = Object.entries(qualifiers)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    purl += `?${qualifierStr}`;
  }

  if (subpath) {
    purl += `#${subpath}`;
  }

  return purl as Purl;
}

/**
 * Parse a PURL string into components
 */
export function parsePurl(purl: string): ParsedPurl | null {
  // Basic PURL format: pkg:<type>/<namespace>/<name>[@<version>][?<qualifiers>][#<subpath>]
  // Simplified: pkg:<type>/<namespace>/<name> or pkg:<type>/<name>

  if (!purl.startsWith('pkg:')) {
    return null;
  }

  try {
    // Remove pkg: prefix
    let remaining = purl.substring(4);

    // Extract subpath (after #)
    let subpath: string | undefined;
    const hashIndex = remaining.indexOf('#');
    if (hashIndex !== -1) {
      subpath = remaining.substring(hashIndex + 1);
      remaining = remaining.substring(0, hashIndex);
    }

    // Extract qualifiers (after ?)
    let qualifiers: Record<string, string> | undefined;
    const questionIndex = remaining.indexOf('?');
    if (questionIndex !== -1) {
      const qualifierStr = remaining.substring(questionIndex + 1);
      qualifiers = {};
      qualifierStr.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k && v) {
          qualifiers![decodeURIComponent(k)] = decodeURIComponent(v);
        }
      });
      remaining = remaining.substring(0, questionIndex);
    }

    // Parse type/namespace/name first (before handling version)
    // This is important because @ can appear in namespace (e.g., @scope for npm)
    const parts = remaining.split('/');

    if (parts.length < 2) {
      return null;
    }

    const type = parts[0] as PurlType;

    // For types like npm, github, gitlab: namespace/name format
    // For types like generic, git: might be just name
    let namespace: string | undefined;
    let nameWithVersion: string;

    if (parts.length === 2) {
      // pkg:type/name
      nameWithVersion = parts[1];
    } else {
      // pkg:type/namespace/name or pkg:git/host/owner/repo
      if (type === 'git') {
        // Special handling for git URLs: pkg:git/example.com/owner/repo
        namespace = parts.slice(1, -1).join('/');
        nameWithVersion = parts[parts.length - 1];
      } else {
        // Standard: pkg:github/owner/repo or pkg:npm/@scope/package
        namespace = parts[1];
        nameWithVersion = parts.slice(2).join('/'); // Support nested names
      }
    }

    // Now extract version from the name part (after the last @)
    let version: string | undefined;
    let name: string;
    const atIndex = nameWithVersion.lastIndexOf('@');
    if (atIndex !== -1 && atIndex > 0) {
      // Make sure @ is not at the start (like @scope)
      version = nameWithVersion.substring(atIndex + 1);
      name = nameWithVersion.substring(0, atIndex);
    } else {
      name = nameWithVersion;
    }

    return {
      type,
      namespace,
      name,
      version,
      qualifiers,
      subpath,
    };
  } catch {
    return null;
  }
}

/**
 * Validate a PURL string
 */
export function isValidPurl(value: string): value is Purl {
  return parsePurl(value) !== null;
}

/**
 * Convert legacy github.id format to PURL
 * @param githubId - GitHub ID in format "owner/repo"
 */
export function githubIdToPurl(githubId: string): Purl {
  const parts = githubId.split('/');
  if (parts.length !== 2) {
    throw new Error(`Invalid GitHub ID format: ${githubId}`);
  }

  return createPurl({
    type: 'github',
    namespace: parts[0],
    name: parts[1],
  });
}

/**
 * Extract github.id from a GitHub PURL (for backwards compatibility)
 * @returns GitHub ID in format "owner/repo" or null if not a GitHub PURL
 */
export function purlToGithubId(purl: Purl): string | null {
  const parsed = parsePurl(purl);

  if (!parsed || parsed.type !== 'github') {
    return null;
  }

  if (!parsed.namespace) {
    return null;
  }

  return `${parsed.namespace}/${parsed.name}`;
}

/**
 * Extract PURL from a git remote URL
 */
export function extractPurlFromRemoteUrl(remoteUrl: string): Purl | null {
  // GitHub
  const githubMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/);
  if (githubMatch) {
    return createPurl({
      type: 'github',
      namespace: githubMatch[1],
      name: githubMatch[2],
    });
  }

  // GitLab
  const gitlabMatch = remoteUrl.match(/gitlab\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/);
  if (gitlabMatch) {
    return createPurl({
      type: 'gitlab',
      namespace: gitlabMatch[1],
      name: gitlabMatch[2],
    });
  }

  // Bitbucket
  const bitbucketMatch = remoteUrl.match(/bitbucket\.org[:/]([^/]+)\/([^/.]+)(\.git)?$/);
  if (bitbucketMatch) {
    return createPurl({
      type: 'bitbucket',
      namespace: bitbucketMatch[1],
      name: bitbucketMatch[2],
    });
  }

  // Generic git URL: https://example.com/owner/repo.git or git@example.com:owner/repo.git
  const genericHttpsMatch = remoteUrl.match(/https?:\/\/([^/]+)\/([^/]+)\/([^/.]+)(\.git)?$/);
  if (genericHttpsMatch) {
    return createPurl({
      type: 'git',
      namespace: `${genericHttpsMatch[1]}/${genericHttpsMatch[2]}`,
      name: genericHttpsMatch[3],
    });
  }

  const genericSshMatch = remoteUrl.match(/git@([^:]+):([^/]+)\/([^/.]+)(\.git)?$/);
  if (genericSshMatch) {
    return createPurl({
      type: 'git',
      namespace: `${genericSshMatch[1]}/${genericSshMatch[2]}`,
      name: genericSshMatch[3],
    });
  }

  return null;
}

/**
 * PURL builders for common providers
 */
export const PurlBuilders = {
  github: (owner: string, repo: string, version?: string): Purl =>
    createPurl({ type: 'github', namespace: owner, name: repo, version }),

  gitlab: (owner: string, repo: string, version?: string): Purl =>
    createPurl({ type: 'gitlab', namespace: owner, name: repo, version }),

  bitbucket: (owner: string, repo: string, version?: string): Purl =>
    createPurl({ type: 'bitbucket', namespace: owner, name: repo, version }),

  npm: (scope: string | undefined, name: string, version?: string): Purl =>
    createPurl({ type: 'npm', namespace: scope, name, version }),

  generic: (name: string, version?: string): Purl =>
    createPurl({ type: 'generic', name, version }),

  git: (host: string, owner: string, repo: string, version?: string): Purl =>
    createPurl({ type: 'git', namespace: `${host}/${owner}`, name: repo, version }),
};
