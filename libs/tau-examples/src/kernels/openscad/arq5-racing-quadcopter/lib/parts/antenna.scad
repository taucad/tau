$fa = 2;
$fs = 0.4;

module antenna() {
  color("#d0d0d4")
    union() {
      // Offset the mast facets from the ball's so their seam has no coincident vertices.
      rotate([0, 0, 1.3]) cylinder(h = 14, d = 3.2);
      // Whiskers start at the ball centre so they only meet inside the ball.
      translate([0, 0, 14])
        for (a = [0, 120, 240])
          rotate([0, 0, a])
            rotate([35, 0, 0])
              cylinder(h = 10, d = 1.6);
      translate([0, 0, 14])
        sphere(d = 4);
    }
}

antenna();
