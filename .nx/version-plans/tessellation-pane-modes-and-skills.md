---
viewer: minor
replicad: minor
opencascade: minor
build123d: minor
picovoxel: minor
picogk: minor
---

Show a preset-or-explicit kernel setting, such as `tessellation`, as two modes in the kernel-settings pane, and teach the tessellation vocabulary in the kernel skills.

`@taucad/viewer`'s `KernelSettings` renders a `oneOf` of a preset enum and an explicit object as a Preset or Custom choice. Preset shows the presets as one segmented control; Custom shows the explicit object's fields in their `x-tau-unit` units. A stored preset opens in Preset, a stored explicit object opens in Custom, and switching modes replaces the stored value whole: Custom starts from the schema's example values and Preset from the view's default preset. Editing one explicit field keeps the other fields of the stored object and adds nothing else. Every segment is a menu radio item, so the menu's arrow keys reach it.

The `cad-replicad`, `cad-opencascadejs` and `cad-build123d` skills share one Tessellation paragraph: the four presets and when to pick each, the explicit form in millimetres and degrees, never both, no model-declared hint yet, and the effective resolution and `TESSELLATION_DOWNGRADED` in results. The `cad-picovoxel` and `cad-picogk` skills add that the voxel size is the model rather than a mesh setting, what results report, and that display simplification (`DISPLAY_SIMPLIFIED`) changes only PicoVoxel previews and captures, never exports or GeoSpec subjects; PicoGK previews are not simplified yet.
