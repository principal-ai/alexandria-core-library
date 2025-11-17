import {
  LibraryRule,
  LibraryRuleViolation,
  LibraryRuleContext,
} from "../types";
import { MinimumReferencesOptions } from "../../config/types";

export const minimumReferences: LibraryRule = {
  id: "minimum-references",
  name: "Minimum References",
  severity: "warning",
  category: "quality",
  description:
    "Ensures CodebaseViews have a minimum number of file references to prevent orphaned documentation",
  impact:
    "Views with too few file references may not provide enough context for AI agents to understand the codebase",
  fixable: false,
  enabled: true,
  options: {
    minFiles: 3,
    excludeCategories: ["planning", "meta"],
    excludeViews: [],
  },

  async check(context: LibraryRuleContext): Promise<LibraryRuleViolation[]> {
    const violations: LibraryRuleViolation[] = [];
    const { views, config } = context;

    // Get options from config
    const ruleConfig = config?.context?.rules?.find(
      (r) => r.id === "minimum-references",
    );
    const options = {
      ...this.options,
      ...(ruleConfig?.options as MinimumReferencesOptions | undefined),
    } as Required<MinimumReferencesOptions>;

    // Check each view
    for (const view of views) {
      // Check if view is excluded by category
      if (
        view.category &&
        options.excludeCategories.includes(view.category)
      ) {
        continue;
      }

      // Check if view is excluded by name
      if (options.excludeViews.includes(view.name)) {
        continue;
      }

      // Count total files in all reference groups
      let totalFiles = 0;
      if (view.referenceGroups) {
        for (const groupName in view.referenceGroups) {
          const referenceGroup = view.referenceGroups[groupName];
          // Check if it's a file reference group (has 'files' property)
          if (
            typeof referenceGroup === "object" &&
            referenceGroup !== null &&
            "files" in referenceGroup &&
            Array.isArray(referenceGroup.files)
          ) {
            totalFiles += referenceGroup.files.length;
          }
        }
      }

      // Check if view has enough file references
      if (totalFiles < options.minFiles) {
        const viewFile = `views/${view.name}.json`;

        violations.push({
          ruleId: this.id,
          severity: this.severity,
          file: viewFile,
          message: `View "${view.name}" has only ${totalFiles} file reference${totalFiles === 1 ? "" : "s"}, below minimum of ${options.minFiles}`,
          impact: this.impact,
          fixable: this.fixable,
        });
      }
    }

    return violations;
  },
};
