include <common.scad>

// Stone foundation slab with a small skirt and front entry steps.
module foundation() {
    fw = house_w + 2 * foundation_over;
    fd = house_d + 2 * foundation_over;
    color(col_found) {
        // main slab
        translate([0, 0, -foundation_h / 2])
            cube([fw, fd, foundation_h], center = true);
        // narrow plinth band just under the walls
        translate([0, 0, 4 / 2])
            cube([house_w + 8, house_d + 8, 4], center = true);

        // Front steps leading up to the door.
        n_steps = 3;
        step_d  = 11;
        step_h  = foundation_h / n_steps;
        for (i = [0 : n_steps - 1])
            translate([0, fd / 2 + step_d * (i + 0.5) - 0.5,
                       -foundation_h + step_h * (i + 0.5)])
                cube([door_w + 26, step_d + eps, step_h], center = true);
    }
}

foundation();
