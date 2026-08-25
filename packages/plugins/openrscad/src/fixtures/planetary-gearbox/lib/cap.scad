include <params.scad>

module end_cap() {
    color("#3B4650")
    difference() {
        union() {
            cylinder(r = cap_r, h = cap_t);
            cylinder(r = bearing_or + 3, h = cap_t + 4);
        }
        translate([0, 0, -1]) cylinder(r = shaft_clear, h = cap_t + 6);
        translate([0, 0, cap_t + 4 - bearing_t])
            cylinder(r = bearing_or + 0.2, h = bearing_t + 1);
        for (i = [0 : n_bolts - 1])
            rotate(i * 360 / n_bolts + 30)
                translate([bolt_circle, 0, -1]) cylinder(r = bolt_hole, h = cap_t + 2);
        for (i = [0 : 3])
            rotate(i * 90)
                translate([cap_r - 3, 0, -1]) cylinder(r = bolt_hole, h = cap_t + 2);
    }
}

end_cap();
