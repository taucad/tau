include <common.scad>

// Gabled roof: two pitched panels meeting at a rounded ridge cap,
// with overhangs on all four sides.
module roof() {
    color(col_roof) {
        for (s = [-1, 1])
            roof_panel(s);
        ridge_cap();
    }
}

// One sloped roof panel. s = +1 front (+Y) side, -1 back.
module roof_panel(s) {
    // Flat slab hinged at the ridge line, tilted down the pitch to the eave.
    // Overshoot the ridge by `lap` so the two panels interlock with no gap.
    lap = 12;
    translate([0, 0, ridge_z])
        rotate([0, 0, s > 0 ? 0 : 180])
            rotate([-theta, 0, 0])
                translate([0, (panel_len - lap) / 2, -roof_t / 2])
                    cube([roof_w, panel_len + lap, roof_t], center = true);
}

module ridge_cap() {
    translate([0, 0, ridge_z + ridge_r * 0.2])
        rotate([0, 90, 0])
            cylinder(h = roof_w, r = ridge_r, center = true);
}

roof();
