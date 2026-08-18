include <params.scad>

module _plate() {
    difference() {
        cylinder(r = plate_r, h = plate_t);
        translate([0, 0, -1]) cylinder(r = shaft_r + 1, h = plate_t + 2);
        for (i = [0 : n_planets - 1])
            rotate(i * 360 / n_planets + 45)
                translate([carrier_r, 0, -1]) cylinder(r = 6, h = plate_t + 2);
    }
}

module carrier_assembly() {
    color("#6E7B8B") {
        translate([0, 0, -plate_t]) _plate();
        translate([0, 0, face]) _plate();
        for (i = [0 : n_planets - 1])
            rotate(i * 360 / n_planets)
                translate([carrier_r, 0, -plate_t + 0.01])
                    cylinder(r = pin_r, h = face + 2 * plate_t - 0.02);
        translate([0, 0, face + plate_t - 0.01]) cylinder(r = shaft_r, h = 18);
        translate([0, 0, face + plate_t - 0.01]) cylinder(r = shaft_r + 2, h = 3);
    }
}

carrier_assembly();
