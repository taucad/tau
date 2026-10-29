// Stackable-looking parts bin in the OpenSCAD customizer style.
// One rounded plan, a hollow, and a finger scoop: constructive solid geometry
// a maker can retune from the parameter list and send to a printer.

// Outside length
length = 90;
// Outside width
width = 62;
// Outside height
height = 40;
// Wall thickness
wall = 2.4;
// Floor thickness
floor_thickness = 2.2;
// Corner radius
corner_radius = 8;
// Finger-scoop radius on the front lip
scoop_radius = 7;

$fn = 64;

module rounded_rect(rect_length, rect_width, radius) {
  offset(r = radius)
    offset(delta = -radius)
      square([rect_length - 2 * radius, rect_width - 2 * radius], center = true);
}

module parts_bin() {
  inner_radius = max(corner_radius - wall, 0.8);
  difference() {
    linear_extrude(height)
      rounded_rect(length, width, corner_radius);
    translate([0, 0, floor_thickness])
      linear_extrude(height)
        rounded_rect(length - 2 * wall, width - 2 * wall, inner_radius);
    translate([0, -width / 2 + wall, height])
      rotate([0, 90, 0])
        cylinder(h = length * 0.46, r = scoop_radius, center = true);
  }
}

parts_bin();
