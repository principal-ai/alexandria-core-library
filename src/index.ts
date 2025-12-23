/**
 * @principal-ai/alexandria-core-library
 *
 * Core library exports for the Principal AI Alexandria ecosystem.
 * Provides essential functionality for managing views and configurations.
 */

// Essential types from pure-core
export type {
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
} from "./pure-core/types";

// Repository and Alexandria types
export type {
  ValidatedAlexandriaPath,
  AlexandriaRepository,
  AlexandriaEntry,
  AlexandriaRepositoryRegistry,
  GithubRepository,
} from "./pure-core/types/repository";

// CodebaseView summary types
export type { CodebaseViewSummary } from "./pure-core/types/summary";
export {
  extractCodebaseViewSummary,
  extractCodebaseViewSummaries,
} from "./pure-core/types/summary";

// Validation types
export type {
  ValidationResult as CodebaseValidationResult,
  ValidationIssue,
} from "./pure-core/validation/CodebaseViewValidator";

// Config types
export type { ValidationResult as ConfigValidationResult } from "./config/types";

// Filesystem adapter for dependency injection
export type { FileSystemAdapter } from "./pure-core/abstractions/filesystem";
export { InMemoryFileSystemAdapter } from "./test-adapters/InMemoryFileSystemAdapter";

// Glob adapter for pattern matching
export type { GlobAdapter, GlobOptions } from "./pure-core/abstractions/glob";

// FileTree-based adapters for browser environments
export {
  FileTreeFileSystemAdapter,
  FileTreeGlobAdapter,
} from "./filetree-adapters";
export type {
  FileTreeFileSystemAdapterOptions,
  FileTreeGlobAdapterOptions,
} from "./filetree-adapters";

// Note: NodeFileSystemAdapter and NodeGlobAdapter are available via the /node entry point
// Import from '@principal-ai/alexandria-core-library/node' to use Node.js-specific adapters

// Primary API classes
export { MemoryPalace } from "./MemoryPalace";
export type {
  DocumentOverview,
  GetDocumentsOverviewOptions,
} from "./MemoryPalace";

// Project management
export { ProjectRegistryStore } from "./projects-core/ProjectRegistryStore";
export { AlexandriaOutpostManager } from "./projects-core/AlexandriaOutpostManager";

// Workspace management
export { WorkspaceManager } from "./projects-core/WorkspaceManager";
export type {
  Workspace,
  WorkspaceMembership,
  WorkspacesData,
  WorkspaceMembershipsData,
} from "./projects-core/types";

// Store exports for direct access if needed
export {
  CodebaseViewsStore,
  generateViewIdFromName,
} from "./pure-core/stores/CodebaseViewsStore";
export { DrawingStore } from "./pure-core/stores/DrawingStore";
export type { DrawingMetadata } from "./pure-core/stores/DrawingStore";
export type { ExcalidrawData } from "./pure-core/types/drawing";

// Utilities and rules
export { LibraryRulesEngine } from "./rules/index";
export { OverviewPathAutoFix } from "./pure-core/autofixes/OverviewPathAutoFix";
export { ConfigValidator } from "./config/validator";
export { ConfigLoader } from "./config/loader";

// Pattern utilities
export {
  matchesPatterns,
  getExcludePatterns,
  filterByExcludePatterns,
} from "./rules/utils/patterns";

// Rule types for CLI and external consumers
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
} from "./rules/types";

// Location-bound files - for understanding which files should not be centralized
export type {
  LocationConstraint,
  LocationBoundFile,
} from "./rules/utils/location-bound-files";
export {
  LOCATION_BOUND_FILES,
  isLocationBound,
  isNamingExempt,
  getLocationBoundInfo,
  getLocationBoundExplanation,
  getNamingExemptions,
  getRootExceptions,
  getOrganizationExemptions,
  validateLocationBoundFile,
  filterLocationBoundFiles,
} from "./rules/utils/location-bound-files";

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
} from "./config/types";

// Constants
export { ALEXANDRIA_DIRS } from "./constants/paths";
export { CONFIG_FILENAME } from "./config/schema";

// Project utilities
export { hasAlexandriaWorkflow } from "./projects-core/workflow-utils";

// ============================================================================
// Storage and Bookmarking System
// ============================================================================

// Storage manager and adapters
export { ReadingRecordManager } from "./storage/ReadingRecordManager";
export { MemoryReadingRecordAdapter } from "./storage/adapters/memory";
export { LocalStorageReadingRecordAdapter } from "./storage/adapters/localStorage";

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
} from "./storage/types";

// Alexandria bookmark and state types
export type {
  AlexandriaVisit,
  AlexandriaBookmark,
  AlexandriaLibraryCard,
  AlexandriaDocumentVersion,
  AlexandriaBookmarkedDocument,
} from "./types/alexandria-state";

