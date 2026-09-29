# @taucad/workbench

Portable, React-free workbench records. The page and agents share the same JSON grammar for layouts, views, and per-entry settings. The editor applies valid live project records when a window is open.

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
  name: 'Front',
  camera: { kind: 'preset', preset: 'front' },
});
const result = workbenchRecords.view.read(new TextEncoder().encode(json));
if (result.status === 'current') {
  console.log(path, result.record.name); // .tau/workbench/views/front.json Front
}
```

The reader never alters its input. Invalid or newer bytes return `invalid-preserved` with `INVALID_RECORD` or `NEWER_RECORD`; keep those bytes for correction or a Tau update. The writer emits sorted, two-space JSON with a final newline and enforces a 64 KiB limit. The three live files are `.tau/workbench/layout.json`, `.tau/workbench/views/<id>.json`, and `.tau/workbench/entries.json`. Checked filesystem writes and UI adoption belong to the host and page. `arrange_workbench` writes these records at the live project root, even for a candidate turn, and offers a visible Restore action in the chat.

This package requires Node 24 or a modern browser, `zod` 4, and `@taucad/camera` 0.0.1. Its file shapes are versioned; the three live files use version 1. Named layouts and device records have grammar here but no runtime writer in the current cut. See [API.md](./API.md) for the root export and codec reference.
