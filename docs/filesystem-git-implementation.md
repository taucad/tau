# Filesystem and Git Integration Implementation

## Overview

This document describes the XState-based filesystem and Git integration system implemented for the Tau CAD application. The architecture provides a robust, type-safe approach to managing file operations, version control, and build state coordination.

## Architecture

### Core Components

#### 1. Storage Layer (`apps/ui/app/db/storage.ts`)
- **LightningFS**: Browser-based filesystem using IndexedDB
- **IndexedDB Storage**: Build metadata and domain data storage
- Each build gets its own LightningFS database via `fs.init(buildId)`

#### 2. State Machines

**Storage Machine** (`apps/ui/app/machines/storage.machine.ts`)
- Purpose: Interface to IndexedDB for build metadata
- Does NOT handle file storage (that's LightningFS)
- Operations: CRUD operations for builds

**Filesystem Machine** (`apps/ui/app/machines/filesystem.machine.ts`)
- Purpose: Virtual filesystem per build using LightningFS
- Direct LightningFS integration
- Git status tracking via isomorphic-git
- Events: `createFile`, `updateFile`, `deleteFile`, `setFiles`
- Emits: `fileCreated`, `fileUpdated`, `fileDeleted`, `filesChanged`, `statusRefreshed`

**Git Machine** (`apps/ui/app/machines/git.machine.ts`)
- Purpose: Orchestrate Git operations using isomorphic-git
- States: disconnected → authenticating → selectingRepo → cloning → ready → staging → committing → pushing
- OAuth integration via Better Auth
- Operations: clone, stage, unstage, commit, push, pull

**Build Machine** (`apps/ui/app/machines/build.machine.ts`)
- Purpose: Replace use-build.tsx and use-builds.ts hooks
- Spawns filesystem machine when build is loaded
- Coordinates storage operations
- Chat management integration

**File Explorer Machine** (`apps/ui/app/machines/file-explorer.machine.ts`)
- Purpose: UI state for file tree and open files
- Tracks dirty files from filesystem
- Displays Git status indicators
- Events: `updateDirtyFiles`, `updateGitStatuses`

### State Machine Interactions

```
build.machine
  ├─> spawns filesystem.machine (per build)
  │     └─> refreshes Git status via isomorphic-git
  │           └─> updates file-explorer.machine
  │
  └─> communicates with storage.machine for metadata

git.machine
  ├─> uses LightningFS for Git operations
  ├─> listens to filesystem changes
  └─> emits status updates to file-explorer

file-explorer.machine
  ├─> receives dirty file updates from filesystem
  ├─> receives Git status from git.machine
  └─> displays indicators in UI

cad.machine
  └─> receives code updates when active file changes
```

## Key Features

### 1. Build Isolation
Each build has its own isolated filesystem:
```typescript
// Build A
fs.init('build_abc123', { wipe: false });

// Build B  
fs.init('build_xyz789', { wipe: false });
```

This enables:
- Hot-swapping between builds without conflicts
- Persistent filesystem state across sessions
- Independent Git repositories per build

### 2. Git Status Tracking
The filesystem machine automatically refreshes Git status after file operations:
```typescript
// File updated
filesystem.send({ type: 'updateFile', path: 'main.ts', content: '...' });
  ↓
// Filesystem writes to LightningFS
  ↓
// Calls git.status() to check file status
  ↓
// Emits statusRefreshed event
  ↓
// UI components receive updated status
```

### 3. UI Indicators
- **File Tree**: Yellow dot indicator for files with Git changes
- **Editor Tabs**: Yellow dot for unsaved or uncommitted changes
- **+ Button**: Create new files in the file tree

### 4. Git Workflow
Complete Git workflow with visual feedback:
1. Connect to GitHub (OAuth via Better Auth)
2. Select or create repository
3. View unstaged/staged changes
4. Stage/unstage files
5. Write commit message (with AI assistance)
6. Commit and push

## API Integration

### Commit Message Generation
New endpoint added to chat controller:
```typescript
// Model ID: 'commit-name-generator'
POST /v1/chat
{
  "messages": [{
    "role": "user",
    "content": "Generate a commit message for these changes...",
    "model": "commit-name-generator"
  }]
}
```

Uses GPT-4o-mini to generate conventional commit messages following best practices.

## Better Auth GitHub Integration

### OAuth Scopes
- **Initial login**: `read:user`, `user:email`
- **Repository access**: `repo` (full private repo access)

### Requesting Additional Scopes
```typescript
import { requestGitHubRepoAccess } from '#lib/git-auth.js';

// When user clicks "Connect to GitHub"
await requestGitHubRepoAccess();
```

This triggers OAuth flow to request `repo` scope for repository read/write access.

## Type System

New types added to `@taucad/types` package:

**Filesystem Types** (`libs/types/src/types/filesystem.types.ts`)
- `FileStatus`: 'clean' | 'modified' | 'added' | 'deleted' | 'untracked'
- `FileSystemItem`: Virtual filesystem file representation
- `FilesystemEventType`: Type-safe event names

**Git Types** (`libs/types/src/types/git.types.ts`)
- `GitRepository`: Repository metadata
- `GitFileStatus`: File status in Git
- `GitCommit`: Commit information
- `GitProvider`: 'github' | 'bitbucket' | 'gitlab'

## Usage Examples

### Using the Filesystem Machine
```typescript
import { filesystemMachine } from '#machines/filesystem.machine.js';

// Initialize for a build
filesystem.send({ type: 'setFiles', buildId, files });

// Create a new file
filesystem.send({ type: 'createFile', path: 'utils.ts', content: '...' });

// Listen to events
filesystem.on('fileCreated', (event) => {
  console.log('File created:', event.path);
});
```

### Using the Git Machine
```typescript
import { gitMachine } from '#machines/git.machine.js';

// Connect to GitHub
git.send({ type: 'connect', buildId });
git.send({ type: 'authenticate', accessToken, username, email });

// Select repository
git.send({ type: 'selectRepository', repository });

// Stage files
git.send({ type: 'stageFile', path: 'main.ts' });

// Commit
git.send({ type: 'commit', message: 'feat: add new feature' });

// Push
git.send({ type: 'push' });
```

## Migration Notes

### From Hooks to Machines

The build.machine replaces:
- `use-build.tsx` - Now a facade that wraps build.machine
- `use-builds.ts` - Build listing operations
- `build-mutations.ts` - Mutation operations now in machine actors

Existing hooks still work but delegate to the machines internally for gradual migration.

### File Change Detection

Previously: Manual dirty tracking in component state
Now: Automatic via filesystem.machine and Git status API

## Testing

To test the implementation:

1. **Type Check**:
```bash
pnpm nx typecheck ui
pnpm nx typecheck api
```

2. **Unit Tests** (to be added):
```bash
pnpm nx test ui
pnpm nx test api
```

## Future Enhancements

1. **Multi-Provider Support**
   - Add Bitbucket and GitLab OAuth flows
   - Extend git.machine with provider-specific adapters

2. **Advanced Git Features**
   - Branch management UI
   - Merge conflict resolution
   - Pull request creation
   - Commit history viewer

3. **Collaboration**
   - Real-time file status updates
   - Conflict indicators
   - Multi-user editing awareness

4. **Performance Optimizations**
   - Lazy load Git status (only when needed)
   - Debounce status refresh
   - Cache file diffs

## Troubleshooting

### Common Issues

**Git status not updating**
- Ensure filesystem.machine is initialized with `setFiles`
- Check that git.init was called successfully
- Verify LightningFS database exists in IndexedDB

**OAuth flow fails**
- Verify GitHub OAuth app has correct callback URL
- Check that repo scope is configured in backend
- Ensure Better Auth session is valid

**Files not persisting**
- Check LightningFS initialization: `fs.init(buildId)`
- Verify IndexedDB quota not exceeded
- Check browser console for filesystem errors

## Implementation Checklist

- ✅ LightningFS singleton with per-build databases
- ✅ Storage machine for build metadata
- ✅ Filesystem machine with Git status integration
- ✅ Git machine for version control operations
- ✅ Build machine replacing hooks
- ✅ File explorer machine with dirty/Git tracking
- ✅ UI indicators for file status
- ✅ + button for file creation
- ✅ Better Auth GitHub repo scope
- ✅ Git connector Sheet component
- ✅ Commit message AI generation
- ✅ Type system updates

## Resources

- [isomorphic-git Documentation](https://isomorphic-git.org/)
- [LightningFS API](https://github.com/isomorphic-git/lightning-fs)
- [Better Auth OAuth](https://www.better-auth.com/docs/concepts/oauth)
- [XState v5 Documentation](https://stately.ai/docs/xstate)


