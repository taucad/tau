$fa = 4;
$fs = 0.8;

module battery_pack() {
  color("#f0c400")
    minkowski() {
      cube([69, 30, 22], center = true);
      sphere(r = 3, $fn = 20);
    }
}

battery_pack();
