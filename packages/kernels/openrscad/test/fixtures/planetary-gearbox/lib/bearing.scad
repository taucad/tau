include <params.scad>

module bearing() {
    ir = shaft_r + 0.1;
    irr = ir + 1.4;
    orr = bearing_or - 1.4;
    ball = (irr + orr) / 2;
    br = (orr - irr) / 2 + 0.2;
    union() {
        color("#9AA3AD") {
            difference() {
                cylinder(r = bearing_or, h = bearing_t);
                translate([0, 0, -1]) cylinder(r = orr, h = bearing_t + 2);
            }
            difference() {
                cylinder(r = irr, h = bearing_t);
                translate([0, 0, -1]) cylinder(r = ir, h = bearing_t + 2);
            }
        }
        color("#D6DBE0")
            for (i = [0 : 9])
                rotate(i * 36)
                    translate([ball, 0, bearing_t / 2]) sphere(r = br);
    }
}

bearing();
