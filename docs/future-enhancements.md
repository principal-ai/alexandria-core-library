# Future Enhancements

This document captures ideas for improving the Alexandria core library and documentation system.

## Recently Completed (2025-10-10)

### Rules Engine Enhancements

✅ **Implemented**: Adapter pattern for filesystem operations and new codebase-coverage rule

- Added `FileSystemAdapter` to `LibraryRuleContext` for testable filesystem operations
- Refactored `orphaned-references` and `stale-references` to use adapter pattern
- Implemented `codebase-coverage` rule for tracking documentation coverage
- Comprehensive test suites added for all rule implementations (73.50% overall coverage)
- Improved maintainability and testability of rules engine

## Documentation Organization

### Folder-Based Categories

Currently, CodebaseViews use a `category` field that must be manually set. We could automatically derive categories from folder structure to reduce maintenance overhead:

```
docs/
├── architecture/     → category: "architecture"
├── guides/          → category: "guides"
├── api/             → category: "api"
├── tutorials/       → category: "tutorials"
└── reference/       → category: "reference"
```

**Benefits:**

- Automatic category assignment based on file location
- Easier to maintain and organize documentation
- Natural grouping that matches filesystem structure
- Reduces manual configuration in CodebaseViews

**Implementation Ideas:**

- New Alexandria rule: `folder-category-mapping`
- Configuration in `.alexandriarc.json`:
  ```json
  {
    "rules": {
      "folder-category-mapping": {
        "enabled": true,
        "mappings": {
          "docs/architecture/": "architecture",
          "docs/guides/": "guides",
          "docs/api/": "api-reference"
        },
        "defaultCategory": "other"
      }
    }
  }
  ```

### Enhanced Rule System

**New Rule: `folder-category-consistency`**

- Validates that CodebaseView categories match their folder location
- Auto-fixes by updating category to match folder structure
- Warns when documents are in unexpected locations

**New Rule: `minimum-references`** ✅ **Implemented** (2025-11-16)

- ✅ Ensures CodebaseViews have a minimum number of file references
- ✅ Configurable threshold (e.g., at least 3 files per view)
- ✅ Prevents "orphaned" documentation that doesn't connect to code
- ✅ Supports exclusions by category and view name
- Configuration example:
  ```json
  {
    "minimum-references": {
      "enabled": true,
      "minFiles": 3,
      "excludeCategories": ["planning", "meta"],
      "excludeViews": []
    }
  }
  ```

**New Rule: `codebase-coverage`** ✅ **Implemented** (2025-10-10)

- ✅ Validates that important directories have associated documentation
- ✅ Ensures core source directories are covered by CodebaseViews
- ✅ Configurable coverage requirements per directory type
- ✅ Supports include/exclude patterns for file filtering
- ✅ Optional per-directory coverage reporting
- Configuration example:
  ```json
  {
    "codebase-coverage": {
      "enabled": true,
      "minimumCoverage": 70,
      "includePatterns": ["**/*.ts"],
      "excludePatterns": ["**/*.test.ts"],
      "reportByDirectory": true,
      "minimumDirectoryCoverage": 60
    }
  }
  ```
- See [available-rules.md](./available-rules.md#codebase-coverage) for full documentation

## Path Management Enhancements

### Multi-Repository Path Caching

- Cache validated paths across repository sessions
- Reduce filesystem calls for frequently accessed repositories
- Implement cache invalidation on directory structure changes

### Cross-Repository Support

- Link documentation across repositories
- Support for local, Git, and URL-based repository references
- Content resolution strategies (manual pull, auto-sync, reference-only)

## Developer Experience

### Interactive Documentation Setup

- CLI wizard for initial documentation organization
- Suggested folder structure based on project type
- Automated CodebaseView generation from existing docs

### Documentation Health Metrics

- Track documentation coverage per code directory
- Identify code areas lacking documentation
- Generate reports on documentation freshness

## Quality Assurance

### Enhanced Validation Rules

**New Rule: `documentation-completeness`**

Validates that documentation has all essential components for effective AI agent usage:

- **Required metadata fields**: Ensures CodebaseViews have description, purpose, audience
- **Content structure**: Checks for key sections (overview, usage examples, related concepts)
- **Cross-references**: Validates that related views/concepts are properly linked
- **Public API coverage**: Ensures exported functions/classes have documentation
- **Essential repository docs**: Checks for README, CONTRIBUTING, LICENSE, etc.
- Configuration example:
  ```json
  {
    "documentation-completeness": {
      "enabled": true,
      "requiredViewFields": ["description", "purpose"],
      "requiredSections": ["## Overview", "## Usage"],
      "requireExamples": true,
      "requiredRepoFiles": ["README.md", "LICENSE"],
      "checkPublicAPIs": true
    }
  }
  ```

Note: `stale-reference-detection` already exists as the `stale-references` rule.

### Integration Improvements

- IDE extensions for real-time CodebaseView validation
- GitHub bot for automatic documentation PR reviews
- Slack/Discord notifications for documentation quality issues

## Implementation Priority

1. **High Priority**: Folder-based categories (immediate developer productivity)
2. **Medium Priority**: Enhanced rule system and validation
3. **Low Priority**: Remote repository support and advanced metrics

## Contributing

When implementing these enhancements:

- Maintain backward compatibility with existing CodebaseViews
- Add comprehensive tests for new rules and features
- Update documentation and examples
- Consider performance impact on large repositories

---

_Last reviewed: 2025-12-04 - Updated to reflect removal of task management, anchored notes, and palace rooms._
