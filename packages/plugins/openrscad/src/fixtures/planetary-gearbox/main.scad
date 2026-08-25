include <lib/params.scad>
use <lib/gear.scad>
use <lib/sun.scad>
use <lib/planet.scad>
use <lib/carrier.scad>
use <lib/housing.scad>
use <lib/cap.scad>
use <lib/bearing.scad>

function planet_spin(theta) = 180 / Zp - (Zs / Zp) * theta;

module planet_set() {
    for (i = [0 : n_planets - 1]) {
        theta = i * 360 / n_planets;
        rotate(theta)
            translate([carrier_r, 0, 0])
                rotate(planet_spin(theta))
                    planet_gear();
    }
}

module gearbox() {
    housing();
    sun_assembly();
    planet_set();
    carrier_assembly();
    translate([0, 0, -plate_t - 1]) mirror([0, 0, 1]) end_cap();
    translate([0, 0, face + plate_t + 1]) end_cap();
    translate([0, 0, -plate_t - 1 - cap_t - 4 + 0.01]) bearing();
    translate([0, 0, face + plate_t + 1 + cap_t + 4 - bearing_t - 0.01]) bearing();
}

gearbox();
