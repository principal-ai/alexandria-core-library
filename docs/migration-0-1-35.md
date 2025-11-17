# Migration Guide: v0.1.35

## Breaking Changes: Node Adapter Imports

Version 0.1.35 introduces a more platform-agnostic package structure by separating Node.js-specific adapters into a dedicated entry point.

### What Changed

**Before (v0.1.34 and earlier):**
```typescript
import {
  MemoryPalace,
  NodeFileSystemAdapter,
  NodeGlobAdapter
} from "@principal-ai/alexandria-core-library";
```

**After (v0.1.35):**
```typescript
import { MemoryPalace } from "@principal-ai/alexandria-core-library";
import { NodeFileSystemAdapter, NodeGlobAdapter } from "@principal-ai/alexandria-core-library/node";
```

### Why This Change

1. **Platform Agnostic**: The main entry point no longer requires Node.js-specific dependencies
2. **Optional Dependencies**: Users who don't need Node adapters won't require `globby` to be installed
3. **Better Tree-shaking**: Bundlers can more easily exclude unused platform-specific code
4. **Clearer Separation**: Adapter implementations are explicitly separated by platform

### Migration Steps

1. **Update your imports**: Change any imports of `NodeFileSystemAdapter` or `NodeGlobAdapter` to use the `/node` entry point
2. **Install globby as peer dependency** (if using Node adapters):
   ```bash
   npm install globby@^14.0.0
   # or
   yarn add globby@^14.0.0
   # or
   bun add globby@^14.0.0
   ```

### What's Not Affected

The following imports remain unchanged:
- `MemoryPalace`
- `InMemoryFileSystemAdapter` (still in main entry point)
- All type exports
- All configuration and rule exports
- Project management exports

### Package Exports

The package now provides two entry points:

```json
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./node": {
    "types": "./dist/node.d.ts",
    "import": "./dist/node.js"
  }
}
```

### Peer Dependencies

`globby` is now an optional peer dependency:

```json
{
  "peerDependencies": {
    "globby": "^14.0.0"
  },
  "peerDependenciesMeta": {
    "globby": {
      "optional": true
    }
  }
}
```

You only need to install it if you're using the `/node` entry point.

## Need Help?

If you encounter any issues during migration, please:
1. Check that you've updated all Node adapter imports to use `/node`
2. Ensure `globby` is installed if you're using Node adapters
3. Open an issue on our GitHub repository if problems persist
