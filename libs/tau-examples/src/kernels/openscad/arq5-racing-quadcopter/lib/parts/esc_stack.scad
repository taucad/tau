$fa = 2;
$fs = 0.4;

module esc_stack() {
  color("#0b3d0b")
    union() {
      hull() {
        for (x = [-17.5, 17.5], y = [-17.5, 17.5])
          translate([x, y, 0])
            cylinder(h = 1.6, d = 6);
      }
      // The MOSFET block sits on the board (it floated 1.7 mm above it).
      color("#303038")
        translate([0, 0, 1.8])
          hull() {
            cube([30, 24, 0.6], center = true);
            translate([0, 0, 2.2])
              cube([26, 20, 0.6], center = true);
          }
    }
}

esc_stack();
