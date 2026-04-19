# Registry Types

## What it does

The registry type system defines how repositories are tracked, stored, and enriched with metadata. It provides a structured type hierarchy for representing local and remote repository information.

## Problem it solves

Repository management requires tracking both local filesystem information and remote GitHub metadata. The type system ensures type safety while allowing optional enrichment with external data like stars, topics, and commit history.

## Type hierarchy

- **ProjectRegistryData**: Serialization format containing array of entries
- **AlexandriaEntry**: Local repository with validated filesystem path
- **AlexandriaRepository**: Base repository with views, GitHub data, and metadata
- **GithubRepository**: GitHub-specific metadata (owner, stars, topics, etc.)
- **CodebaseViewSummary**: Lightweight view information for listings
- **ValidatedRepositoryPath**: Branded type ensuring path validity

## Design choices

- **Type extension**: AlexandriaEntry extends AlexandriaRepository to add local path
- **Branded types**: ValidatedRepositoryPath prevents using unvalidated strings
- **Optional GitHub data**: Repositories can exist without GitHub integration
- **View summaries**: Lightweight summaries avoid loading full view data
- **Timestamps**: registeredAt and lastChecked track repository lifecycle

## Common operations

- Register project: Creates AlexandriaEntry with validated path
- List projects: Returns array of AlexandriaEntry objects
- Get project: Retrieves single entry by name
- Update project: Modifies metadata like GitHub data or view count
- Remove project: Deletes entry from registry

## Persistence

ProjectRegistryData is serialized to ~/.alexandria/projects.json using FileSystemAdapter. The validator ensures data integrity on read/write.
