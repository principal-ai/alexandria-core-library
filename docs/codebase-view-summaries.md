# CodebaseView Summaries

## Overview

CodebaseView summaries provide lightweight representations of full CodebaseViews, containing just the essential metadata without the detailed file lists. This enables efficient listing, caching, and transmission of view information.

## The CodebaseViewSummary Interface

```typescript
export interface CodebaseViewSummary {
  id: string; // Unique identifier
  name: string; // Display name
  description: string; // Brief description
  referenceGroupCount: number; // Number of reference groups
  gridSize: [number, number]; // [rows, columns]
  overviewPath: string; // Path to documentation
  category: string; // UI grouping category
  displayOrder: number; // Sort order in category
}
```

## Extraction Functions

The library provides two functions for creating summaries:

### Single View Extraction

```typescript
import { extractCodebaseViewSummary } from "@principal-ai/alexandria-core-library";

const view: CodebaseView = loadView();
const summary = extractCodebaseViewSummary(view);
```

### Batch Extraction

```typescript
import { extractCodebaseViewSummaries } from "@principal-ai/alexandria-core-library";

const views: CodebaseView[] = loadAllViews();
const summaries = extractCodebaseViewSummaries(views);
```

## How It Works

The extraction process:

1. **Counts reference groups** - Total number of reference groups in the view
2. **Calculates grid dimensions** - Finds maximum row and column coordinates
3. **Maps metadata** - Copies essential fields with sensible defaults
4. **Omits file lists** - Excludes the heavy file reference data

## Use Cases

### View Listings

Display all available views without loading full file references:

```typescript
const summaries = views.map(extractCodebaseViewSummary);
// Show in UI with just name, description, and reference group count
```

### API Responses

Send lightweight metadata over the network:

```typescript
// Instead of sending full views (potentially MBs)
// Send just summaries (a few KBs)
return { views: extractCodebaseViewSummaries(fullViews) };
```

### Caching

Store summaries for quick access:

```typescript
// Cache summaries for fast retrieval
const cache = new Map<string, CodebaseViewSummary>();
views.forEach((view) => {
  cache.set(view.id, extractCodebaseViewSummary(view));
});
```

## Implementation

- **Source**: [src/pure-core/types/summary.ts](src/pure-core/types/summary.ts)
- **Related Types**: [src/pure-core/types/index.ts](src/pure-core/types/index.ts)

## Benefits

1. **Performance** - Summaries are ~100x smaller than full views
2. **Network Efficiency** - Reduced bandwidth for API calls
3. **Memory Usage** - Lower memory footprint for view lists
4. **Separation of Concerns** - Metadata separate from file references

---

_Last reviewed: 2025-09-25 - Document remains accurate; new PalaceRoom types added to index.ts are unrelated to view summaries._
