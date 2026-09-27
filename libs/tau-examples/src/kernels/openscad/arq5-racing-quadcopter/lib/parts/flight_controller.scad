$fa = 2;
$fs = 0.4;

module flight_controller() {
  color("#0b3d0b")
    union() {
      hull() {
        for (x = [-15, 15], y = [-15, 15])
          translate([x, y, 0])
            cylinder(h = 1.6, d = 6);
      }
      // The MCU sits on the board (it floated 1.2 mm above it).
      color("#1a1a1a")
        translate([0, 0, 1.7])
          hull() {
            cube([14, 14, 0.4], center = true);
            translate([0, 0, 2.2])
              cube([10, 10, 0.4], center = true);
          }
      for (x = [-15.25, 15.25], y = [-15.25, 15.25])
        translate([x, y, 0])
          cylinder(h = 1.6, d = 5);
    }
}

flight_controller();
