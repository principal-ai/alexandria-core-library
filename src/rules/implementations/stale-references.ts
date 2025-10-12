import {
  LibraryRule,
  LibraryRuleViolation,
  LibraryRuleContext,
} from "../types";

export const staleReferences: LibraryRule = {
  id: "stale-references",
  name: "Stale References",
  severity: "warning",
  category: "quality",
  description:
    "Context documentation has not been updated since referenced files changed",
  impact:
    "AI agents may use outdated patterns and assumptions from stale documentation",
  fixable: false,
  enabled: true,

  async check(context: LibraryRuleContext): Promise<LibraryRuleViolation[]> {
    const violations: LibraryRuleViolation[] = [];
    const { views, notes, files, fsAdapter } = context;

    // Require fsAdapter for this rule
    if (!fsAdapter) {
      throw new Error("stale-references rule requires fsAdapter in context");
    }

    try {
      // Build a map of file paths to their last modified dates
      const fileModMap = new Map<string, Date>();
      for (const fileInfo of files) {
        if (fileInfo.lastModified) {
          fileModMap.set(fileInfo.relativePath, fileInfo.lastModified);
        }
      }

      // Helper to get last modification date for a file
      const getLastModified = (relativePath: string): Date | null => {
        return fileModMap.get(relativePath) || null;
      };

      // Check views with overview files
      for (const view of views) {
        // Only check views that have an overview file
        if (!view.overviewPath) continue;

        const overviewLastModified = getLastModified(view.overviewPath);

        if (!overviewLastModified) continue;

        // Check if any referenced files have been modified after the overview
        let newestFileModification: Date | null = null;
        let newestFile: string | null = null;

        if (view.referenceGroups) {
          for (const groupName in view.referenceGroups) {
            const referenceGroup = view.referenceGroups[groupName];
            // Check if it's a file reference group (has 'files' property)
            if (
              "files" in referenceGroup &&
              Array.isArray(referenceGroup.files)
            ) {
              for (const file of referenceGroup.files) {
                const fileModified = getLastModified(file);
                if (
                  fileModified &&
                  (!newestFileModification ||
                    fileModified > newestFileModification)
                ) {
                  newestFileModification = fileModified;
                  newestFile = file;
                }
              }
            }
          }
        }

        if (
          newestFileModification &&
          newestFileModification > overviewLastModified
        ) {
          const timeDifferenceMs =
            newestFileModification.getTime() - overviewLastModified.getTime();

          // Ignore differences less than 5 seconds (formatting/build tool delays)
          if (timeDifferenceMs < 5000) {
            continue;
          }

          const hoursSinceUpdate = Math.floor(
            timeDifferenceMs / (1000 * 60 * 60),
          );

          let timeMessage: string;
          if (hoursSinceUpdate < 24) {
            if (hoursSinceUpdate === 0) {
              const minutesSinceUpdate = Math.floor(
                (newestFileModification.getTime() -
                  overviewLastModified.getTime()) /
                  (1000 * 60),
              );
              if (minutesSinceUpdate <= 1) {
                timeMessage = "was modified just after";
              } else {
                timeMessage = `was modified ${minutesSinceUpdate} minutes after`;
              }
            } else if (hoursSinceUpdate === 1) {
              timeMessage = "has not been updated for 1 hour since";
            } else {
              timeMessage = `has not been updated for ${hoursSinceUpdate} hours since`;
            }
          } else {
            const daysSinceUpdate = Math.floor(hoursSinceUpdate / 24);
            if (daysSinceUpdate === 1) {
              timeMessage = "has not been updated for 1 day since";
            } else {
              timeMessage = `has not been updated for ${daysSinceUpdate} days since`;
            }
          }

          violations.push({
            ruleId: this.id,
            severity: this.severity,
            file: view.overviewPath,
            message: `Overview "${view.overviewPath}" ${timeMessage} "${newestFile}" changed`,
            impact: this.impact,
            fixable: this.fixable,
          });
        }
      }

      // Check notes with file references
      for (const noteWithPath of notes) {
        if (
          !noteWithPath.note.anchors ||
          noteWithPath.note.anchors.length === 0
        )
          continue;

        // Get the note's modification time from the path
        const noteRelativePath = noteWithPath.path;
        const noteLastModified = getLastModified(noteRelativePath);

        if (!noteLastModified) continue;

        let newestFileModification: Date | null = null;
        let newestFile: string | null = null;

        for (const anchorPath of noteWithPath.note.anchors) {
          const fileModified = getLastModified(anchorPath);
          if (
            fileModified &&
            (!newestFileModification || fileModified > newestFileModification)
          ) {
            newestFileModification = fileModified;
            newestFile = anchorPath;
          }
        }

        if (
          newestFileModification &&
          newestFileModification > noteLastModified
        ) {
          const timeDifferenceMs =
            newestFileModification.getTime() - noteLastModified.getTime();

          // Ignore differences less than 5 seconds (formatting/build tool delays)
          if (timeDifferenceMs < 5000) {
            continue;
          }

          const hoursSinceUpdate = Math.floor(
            timeDifferenceMs / (1000 * 60 * 60),
          );

          let timeMessage: string;
          if (hoursSinceUpdate < 24) {
            if (hoursSinceUpdate === 0) {
              const minutesSinceUpdate = Math.floor(
                (newestFileModification.getTime() -
                  noteLastModified.getTime()) /
                  (1000 * 60),
              );
              if (minutesSinceUpdate <= 1) {
                timeMessage = "was modified just after";
              } else {
                timeMessage = `was modified ${minutesSinceUpdate} minutes after`;
              }
            } else if (hoursSinceUpdate === 1) {
              timeMessage = "has not been updated for 1 hour since";
            } else {
              timeMessage = `has not been updated for ${hoursSinceUpdate} hours since`;
            }
          } else {
            const daysSinceUpdate = Math.floor(hoursSinceUpdate / 24);
            if (daysSinceUpdate === 1) {
              timeMessage = "has not been updated for 1 day since";
            } else {
              timeMessage = `has not been updated for ${daysSinceUpdate} days since`;
            }
          }

          violations.push({
            ruleId: this.id,
            severity: this.severity,
            file: `notes/${noteWithPath.note.id}.json`,
            message: `Note "${noteWithPath.note.id}" ${timeMessage} "${newestFile}" changed`,
            impact: this.impact,
            fixable: this.fixable,
          });
        }
      }
    } catch (error) {
      // If git is not available or other errors, skip this rule
      console.warn("Stale context rule skipped:", error);
    }

    return violations;
  },
};
