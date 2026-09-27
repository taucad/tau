include <common.scad>

// Exterior shell: two-storey box with gable ends, plus the mid-floor slab,
// interior partitions and a staircase. All openings are cut to match the
// window/door placement lists in common.scad.

module wall_shell() {
    color(col_wall)
    difference() {
        union() {
            // Hollow box walls.
            difference() {
                translate([0, 0, wall_height / 2])
                    cube([house_w, house_d, wall_height], center = true);
                translate([0, 0, wall_height / 2 + eps])
                    cube([house_w - 2 * wall_t, house_d - 2 * wall_t,
                          wall_height + 2], center = true);
                // open the bottom so interior is reachable (slab covers it)
            }
            // Gable triangles on the left/right ends, inline so the export
            // keeps the shell as one closed named solid.
            for (s = [-1, 1])
                translate([s * (house_w / 2 - wall_t / 2), 0, wall_height])
                    rotate([90, 0, 90])
                        linear_extrude(height = wall_t, center = true)
                            polygon([[-half_depth, 0], [half_depth, 0], [0, gable_rise]]);
        }
        // ---- cut all openings ----
        for (w = front_windows) opening_cut("front", w[0], w[1], win_w, win_h);
        for (w = back_windows)  opening_cut("back",  w[0], w[1], win_w, win_h);
        for (w = side_windows)  opening_cut("left",  w[0], w[1], win_w, win_h);
        for (w = side_windows)  opening_cut("right", w[0], w[1], win_w, win_h);
        // front door opening
        opening_cut("front", 0, door_h / 2, door_w, door_h);
    }
}

// centred in X/Y but resting on z=0
function false_centre() = [true, true, false];

// Interior mid-floor slab between the two storeys (with a stair opening).
module mid_floor() {
    color(col_stair)
    difference() {
        translate([0, 0, floor_h + mid_t / 2])
            cube([house_w - 2 * wall_t + eps, house_d - 2 * wall_t + eps, mid_t],
                 center = true);
        // stairwell hole
        translate([55, -30, floor_h + mid_t / 2])
            cube([46, 60, mid_t + 4], center = true);
    }
}

// Interior partition walls dividing each floor into rooms.
module partitions() {
    color(col_trim) {
        // ground-floor central partition (X)
        translate([-6, 0, floor_h / 2])
            partition_x(floor_h, [house_d - 2 * wall_t, 5]);
        // ground-floor cross partition (Y) on the right half
        translate([0, 18, floor_h / 2])
            partition_y(floor_h, [house_w / 2 - wall_t, 5], xoff = 60);
        // upper-floor central partition
        translate([10, 0, floor_h + mid_t + floor_h / 2])
            partition_x(floor_h, [house_d - 2 * wall_t, 5]);
        // upper cross partition on left
        translate([0, -10, floor_h + mid_t + floor_h / 2])
            partition_y(floor_h, [house_w / 2 - wall_t, 5], xoff = -55);
    }
}

module partition_x(h, dims) {           // wall running along Y at fixed X
    cube([dims[1], dims[0], h], center = true);
}
module partition_y(h, dims, xoff) {     // wall running along X, offset in X
    translate([xoff, 0, 0])
        cube([dims[0], dims[1], h], center = true);
}

// Straight flight of stairs from ground floor up through the stairwell.
module staircase() {
    n = 11;
    rise = (floor_h + mid_t) / n;
    run  = 42 / n;
    tread = 16;
    color(col_stair)
    translate([55, -52, 0])
        for (i = [0 : n - 1])
            translate([0, i * run + run / 2, i * rise + rise / 2])
                cube([40, run + tread, rise], center = true);
}

module walls() {
    wall_shell();
    mid_floor();
    partitions();
    staircase();
}

walls();
