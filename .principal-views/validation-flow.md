# Validation Rules Flow

## What it does

The validation rules system enforces quality standards on codebase documentation. It scans repositories, checks views against configurable rules, and reports violations to help maintain documentation quality.

## Problem it solves

Documentation can become stale, incomplete, or inconsistent over time. Automated validation catches issues early:
- Views with missing or outdated code references
- Insufficient documentation coverage
- Orphaned references to deleted files
- Stale references that no longer match actual code

## Available rules

- **requireReferences**: Ensures views include code references
- **orphanedReferences**: Detects references to non-existent files
- **staleReferences**: Finds references to files that changed significantly
- **minimumReferences**: Enforces minimum reference count per view
- **codebaseCoverage**: Checks that important files are documented

## Design choices

- **LibraryRulesEngine**: Orchestrates rule execution and aggregates results
- **Configuration-driven**: AlexandriaConfig defines which rules run and their thresholds
- **GlobAdapter integration**: Rules scan filesystem to validate references
- **Structured violations**: Each violation includes severity, location, and fix suggestions
- **Extensible**: New rules can be added by implementing the rule interface

## Common workflow

1. User runs validation on a repository
2. LibraryRulesEngine loads configuration
3. Engine iterates through enabled rules
4. Each rule checks views and produces violations
5. Results aggregated into LibraryLintResult
6. Violations presented to user with fix suggestions

## Error scenarios

- **Orphaned references**: Warn user, suggest removing invalid references
- **Stale references**: Suggest reviewing and updating documentation
- **Low coverage**: Identify undocumented areas for improvement
