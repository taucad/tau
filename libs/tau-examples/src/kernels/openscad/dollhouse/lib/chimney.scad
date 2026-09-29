include <common.scad>

// Brick chimney rising through the rear roof slope, with a capstone
// and two flue pots.
module chimney() {
    h = chimney_top - chimney_base_z;
    color(col_chimney)
        translate([chimney_x, chimney_y, chimney_base_z])
            difference() {
                brick_stack([chimney_w, chimney_d, h]);
            }
    // Capstone
    color(col_found)
        translate([chimney_x, chimney_y, chimney_top])
            cube([chimney_w + 8, chimney_d + 8, 6], center = true);
    // Flue pots
    for (fx = [-1, 1])
        color("#7C3A2A")
            translate([chimney_x + fx * 6, chimney_y, chimney_top + 3])
                cylinder(h = 12, r = 4);
}

// Box with shallow horizontal grooves to read as brick courses.
module brick_stack(dims) {
    difference() {
        translate([0, 0, dims[2] / 2])
            cube(dims, center = true);
        for (z = [10 : 14 : dims[2] - 6])
            translate([0, 0, z])
                for (f = [0, 1])
                    rotate([0, 0, f * 90])
                        translate([0, dims[1] / 2, 0])
                            cube([dims[0] + 2, 1.4, 1.4], center = true);
    }
}

chimney();
