/**
 * @principal-ai/alexandria-core-library/types
 *
 * Type-only exports for use in browser/Next.js client components.
 * This entry point contains no implementation code and won't trigger
 * webpack to resolve Node.js dependencies.
 */

// Essential types from pure-core
export type {
  // Core note types
  StoredAnchoredNote,
  AnchoredNoteWithPath,
  MemoryPalaceConfiguration,
  StaleAnchoredNote,

  // Path validation types
  ValidatedRepositoryPath,
  ValidatedRelativePath,

  // CodebaseView types
  CodebaseView,
  CodebaseViewCell,
  CodebaseViewFileCell,
  CodebaseViewScope,
  CodebaseViewLinks,
  ViewValidationResult,
  PatternValidationResult,
  FileListValidationResult,

  // PalaceRoom types
  PalaceRoom,
  CreatePalaceRoomOptions,
  UpdatePalaceRoomOptions,
  PalaceRoomOperationResult,

  // PalacePortal types
  PalacePortal,
  PortalTarget,
  PortalTargetType,
  PortalDisplayMode,
  PortalSyncStrategy,
  PortalReferenceType,
  PortalStatus,
  PortalReferences,
  CreatePortalOptions,
  ImportPortalOptions,
  PortalContent,
  PalaceURI,
  PalaceResourceType,
  CrossPalaceReference,
  ReferenceStatus,
} from "./pure-core/types/index.js";

// Repository and Alexandria types
export type {
  ValidatedAlexandriaPath,
  AlexandriaRepository,
  AlexandriaEntry,
  AlexandriaRepositoryRegistry,
  GithubRepository,
} from "./pure-core/types/repository.js";

// CodebaseView summary types
export type { CodebaseViewSummary } from "./pure-core/types/summary.js";

// Validation types
export type {
  ValidationResult as CodebaseValidationResult,
  ValidationIssue,
} from "./pure-core/validation/CodebaseViewValidator.js";

// Config types
export type { ValidationResult as ConfigValidationResult } from "./config/types.js";

// Filesystem adapter for dependency injection
export type { FileSystemAdapter } from "./pure-core/abstractions/filesystem.js";

// Glob adapter for pattern matching
export type { GlobAdapter, GlobOptions } from "./pure-core/abstractions/glob.js";

// Workspace management types
export type {
  Workspace,
  WorkspaceMembership,
  WorkspacesData,
  WorkspaceMembershipsData,
} from "./projects-core/types.js";

// Drawing types
export type { DrawingMetadata } from "./pure-core/stores/DrawingStore.js";
export type {
  ExcalidrawData,
  RoomDrawingMetadata,
} from "./pure-core/types/drawing.js";

// Storage types
export type {
  ReadingRecordAdapter,
  StorageCapabilities,
  StorageConfig,
  StorageStats,
  StorageResult,
  StorageEvents,
  VisitQuery,
  BookmarkQuery,
} from "./storage/types.js";

// Alexandria bookmark and state types
export type {
  AlexandriaVisit,
  AlexandriaBookmark,
  AlexandriaLibraryCard,
  AlexandriaDocumentVersion,
  AlexandriaBookmarkedDocument,
} from "./types/alexandria-state.js";

// Task types
export type {
  Task,
  TaskStatus,
  TaskPriority,
  CreateTaskInput,
  UpdateTaskOptions,
  TaskQueryOptions,
  GitReferences,
  TaskMetadata,
  TaskAssociations,
  CompletedTask,
  TaskEvent,
  TaskEventType,
  TaskStatistics,
  TaskIndex,
  TaskIndexEntry,
} from "./pure-core/types/task.js";

// Rule types
export type {
  LibraryRule,
  LibraryRuleSeverity,
  LibraryRuleCategory,
  LibraryRuleViolation,
  LibraryRuleContext,
  LibraryRuleSet,
  LibraryLintResult,
  FileInfo,
  GitFileHistory,
} from "./rules/types.js";

// Configuration types
export type {
  AlexandriaConfig,
  ContextRule,
  DocumentOrganizationOptions,
  FilenameConventionOptions,
  StaleReferencesOptions,
  RequireReferencesOptions,
  RuleOptions,
  ProjectType,
  RuleSeverity,
  ReportingOutput,
  ReportingFormat,
  PriorityLevel,
  FixType,
  PriorityPattern,
  FilenameStyle,
  FilenameSeparator,
  FilenameCaseStyle,
} from "./config/types.js";
