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
 * Status of a topic — a small structured axis plus optional human nuance.
 *
 * `state` is the machine-meaningful signal (drives badge color, sorting, and
 * filtering on the home view). `label` is free-form text shown on the card in
 * place of the default per-state label ("done for now", "revisit after
 * launch", "nice-to-dos left"). `waitingOn` describes an external blocker and
 * is meaningful when `state` is `waiting` — the topic is parked on something
 * that is NOT the user, optionally carrying a date and/or a pointer to the
 * thing being waited on.
 *
 * The structured shape is deliberate: it lets automations check and resolve a
 * blocker without parsing prose — e.g. flip `waiting` → `paused`
 * once `until` passes, or once a referenced PR (`ref.kind === "pr"`) merges.
 *
 * Like the rest of {@link Topic}, this crosses the desktop/web boundary, so
 * any timestamp here is an ISO 8601 string.
 */
export interface TopicStatus {
  /**
   * Structured lifecycle axis, ordered by a feature's "aliveness" from nascent
   * to retired. Readers treat an absent OR unrecognized `state` as
   * `new-thought`, so legacy topics and renamed values need no migration.
   * - `new-thought` — a captured idea, not yet committed to (nascent; the default)
   * - `working` — actively in progress
   * - `paused` — set down for now; the ball is in the user's court
   * - `waiting` — parked on something external; see {@link TopicStatus.waitingOn}
   * - `done-for-now` — complete / live / shipped, not actively worked
   * - `deprecated` — was live, now retired / end-of-life
   * - `abandoned` — created but discarded; never shipped
   */
  state:
    | "new-thought"
    | "working"
    | "paused"
    | "waiting"
    | "done-for-now"
    | "deprecated"
    | "abandoned";
  /**
   * Optional free-form text shown on the card in place of the default label
   * for the state. Lets a topic read "revisit after launch" while still
   * sorting/filtering as `paused`.
   */
  label?: string;
  /**
   * External blocker description. Meaningful when `state` is `waiting`; a
   * holding pattern is distinct from `paused` precisely because the
   * user is NOT what's being waited on, so it must not surface in "needs me"
   * views.
   */
  waitingOn?: {
    /** Human description of the blocker, e.g. "design sign-off". */
    note?: string;
    /**
     * ISO 8601 — when the hold is expected to lift. The hook for time-based
     * unblock: a reader may treat a past `until` as no longer waiting.
     */
    until?: string;
    /** Structured pointer to the thing being waited on, for automations to resolve. */
    ref?: {
      kind: "url" | "pr" | "issue" | "topic" | "trail";
      /** The address/id of the referenced thing (URL, PR number, topic id, …). */
      value: string;
      /** Optional human label for display. */
      title?: string;
    };
  };
}

/**
 * An image attached to a topic — primarily a screenshot dragged into the
 * description. Bytes live on the topic (referenced from the description via an
 * `asset://<id>` markdown link), not inlined into the description string, so
 * they survive the description's length cap and publish to web-ade with the
 * topic. A render-time resolver swaps `asset://<id>` for `url` (preferred) or a
 * data-URL built from `data`, keeping a local (data-only) and a published
 * (url-bearing) topic interchangeable on read.
 */
export interface TopicAsset {
  /** Content hash — free dedup and the stable `asset://` target. */
  id: string;
  /** MIME type, e.g. "image/png". */
  mime: string;
  /** Base64-encoded bytes. Present locally and on publish. */
  data?: string;
  /** Resolvable URL, when the bytes have been offloaded (e.g. to S3). */
  url?: string;
  /** Markdown alt text. */
  alt?: string;
  /** Origin metadata, for future re-capture / open-live affordances. */
  source?: { storyId?: string; storybookUrl?: string };
}

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
  /**
   * Optional workflow status. Absent means `active` (a topic that has never
   * been triaged). Travels with the topic when shared/published, so the same
   * status is visible on web-ade. See {@link TopicStatus}.
   */
  status?: TopicStatus;
  /**
   * Images attached to the topic — typically screenshots dragged into the
   * description, referenced from the markdown via `asset://<id>`. Optional, so
   * existing topics.json files need no migration. See {@link TopicAsset}.
   */
  assets?: TopicAsset[];
}

/**
 * Storage structure for topics.json
 */
export interface TopicsData {
  version: string;
  topics: Topic[];
}
