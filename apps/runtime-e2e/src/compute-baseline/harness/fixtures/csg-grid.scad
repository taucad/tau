// Lane B spike fixture: gridfinity-style union/difference-heavy CSG model.
// cells_x/cells_y drive the expensive prefix (bin bodies + hole patterns); lid_* drives only the trailing lid feature.
$fn = 24;
cells_x = 4;      // [1:1:8]
cells_y = 4;      // [1:1:8]
pitch = 42;
bin_h = 30;
wall = 1.6;
corner_r = 4;
lid_height = 4;   // [1:1:10]
lid_inset = 0.5;

module rounded_box(size, r) {
  hull() for (x = [r, size[0] - r], y = [r, size[1] - r]) translate([x, y, 0]) cylinder(r = r, h = size[2]);
}
module bin(i, j) {
  translate([i * pitch, j * pitch, 0]) difference() {
    rounded_box([pitch - 0.5, pitch - 0.5, bin_h], corner_r);
    translate([wall, wall, wall]) rounded_box([pitch - 0.5 - 2 * wall, pitch - 0.5 - 2 * wall, bin_h], corner_r - wall);
    for (x = [8, pitch - 8.5], y = [8, pitch - 8.5]) translate([x, y, -1]) cylinder(d = 6.5, h = 3.5);
    for (x = [8, pitch - 8.5], y = [8, pitch - 8.5]) translate([x, y, -1]) cylinder(d = 3, h = 8);
  }
}
union() {
  for (i = [0 : cells_x - 1], j = [0 : cells_y - 1]) bin(i, j);
}
// Late feature: a lid plate over the whole array with a finger notch.
translate([0, 0, bin_h + 2]) difference() {
  rounded_box([cells_x * pitch - 0.5, cells_y * pitch - 0.5, lid_height], corner_r);
  translate([cells_x * pitch / 2, -1, -1]) cylinder(d = 20, h = lid_height + 2);
}
