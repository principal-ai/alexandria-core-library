# Unused API Audit — electron-app integration

Audit date: 2026-04-22

The electron-app only uses `AlexandriaOutpostManager`, `MemoryPalace`, `NodeFileSystemAdapter`, `NodeGlobAdapter`, and a small set of types (`AlexandriaEntry`, `Workspace`, `WorkspaceMembership`, `CodebaseView`, `CodebaseViewSummary`, `AlexandriaRepositoryRegistry`, `GithubRepository`, `ValidatedRepositoryPath`).

## Already removed

- **Reading record system** — `ReadingRecordManager`, `MemoryReadingRecordAdapter`, `LocalStorageReadingRecordAdapter`, all storage types (`VisitQuery`, `BookmarkQuery`, `AlexandriaVisit`, `AlexandriaBookmark`, etc.)
- **Tag system** — `TagStore`, `DocumentTags`, `TagDefinition`, `TagAssignmentResult`, `TagValidationResult`, tag methods on `MemoryPalace`

## Candidates for removal

Before removing any of these, verify no other consumer (web app, CLI, MCP server) is using them.

### High confidence — likely safe to remove

| Export | File | Notes |
|--------|------|-------|
| `ProjectRegistryStore` | `src/projects-core/ProjectRegistryStore.ts` | No usage found in electron-app |
| `WorkspaceManager` (class) | `src/projects-core/WorkspaceManager.ts` | Workspace *types* are used, the class is not |
| `OverviewPathAutoFix` | `src/pure-core/autofixes/OverviewPathAutoFix.ts` | No usage found |
| `hasAlexandriaWorkflow()` | `src/projects-core/workflow-utils.ts` | No usage found |
| `InMemoryFileSystemAdapter` | `src/test-adapters/InMemoryFileSystemAdapter.ts` | Test-only adapter, should not be part of public API |

### Medium confidence — need to check other consumers

| Export | File | Notes |
|--------|------|-------|
| `LibraryRulesEngine` + all rule functions | `src/rules/` | Used by CLI/linting tooling — check if a separate CLI package depends on this |
| `ConfigValidator`, `ConfigLoader` + config types | `src/config/` | Same as above — likely CLI-only |
| Location-bound file utilities (`LOCATION_BOUND_FILES`, `isLocationBound`, etc.) | `src/rules/utils/location-bound-files.ts` | Used by rules engine internally |
| Pattern utilities (`matchesPatterns`, `getExcludePatterns`, `filterByExcludePatterns`) | `src/rules/utils/patterns.ts` | Used by rules engine internally |

### Low confidence — keep for now, revisit

| Export | File | Notes |
|--------|------|-------|
| `DrawingStore`, `DrawingMetadata`, `ExcalidrawData` | `src/pure-core/stores/DrawingStore.ts`, `src/pure-core/types/drawing.ts` | Used internally by `MemoryPalace`. Exporting the store directly may be intentional for advanced consumers |
| `CodebaseViewsStore`, `generateViewIdFromName()` | `src/pure-core/stores/CodebaseViewsStore.ts` | Same — internal to `MemoryPalace`, exported for direct access |
| PURL utilities (`createPurl`, `parsePurl`, `PurlBuilders`, etc.) | `src/pure-core/utils/purl.ts` | Could be used by integrations or MCP server for canonical repo identification |
| Browser/GitHub adapters (`FileTreeFileSystemAdapter`, `FileTreeGlobAdapter`) | `src/filetree-adapters/` | May be used by the web app or MCP server |
| `ALEXANDRIA_DIRS`, `CONFIG_FILENAME` constants | `src/constants/paths.ts`, `src/config/schema.ts` | Low risk to keep, small surface area |

## Suggested next steps

1. Search the broader monorepo (MCP server, web app, any CLI packages) for imports of this library — same grep used for the electron-app audit.
2. For `LibraryRulesEngine` / `ConfigValidator` / `ConfigLoader`: if they are only used by a CLI that is being sunset or moved out, remove them here and inline what the CLI needs.
3. Consider splitting the library into two packages: a slim runtime core (what the electron-app actually needs) and a dev-tools package (rules engine, config validation, CLI utilities).
