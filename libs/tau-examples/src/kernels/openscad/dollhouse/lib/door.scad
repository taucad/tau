include <common.scad>

// Panelled front door with surrounding trim, transom window and knob.
// Modelled on the wall FACE plane: y = 0 is exterior, +Y outward, sits on z=0.
module door() {
    // Surround trim + transom.
    color(col_trim) {
        difference() {
            translate([0, 0, door_h / 2])
                cube([door_w + 16, wall_t + 8, door_h + 22], center = true);
            translate([0, 0, door_h / 2])
                cube([door_w + 2, wall_t + 12, door_h + 2], center = true);
        }
        // transom bar
        translate([0, 0, door_h + 1])
            cube([door_w + 2, frame_t_out + wall_t, 4], center = true);
    }
    // Transom glass above the door.
    color(col_glass, 0.55)
        translate([0, -1, door_h + 10])
            cube([door_w - 4, 2, 14], center = true);

    // Door slab with two recessed panels.
    color(col_door)
    translate([0, -1, door_h / 2]) {
        difference() {
            cube([door_w, 6, door_h], center = true);
            for (pz = [door_h * 0.27, -door_h * 0.18])
                translate([0, 2, pz])
                    cube([door_w - 16, 4, door_h * 0.3], center = true);
        }
        for (pz = [door_h * 0.27, -door_h * 0.18])
            translate([0, 2, pz])
                cube([door_w - 22, 3, door_h * 0.3 - 6], center = true);
    }

    // Knob
    color("#D9B44A")
        translate([door_w / 2 - 9, 4, door_h * 0.45])
            sphere(4);
}

translate([0, half_depth, 0]) door();
