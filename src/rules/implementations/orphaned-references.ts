import {
  LibraryRule,
  LibraryRuleViolation,
  LibraryRuleContext,
} from "../types";
import { findFileReferenceLineNumber } from "../utils/line-numbers";
import { getViewsDir, getNotesDir } from "../../utils/alexandria-paths";

export const orphanedReferences: LibraryRule = {
  id: "orphaned-references",
  name: "Orphaned File References",
  severity: "error",
  category: "critical",
  description: "Context references files that no longer exist in the codebase",
  impact:
    "AI agents will reference non-existent files, causing errors and confusion",
  fixable: false,
  enabled: true,

  async check(context: LibraryRuleContext): Promise<LibraryRuleViolation[]> {
    const violations: LibraryRuleViolation[] = [];
    const { views, notes, projectRoot, fsAdapter } = context;

    // Require fsAdapter for this rule
    if (!fsAdapter) {
      throw new Error("orphaned-references rule requires fsAdapter in context");
    }

    // Check files referenced in view reference groups
    for (const view of views) {
      if (view.referenceGroups) {
        for (const groupName in view.referenceGroups) {
          const referenceGroup = view.referenceGroups[groupName];
          // Check if it's a file reference group (has 'files' property)
          if (
            "files" in referenceGroup &&
            Array.isArray(referenceGroup.files)
          ) {
            for (const file of referenceGroup.files) {
              const fullPath = fsAdapter.join(projectRoot, file);
              if (!fsAdapter.exists(fullPath)) {
                const viewFilePath = fsAdapter.join(
                  getViewsDir(fsAdapter, projectRoot),
                  `${view.name}.json`,
                );
                const lineNumber = findFileReferenceLineNumber(
                  fsAdapter,
                  viewFilePath,
                  file,
                );
                violations.push({
                  ruleId: this.id,
                  severity: this.severity,
                  file: `views/${view.name}.json`,
                  line: lineNumber,
                  message: `View "${view.name}" reference group "${groupName}" references non-existent file: ${file}`,
                  impact: this.impact,
                  fixable: this.fixable,
                });
              }
            }
          }
        }
      }
    }

    // Check files referenced in notes
    for (const noteWithPath of notes) {
      for (const anchorPath of noteWithPath.note.anchors) {
        const fullPath = fsAdapter.join(projectRoot, anchorPath);
        if (!fsAdapter.exists(fullPath)) {
          const noteFilePath = fsAdapter.join(
            getNotesDir(fsAdapter, projectRoot),
            `${noteWithPath.note.id}.json`,
          );
          const lineNumber = findFileReferenceLineNumber(
            fsAdapter,
            noteFilePath,
            anchorPath,
          );
          violations.push({
            ruleId: this.id,
            severity: this.severity,
            file: `notes/${noteWithPath.note.id}.json`,
            line: lineNumber,
            message: `Note "${noteWithPath.note.id}" references non-existent file: ${anchorPath}`,
            impact: this.impact,
            fixable: this.fixable,
          });
        }
      }
    }

    return violations;
  },
};
