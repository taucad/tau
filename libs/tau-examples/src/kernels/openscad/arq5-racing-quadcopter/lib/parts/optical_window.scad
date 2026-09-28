$fa = 2;
$fs = 0.4;

module optical_window() {
  color("#88c8e8", 0.55)
    intersection() {
      difference() {
        sphere(r = 10);
        sphere(r = 9.2);
      }
      translate([9, 0, 0])
        cube([4, 16, 16], center = true);
    }
}

optical_window();
