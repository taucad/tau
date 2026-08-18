include <params.scad>
use <gear.scad>

module sun_assembly() {
    color("#C9A227") {
        spur_gear(m, Zs, face, pa, clr, bl);
        translate([0, 0, -18]) cylinder(r = shaft_r, h = 18 + 0.01);
        translate([0, 0, -3]) cylinder(r = shaft_r + 2, h = 3);
    }
}

sun_assembly();
