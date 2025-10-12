# CodebaseView: Connecting Documentation to Code

## What is a CodebaseView?

A CodebaseView is a structured way to connect documentation with the actual code files it describes. It creates explicit links between your markdown documentation and specific source files, ensuring that documentation stays relevant and AI agents understand exactly which code you're referring to.

## The Core Problem

When you write documentation like:

```markdown
The authentication system uses JWT tokens and middleware to protect routes.
```

Questions arise:

- Which files implement authentication?
- Where are the JWT utilities?
- Which middleware files are involved?
- If the code moves, how do we update the docs?

CodebaseView solves this by creating explicit file references that can be validated and maintained.

## How It Works

### 1. Documentation with Intent

Your markdown documentation describes concepts, architecture, and implementation details.

### 2. Explicit File References

CodebaseView stores which specific files are referenced:

```json
{
  "name": "Authentication System",
  "overviewPath": "docs/authentication.md",
  "referenceGroups": {
    "jwt": {
      "coordinates": [0, 0],
      "files": ["src/auth/jwt.ts", "src/auth/tokens.ts", "src/auth/refresh.ts"]
    },
    "middleware": {
      "coordinates": [0, 1],
      "files": ["src/middleware/auth.ts", "src/middleware/validate-token.ts"]
    },
    "config": {
      "coordinates": [0, 2],
      "files": ["src/config/auth.config.ts", "src/types/auth.types.ts"]
    }
  }
}
```

### 3. Validation

Alexandria can verify these references:

- ✅ All referenced files exist
- ✅ No duplicate file references
- ❌ Alert when files are deleted or moved
- ❌ Warn about stale references

## Key Benefits

### For Documentation

1. **Living Documentation**: Links between docs and code stay current
2. **Completeness Checking**: Know which code is documented
3. **Impact Analysis**: See which docs are affected by code changes
4. **Reference Validation**: Ensure documentation points to real files

### For AI Agents

1. **Precise Context**: AI knows exactly which files to examine
2. **Scoped Understanding**: Documentation is explicitly linked to implementation
3. **Reliable Navigation**: No guessing about file locations
4. **Traceable Answers**: AI can cite specific files when answering questions

### For Developers

1. **Find Implementation**: Jump from docs to code
2. **Understand Impact**: See what documentation covers your code
3. **Maintain Accuracy**: Get alerts when references break
4. **Review Coverage**: Identify undocumented code areas

## Structure of a CodebaseView

### Core Components

```typescript
interface CodebaseView {
  id: string; // Unique identifier
  name: string; // Human-readable name
  description: string; // What this view documents
  overviewPath: string; // Path to main documentation file
  category: string; // Grouping (e.g., 'guide', 'reference')
  displayOrder: number; // Sort order within category
  referenceGroups: Record<string, CodebaseViewFileCell>; // Named groups of files
  rows?: number; // Grid rows (optional)
  cols?: number; // Grid columns (optional)
}
```

### File Reference Groups

Each reference group contains an explicit list of related files:

```typescript
interface CodebaseViewFileCell {
  coordinates: [number, number]; // Position in grid [row, col]
  files: string[]; // Explicit file paths only
  priority?: number; // For conflict resolution
  links?: Record<string, string>; // Links to other views
}
```

### Optional Scope

You can scope a view to a specific directory:

```typescript
interface CodebaseViewScope {
  basePath?: string; // Focus on a subdirectory (e.g., 'src/frontend')
}
```

## Example: API Documentation

Given this API documentation:

```markdown
# User API

Our User API provides CRUD operations for user management.

## Endpoints

- GET /users - List all users
- POST /users - Create a user
- GET /users/:id - Get a specific user
- PUT /users/:id - Update a user
- DELETE /users/:id - Delete a user

## Implementation

The API uses Express routes with validation middleware and service layer separation.
```

The CodebaseView would be:

