include <common.scad>

// A framed double-hung window with sill, mullions, glass and open shutters.
// Modelled on the wall FACE plane: y = 0 is the exterior surface, +Y points
// outward, the wall body occupies y < 0. place_on_face() positions it.
module window() {
    gw = win_w - 2 * frame_w;   // glass width
    gh = win_h - 2 * frame_w;   // glass height

    // Outer trim frame (protrudes outside, laps over the wall edge).
    color(col_trim) {
        difference() {
            translate([0, frame_t_out / 2 - wall_t / 2, 0])
                cube([win_w + 6, frame_t_out + wall_t, win_h + 6], center = true);
            translate([0, 1, 0])
                cube([gw + 2, frame_t_out + wall_t + 4, gh + 2], center = true);
        }
        // Sill
        translate([0, frame_t_out / 2, -win_h / 2 - 4])
            cube([win_w + 14, frame_t_out + 5, 5], center = true);
    }

    // Glass pane, set just inside the trim.
    color(col_glass, 0.55)
        translate([0, -1, 0])
            cube([gw + 2, 2, gh + 2], center = true);

    // Mullions: one vertical, one horizontal cross.
    color(col_trim)
    translate([0, frame_t_out / 2 - 1, 0]) {
        cube([mull_w, 3, gh + 2], center = true);
        cube([gw + 2, 3, mull_w], center = true);
    }

    // Shutters, hinged open flat against the wall on each side.
    sh_w = win_w * 0.55;
    for (s = [-1, 1])
        color(col_shutter)
        translate([s * (win_w / 2 + sh_w / 2 + 1), 1, 0])
            difference() {
                cube([sh_w, 4, win_h], center = true);
                for (k = [-6 : 6])
                    translate([0, 1.5, k * 4])
                        rotate([20, 0, 0])
                            cube([sh_w - 6, 2, 1.6], center = true);
            }
}

translate([0, half_depth, ground_z]) window();
