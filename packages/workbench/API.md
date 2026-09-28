# Workbench public API report

The approved records guide is `docs/research/artifacts/programmable-workbench-charter/api/records/guide.ts` (revision 4). The root export is `@taucad/workbench`: the record schemas and types, `workbenchRecords`, `workbenchPaths`, camera vocabulary and section grammar. There is no React or Dockview dependency.

`workbenchRecords.layout`, `.view`, and `.entries` are live. `.namedLayout` and `.device` are grammar only. Readers accept at most 64 KiB of strict UTF-8 JSON, refuse `__proto__` at any depth, and return `current` or `invalid-preserved` with `INVALID_RECORD` or `NEWER_RECORD`. Serializers validate before writing, sort keys recursively, use two-space indentation, and end with one newline. The caller owns checked filesystem writes and preserves refused bytes.

The page projection and the control tool compose the exported schemas. `projectPathSchema` uses the existing `@taucad/utils/path` canonical relative path validator. `sectionSchema` is exported for the page parser once its owner can update `editor.constants.ts`.
