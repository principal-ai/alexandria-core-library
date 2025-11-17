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
} from "./types";

// Re-export types from pure-core that are used in rules
export type { CodebaseView, AnchoredNoteWithPath } from "../pure-core/types";

export { LibraryRulesEngine } from "./engine";
export { requireReferences } from "./implementations/require-references";
export { orphanedReferences } from "./implementations/orphaned-references";
export { staleReferences } from "./implementations/stale-references";
export { codebaseCoverage } from "./implementations/codebase-coverage";
export { minimumReferences } from "./implementations/minimum-references";
