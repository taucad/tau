# @taucad/react

React hooks for `@taucad/runtime`.

## `useRuntime`

`useRuntime` is the ergonomic React happy path for runtime clients. It owns the client lifecycle, connects through the supplied transport, renders the supplied source, applies parameter updates, exposes resolved parameter schemas, returns geometry state, and provides export helpers.

```typescript
import { useRuntime } from '@taucad/react';
import { createWebWorkerClientOptions } from '@taucad/runtime/transport/web';
import type { runtime } from './runtime-definition';

const mainFile = '/main.ts';
const initialSource = 'export default () => makeCylinder(10, 24);';

const clientOptions = createWebWorkerClientOptions<typeof runtime>({
  createWorker: () =>
    new Worker(new URL('./runtime.worker.ts', import.meta.url), {
      type: 'module',
    }),
});

const result = useRuntime({
  clientOptions,
  source: { files: { [mainFile]: initialSource } },
  initialParameters: { height: 20 },
});
```

Declare stable `clientOptions` values or provider functions at module scope. Changing the identity of `clientOptions` tells `useRuntime` to tear down the current runtime client and connect a new one.

Framework-specific worker or process setup stays outside this package. React components supply a runtime transport; the worker or host owns executable runtime definitions.

`useRuntime` owns effective render parameters. Bind form controls to `result.parameters`, call `result.setParameters(nextFormData)`, and use `result.resetParameters()` to return to the runtime-discovered defaults.

`result.jsonSchema` is typed as `JSONSchema7 | undefined` and can flow directly into JSON Schema form libraries that accept draft-7 compatible schemas:

```tsx
<ParametersPanel values={result.parameters} schema={result.jsonSchema} onChange={result.setParameters} />
```

`result.status` is the runtime-derived `RenderStatus`: `idle`, `connecting`, `rendering`, `ready`, or `error`. Use `ready` for viewer/export-ready gates and bind the status directly instead of translating `loading`/`success` states in app code.

`exportGeometry(format, { exportOptions })` uses the same format-specific export option types as `RuntimeClient.export`. The hook owns `source` and parameters, so consumers never pass them again just to download the current model.
