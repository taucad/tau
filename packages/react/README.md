# @taucad/react

React hooks for `@taucad/runtime`.

## `useRuntime`

`useRuntime` opens a watched document for a source and follows one selected view. It owns the client and document lifecycle, applies committed parameter updates, exposes parameter schemas, and exports from the committed document.

```typescript
import { useRuntime } from '@taucad/react';
import { createWebWorkerClientOptions } from '@taucad/runtime/transport/web';
import type { runtime } from './runtime-definition';

const mainFile = 'main.ts';
const initialSource = 'export default () => makeCylinder(10, 24);';

const clientOptions = createWebWorkerClientOptions<typeof runtime>({
  createWorker: () =>
    new Worker(new URL('./runtime.worker.ts', import.meta.url), {
      type: 'module',
    }),
});

const { artifact, artifactHash, artifactStatus, status, exportModel } = useRuntime({
  clientOptions,
  source: { files: { [mainFile]: initialSource } },
  initialParameters: { height: 20 },
});

if (status === 'ready' && artifactStatus === 'current') {
  // Display the selected view's artifact with its rendering hash.
}
await exportModel('glb');
```

Declare stable `clientOptions` values or provider functions at module scope. Changing the identity of `clientOptions` tells `useRuntime` to tear down the current runtime client and connect a new one.

Framework-specific worker or process setup stays outside this package. React components supply a runtime transport; the worker or host owns executable runtime definitions.

`useRuntime` owns effective parameters. Bind form controls to `result.parameters`, call `result.setParameters(nextFormData)`, and use `result.resetParameters()` to return to runtime-discovered defaults.

`result.jsonSchema` is typed as `JSONSchema7 | undefined` and can flow directly into JSON Schema form libraries that accept draft-7 compatible schemas:

```tsx
<ParametersPanel values={result.parameters} schema={result.jsonSchema} onChange={result.setParameters} />
```

`result.status` is the document status: `evaluating`, `ready`, `error`, or `closed`. `artifactStatus` is `empty`, `current`, or `stale`; a failed evaluation retains the last artifact and its `artifactHash` as stale.

`view: { id, options?, instance?, content? }` selects one view without reopening or evaluating the document. `exportModel(target, request?)` uses the document's typed export IDs, options, and routes. Exports read committed parameters, including while a transient preview is running.
