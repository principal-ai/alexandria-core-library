# Rules Engine Guide

## Overview

The Alexandria core library includes a `LibraryRulesEngine` that validates documentation organization, file references, and naming conventions. It helps maintain consistent, well-structured documentation that both humans and AI can navigate effectively.

## Basic Usage

```typescript
import { LibraryRulesEngine } from "@a24z/core-library";
import { NodeFileSystemAdapter } from "@a24z/core-library";
import { BasicGlobAdapter } from "@a24z/core-library";

// Initialize the rules engine - both adapters are required
const fsAdapter = new NodeFileSystemAdapter();
const globAdapter = new BasicGlobAdapter();
const rulesEngine = new LibraryRulesEngine(fsAdapter, globAdapter);

// Or with a custom glob adapter (e.g., NodeGlobAdapter for full glob support)
// Note: NodeGlobAdapter requires 'globby' to be installed
// import { NodeGlobAdapter } from '@a24z/core-library';
// const globAdapter = new NodeGlobAdapter();
// const rulesEngine = new LibraryRulesEngine(fsAdapter, globAdapter);

// Run lint with all enabled rules
const results = await rulesEngine.lint("/path/to/repo");

// Run lint with specific rules
const docOrgResults = await rulesEngine.lint("/path/to/repo", {
  enabledRules: ["document-organization"],
});

// Check results
if (results.violations.length > 0) {
  console.log(
    `Found ${results.errorCount} errors, ${results.warningCount} warnings`,
  );
  results.violations.forEach((v) => {
    console.log(`[${v.severity}] ${v.file}: ${v.message}`);
  });
}
```

## How It Works

The rules engine:

1. Reads configuration from `.alexandriarc.json` (if present)
2. Scans the repository based on rule requirements
3. Validates against rule criteria
4. Returns detailed violation information
5. Suggests fixes where applicable

## Configuration

Rules are configured in `.alexandriarc.json`:

```json
{
  "context": {
    "rules": [
      {
        "id": "document-organization",
        "severity": "error",
        "enabled": true,
        "options": {
          "documentFolders": ["docs"],
          "rootExceptions": ["README.md", "LICENSE"]
        }
      }
    ]
  }
}
```

## Severity Levels

- **error** - Critical issues that must be fixed
- **warning** - Important issues that should be addressed
- **info** - Suggestions for improvement

## Available Rules

The library includes several built-in rules:

- **document-organization** - Ensures docs are in proper folders
- **filename-convention** - Enforces consistent file naming
- **require-references** - Ensures docs have CodebaseView associations
- **stale-references** - Detects outdated file references
- **codebase-coverage** - Ensures minimum percentage of code files are documented

See [Available Rules](available-rules.md) for detailed documentation of each rule.

## Integration

### With MemoryPalace

```typescript
const fsAdapter = new NodeFileSystemAdapter();
const globAdapter = new BasicGlobAdapter();
const palace = new MemoryPalace(repoPath, fsAdapter);
const rulesEngine = new LibraryRulesEngine(fsAdapter, globAdapter);

// Validate before saving views
const results = await rulesEngine.lint(repoPath, {
  enabledRules: ["require-references"],
});
if (results.violations.length > 0) {
  console.warn("Documentation missing CodebaseView references");
}
```

### In CI/CD

```typescript
const fsAdapter = new NodeFileSystemAdapter();
const globAdapter = new BasicGlobAdapter();
const rulesEngine = new LibraryRulesEngine(fsAdapter, globAdapter);

// Fail build on rule violations
const results = await rulesEngine.lint();
const hasErrors = results.errorCount > 0;

if (hasErrors) {
  process.exit(1);
}
```

## Implementation

- **Source**: [src/rules/](src/rules/)
- **Engine**: [src/rules/engine.ts](src/rules/engine.ts)
- **Rule Implementations**: [src/rules/implementations/](src/rules/implementations/)

## Related Documentation

- [Available Rules](available-rules.md) - Detailed rule documentation
- [Configuration](adapter-architecture.md) - Configuration options

---

_Last reviewed: 2025-09-24 - Document confirmed to be up-to-date with current implementation._
