# @taucad/react

React hooks for `@taucad/runtime`.

## `useRuntime`

`useRuntime` is the ergonomic React happy path for runtime clients. It owns the client lifecycle, connects through the supplied transport, opens the source file, applies parameter updates, exposes resolved parameter schemas, returns geometry state, and provides export helpers.

```typescript
import { useRuntime } from '@taucad/react';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { webWorkerTransport } from '@taucad/runtime/transport/web';
import type { runtime } from './runtime.worker';

const result = useRuntime<typeof runtime>({
  clientOptions: {
    transport: webWorkerTransport({
      createWorker: () =>
        new Worker(new URL('./runtime.worker.ts', import.meta.url), {
          type: 'module',
        }),
      fileSystem: fromMemoryFs({ '/main.ts': source }),
    }),
  },
  code: source,
  file: '/main.ts',
  parameters,
});
```

Framework-specific worker or process setup stays outside this package. React components supply a runtime transport; the worker or host owns executable runtime definitions.
