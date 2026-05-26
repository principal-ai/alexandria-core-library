/**
 * Project registry types
 */

import { AlexandriaEntry } from "../pure-core/types/repository";
import type { Purl } from "../pure-core/utils/purl";

export interface ProjectRegistryData {
  version: string;
  projects: AlexandriaEntry[];
}

/**
 * Workspace types
 */

/**
 * A virtual workspace for organizing repositories
 * Stored and managed by Alexandria registry
 */
export interface Workspace {
  /** Unique identifier (UUID) */
  id: string;
  /** Display name (e.g., "Active Projects") */
  name: string;
  /** Optional description */
  description?: string;
  /** Optional theme identifier */
  theme?: string;
  /** Optional icon identifier */
  icon?: string;
  /** Default workspace for new clones */
  isDefault?: boolean;
  /** Unix timestamp */
  createdAt: number;
  /** Unix timestamp */
  updatedAt: number;
  /** Optional path hint for clone suggestions */
  suggestedClonePath?: string;
  /**
   * Topics this workspace contains, in display order.
   *
   * v1 single-topic flow stores `[topic.id]` at create time; multi-topic
   * support extends this list. Missing/empty on legacy workspaces that
   * predate topics — readers should treat absence as `[]`.
   */
  topicIds?: string[];
  /** Extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Maps repositories to workspaces (many-to-many)
 * Stored in Alexandria registry as separate mapping table
 *
 * Uses PURL as canonical repository identity. When `clonePath` is set, the
 * membership is scoped to that specific local checkout; when absent (legacy
 * data, or memberships added by PURL-only), the membership matches every
 * local clone with the same `repositoryId`.
 */
export interface WorkspaceMembership {
  /**
   * Repository identity — PURL format only (e.g. `pkg:github/owner/repo`,
   * or `pkg:generic/local/...` for local-only repos).
   */
  repositoryId: Purl;
  /** Workspace identifier */
  workspaceId: string;
  /** Unix timestamp when added */
  addedAt: number;
  /**
   * Absolute local clone path. When set, scopes this membership to one
   * specific checkout (so two clones of the same repo can belong to
   * different workspaces). Omitted for memberships added by PURL alone or
   * persisted before this field existed — those keep fan-out behavior.
   */
  clonePath?: string;
  /** Workspace-specific metadata for this repository */
  metadata?: {
    /** Pin to top of workspace */
    pinned?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Storage structure for workspaces.json
 */
export interface WorkspacesData {
  version: string;
  workspaces: Workspace[];
}

/**
 * Storage structure for workspace-memberships.json
 */
export interface WorkspaceMembershipsData {
  version: string;
  memberships: WorkspaceMembership[];
}

/**
 * Topic types
 */

/**
 * A curated bundle of trails on a single subject.
 *
 * Topics are the source-of-truth for "what trails belong together" — a
 * workspace references one or more topics via {@link Workspace.topicIds},
 * and the repository set involved in a workspace is derived by walking each
 * topic's trails. Designed to mirror the over-the-wire shape used by the
 * sharing API (`web-ade`), so a published topic and a locally stored one
 * are interchangeable on read.
 *
 * Timestamps are ISO 8601 strings — different from {@link Workspace}, which
 * uses Unix ms — because this shape crosses the desktop/web boundary and
 * ISO 8601 is the canonical wire format.
 */
export interface Topic {
  /** Unique identifier. Locally generated; the server assigns its own id on publish. */
  id: string;
  /** Display title (1–200 chars on the server). */
  title: string;
  /** Optional markdown body. */
  description?: string;
  /** Ordered list of trail ids — foreign keys into the local/server trail store. */
  trailIds: string[];
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  updatedAt: string;
  /**
   * GitHub identity of the creator. Populated when a signed-in user creates
   * a topic; left undefined for local-only topics created before sign-in.
   * The server requires this field on publish.
   */
  createdBy?: { githubId: number; githubLogin: string };
}

/**
 * Storage structure for topics.json
 */
export interface TopicsData {
  version: string;
  topics: Topic[];
}
