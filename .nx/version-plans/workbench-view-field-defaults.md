---
workbench: minor
---

Export the inheritable view fields and their frozen version 1 format values.

- `viewRecordV1Defaults` holds the version 1 schema default of each of the ten inheritable view leaves (Z up, 60 degrees, surfaces, lines, gizmo, grid and axes on, matcap and post-processing off, millimetres). `viewDisplaySchema`, `viewGridSchema` and `viewFieldsSchema` read their defaults from it, so the parsed values are unchanged.
- `ViewFieldValues` and `ViewFieldPath` name those leaves by path (`'display.grid'`, `'grid.unit'`), and `viewFieldPaths` lists them. `LengthUnit` is the union of `lengthUnits`.

The view record's shape and version are unchanged. A later release reads a leaf held at its format value as not set in that view, so a level above it can apply.
