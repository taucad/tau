module widget() {
  cube([10, 10, 10], center = true);
}

// Top-level invocation so this file renders standalone in the editor.
// Safe under `use <…>` from main.scad — top-level calls in `use`d files
// are not executed by the importing file.
widget();
