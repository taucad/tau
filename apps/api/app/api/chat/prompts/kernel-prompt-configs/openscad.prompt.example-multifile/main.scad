// Always import library .scad files via `use <…>` — it brings in modules
// and functions but does NOT execute top-level invocations from the
// imported file, so a library that calls `widget();` at its top level
// still renders standalone without duplicating geometry in the assembly.
use <lib/widget.scad>

widget();
