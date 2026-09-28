# @taucad/workbench

Portable, React-free workbench records. The page and agents share the same JSON grammar for layouts, views, and per-entry settings.

## Install

```bash
pnpm add @taucad/workbench
```

## Read and write a view

```typescript
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';

const path = workbenchPaths.view('front'); // .tau/workbench/views/front.json
const json = workbenchRecords.view.serialize({
  version: 1,
  entryPath: 'bracket.ts',
  camera: { kind: 'preset', preset: 'front' },
});
const result = workbenchRecords.view.read(new TextEncoder().encode(json));
if (result.status === 'current') {
  console.log(path, result.record.camera);
}
```

The reader preserves invalid or newer bytes and returns a refusal. The writer emits sorted, two-space JSON with a final newline and enforces a 64 KiB limit. File writes and UI adoption belong to the host and page.

This package requires Node 24 or a modern browser, `zod` 4, and `@taucad/camera` 0.0.1. Its file shapes are versioned; the three live files use version 1. Named layouts and device records have grammar here but no runtime writer in the current cut.
