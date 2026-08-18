include <params.scad>
use <gear.scad>

module planet_gear() {
    color("#B0843B")
    difference() {
        spur_gear(m, Zp, face, pa, clr, bl);
        translate([0, 0, -1]) cylinder(r = pin_r + pin_clear, h = face + 2);
    }
}

planet_gear();
