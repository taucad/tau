# @taucad/fs-client

Client-side filesystem facades for Tau: `FileContentService`, `FileTreeService`, `WorkerChangeChannel`, path resolution, and related helpers.

Depends on `@taucad/filesystem` for core types and primitives such as `BoundedFileCache` and `FileTreeNode`. Change detection uses authority events plus the file-tree polling fallback; there is no separate native-observer branch.

## Entry points

Import from subpaths (no package root barrel), for example:

```typescript
import { FileContentService } from '@taucad/fs-client/file-content-service';
import { FileTreeService } from '@taucad/fs-client/file-tree-service';
```

See `package.json` `exports` for the full list.
