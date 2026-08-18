include <params.scad>
use <gear.scad>

module housing() {
    color("#4F5B66")
    difference() {
        union() {
            internal_ring(m, Zr, face, ring_outer, pa, clr, bl);
            translate([0, 0, -plate_t - 1])
                rotate_extrude(convexity = 4)
                    translate([pr_r + m + 0.5, 0])
                        square([ring_outer - (pr_r + m + 0.5), plate_t + 1]);
            translate([0, 0, face])
                rotate_extrude(convexity = 4)
                    translate([pr_r + m + 0.5, 0])
                        square([ring_outer - (pr_r + m + 0.5), plate_t + 1]);
        }
        for (i = [0 : n_bolts - 1])
            rotate(i * 360 / n_bolts + 30)
                translate([bolt_circle, 0, -plate_t - 2])
                    cylinder(r = bolt_hole, h = face + 2 * plate_t + 4);
    }
}

housing();
