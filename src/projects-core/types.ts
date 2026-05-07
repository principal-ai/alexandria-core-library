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
  /** Extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Maps repositories to workspaces (many-to-many)
 * Stored in Alexandria registry as separate mapping table
 *
 * Uses PURL as canonical repository identity, so all local clones of a
 * repository belong to the same workspaces.
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