```json
{
  "id": "user-api",
  "name": "User API",
  "description": "CRUD operations for user management",
  "overviewPath": "docs/user-api.md",
  "category": "reference",
  "displayOrder": 1,
  "rows": 2,
  "cols": 3,
  "referenceGroups": {
    "routes": {
      "coordinates": [0, 0],
      "files": ["src/routes/users.ts", "src/routes/index.ts"]
    },
    "services": {
      "coordinates": [0, 1],
      "files": ["src/services/userService.ts", "src/services/userValidator.ts"]
    },
    "models": {
      "coordinates": [0, 2],
      "files": ["src/models/User.ts", "src/types/user.ts"]
    },
    "middleware": {
      "coordinates": [1, 0],
      "files": ["src/middleware/validation.ts", "src/middleware/auth.ts"]
    },
    "tests": {
      "coordinates": [1, 1],
      "files": ["src/routes/users.test.ts", "src/services/userService.test.ts"]
    },
    "config": {
      "coordinates": [1, 2],
      "files": ["src/config/database.ts", "src/config/api.ts"]
    }
  }
}
```

## Validation and Maintenance

### Automatic Validation

```bash
# Validate all views
alexandria validate-all

# Check specific view
alexandria validate user-api
```

### What Gets Validated

- ✅ All file paths exist
- ✅ No duplicate files across reference groups
- ✅ Grid coordinates are valid
- ✅ Documentation file exists
- ✅ Required fields are present

### Handling Changes

When files move or are deleted:

1. Validation fails with clear errors
2. Documentation authors are notified
3. References must be updated manually
4. History is maintained

## Creating CodebaseViews

### From Documentation

```bash
# Alexandria extracts references from your markdown
alexandria add-doc docs/authentication.md

# Creates: .alexandria/views/authentication.json
```

### What Gets Extracted

Alexandria looks for file references in your markdown:

- File paths in markdown links: `[JWT Implementation](src/auth/jwt.ts)`
- Code block file references: `` `src/config/auth.js` ``
- Inline code paths: `The middleware in src/middleware/auth.ts`
- File lists in documentation

### Manual Creation

You can also create views manually by:

1. Creating a JSON file in `.alexandria/views/`
2. Specifying exact file paths
3. Organizing them into logical reference groups
4. Setting grid coordinates

## Visualization: The Grid Layout

While the primary purpose is documentation-to-code linking, CodebaseViews organize files into a spatial grid:

### Visual Organization

```
┌─────────────┬─────────────┬─────────────┐
│   Routes    │   Services  │   Models    │
│  [0,0]      │   [0,1]     │   [0,2]     │
├─────────────┼─────────────┼─────────────┤
│ Middleware  │   Tests     │   Config    │
│  [1,0]      │   [1,1]     │   [1,2]     │
└─────────────┴─────────────┴─────────────┘
```

### Benefits of Spatial Organization

- **Mental Models**: Developers can "see" where code lives
- **Consistent Structure**: Similar projects use similar layouts
- **Navigation**: Tools can provide spatial navigation
- **Memory**: Spatial memory helps recall file locations

## Best Practices

1. **Be Explicit**: List exact files, don't rely on patterns
2. **Group Logically**: Each reference group should represent a cohesive unit
3. **Keep It Simple**: 2x3 or 3x3 grids work well
4. **Validate Often**: Run validation in CI/CD
5. **Update Promptly**: Fix broken references immediately
6. **Document Purpose**: Use clear reference group names and descriptions

## Limitations

### No Glob Patterns in Reference Groups

Reference groups require explicit file lists. You cannot use patterns like `src/**/*.ts`. This ensures:

- Predictable behavior
- Clear validation
- No ambiguity about which files are included

### Manual Updates Required

When files are renamed or moved, you must manually update the view. This is intentional to ensure documentation authors are aware of structural changes.

### One File Per Reference Group

Each file should only appear in one reference group within a view to avoid confusion about its primary purpose.

## Integration Points

### Pre-commit Hooks

```bash
# Validate views before committing
alexandria validate-all --errors-only
```

### CI/CD Pipeline

```yaml
- name: Validate Documentation References
  run: alexandria validate-all
```

### Editor Integration

Future integrations could provide:

- Jump from documentation to referenced files
- See which docs reference current file
- Get warnings about broken references

## Summary

CodebaseViews are fundamentally about creating maintainable, validated links between documentation and code through explicit file references. They ensure that:

1. Documentation accurately references real files
2. AI agents have precise context about which code implements what
3. Changes to code structure are detected through validation
4. Developers can navigate between concepts and implementation

The spatial grid layout provides an additional layer of organization, making it easier to visualize and remember where different parts of your codebase live.

---

_Last reviewed: 2025-10-12 - Verified codebase view concepts remain consistent with latest MemoryPalace API._
