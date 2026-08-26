// Parametric arched greenhouse assembly
$fa = 3;
$fs = 0.6;

// Primary dimensions in millimetres.
greenhouse_width = 120;
greenhouse_depth = 180;
wall_height = 70;
roof_radius = greenhouse_width / 2;
tube_radius = 2.2;
panel_thickness = 1.2;
door_width = 36;
door_height = 62;
bench_height = 28;

function roof_z(x) = wall_height + sqrt(roof_radius * roof_radius - x * x);

module tube_between_xz(point_a, point_b, radius = tube_radius) {
    delta_x = point_b[0] - point_a[0];
    delta_z = point_b[2] - point_a[2];
    length = sqrt(delta_x * delta_x + delta_z * delta_z);
    angle = atan2(delta_x, delta_z);
    translate([(point_a[0] + point_b[0]) / 2, (point_a[1] + point_b[1]) / 2, (point_a[2] + point_b[2]) / 2])
        rotate([0, angle, 0])
            cylinder(h = length, r = radius, center = true);
}

module arch_hoop(y_position) {
    translate([0, y_position, wall_height])
        rotate([90, 0, 0])
            rotate_extrude(angle = 180, convexity = 10)
                translate([roof_radius, 0, 0])
                    circle(r = tube_radius);
}

module base_frame() {
    color("#8A9297") {
        translate([0, -greenhouse_depth / 2, tube_radius])
            cube([greenhouse_width, 2 * tube_radius, 2 * tube_radius], center = true);
        translate([0, greenhouse_depth / 2, tube_radius])
            cube([greenhouse_width, 2 * tube_radius, 2 * tube_radius], center = true);
        translate([-greenhouse_width / 2, 0, tube_radius])
            cube([2 * tube_radius, greenhouse_depth, 2 * tube_radius], center = true);
        translate([greenhouse_width / 2, 0, tube_radius])
            cube([2 * tube_radius, greenhouse_depth, 2 * tube_radius], center = true);
    }
}

module upright_frame() {
    color("#8A9297") {
        for (x_position = [-greenhouse_width / 2, greenhouse_width / 2])
            for (y_position = [-greenhouse_depth / 2, greenhouse_depth / 2])
                translate([x_position, y_position, wall_height / 2])
                    cylinder(h = wall_height, r = tube_radius, center = true);

        for (x_position = [-greenhouse_width / 2, greenhouse_width / 2])
            translate([x_position, 0, wall_height])
                cube([2 * tube_radius, greenhouse_depth, 2 * tube_radius], center = true);

        translate([0, 0, roof_z(0)])
            cube([2 * tube_radius, greenhouse_depth, 2 * tube_radius], center = true);
    }
}

module roof_frame() {
    color("#8A9297") {
        for (y_position = [-greenhouse_depth / 2, -greenhouse_depth / 4, 0, greenhouse_depth / 4, greenhouse_depth / 2])
            arch_hoop(y_position);
    }
}

module end_panel(y_position, has_door = false) {
    panel_profile = concat(
        [[-greenhouse_width / 2, 0], [greenhouse_width / 2, 0]],
        [for (x_position = [greenhouse_width / 2 : -15 : -greenhouse_width / 2]) [x_position, roof_z(x_position)]]
    );
    color("#B7E4F0", 0.30)
        translate([0, y_position + panel_thickness / 2, 0])
            rotate([90, 0, 0])
                linear_extrude(height = panel_thickness, convexity = 10)
                    difference() {
                        polygon(points = panel_profile);
                        if (has_door)
                            translate([0, door_height / 2])
                                square([door_width, door_height], center = true);
                    }
}

module side_panels() {
    color("#B7E4F0", 0.26) {
        translate([-greenhouse_width / 2 + panel_thickness / 2, 0, wall_height / 2])
            cube([panel_thickness, greenhouse_depth - 2 * tube_radius - 2, wall_height - 2 * tube_radius], center = true);
        translate([greenhouse_width / 2 - panel_thickness / 2, 0, wall_height / 2])
            cube([panel_thickness, greenhouse_depth - 2 * tube_radius - 2, wall_height - 2 * tube_radius], center = true);
    }
}

module roof_panel_strip(x_start, x_end) {
    z_start = roof_z(x_start);
    z_end = roof_z(x_end);
    delta_x = x_end - x_start;
    delta_z = z_end - z_start;
    strip_length = sqrt(delta_x * delta_x + delta_z * delta_z);
    strip_angle = atan2(delta_x, delta_z);
    color("#B7E4F0", 0.24)
        translate([(x_start + x_end) / 2, 0, (z_start + z_end) / 2])
            rotate([0, strip_angle, 0])
                cube([strip_length + 0.8, greenhouse_depth - 2 * tube_radius, panel_thickness], center = true);
}

module roof_panels() {
    for (x_start = [-greenhouse_width / 2 : 15 : greenhouse_width / 2 - 15])
        roof_panel_strip(x_start, x_start + 15);
}

module door_assembly() {
    door_y = -greenhouse_depth / 2 + 2.8;
    color("#6F787D") {
        for (x_position = [-door_width / 2, door_width / 2])
            translate([x_position, door_y, door_height / 2])
                cube([2 * tube_radius, 4, door_height], center = true);
        translate([0, door_y, door_height])
            cube([door_width + 2 * tube_radius, 4, 2 * tube_radius], center = true);
    }
    color("#A9DCE8", 0.38)
        translate([0, door_y + 1.3, door_height / 2])
            cube([door_width - 2 * tube_radius, 1.0, door_height - 2 * tube_radius], center = true);

    color("#B2B8BB") {
        for (z_position = [12, 31, 50])
            translate([-door_width / 2 + 1.5, door_y - 2.3, z_position])
                rotate([90, 0, 0])
                    cylinder(h = 5, r = 1.5, center = true);
        translate([door_width / 2 - 7, door_y - 3.1, door_height / 2])
            rotate([90, 0, 0])
                cylinder(h = 5, r = 1.5, center = true);
        translate([door_width / 2 - 4.5, door_y - 5.0, door_height / 2])
            cube([5, 1.5, 1.5], center = true);
    }
}

module bench(x_position) {
    bench_depth = greenhouse_depth - 38;
    color("#8B5A2B") {
        translate([x_position, 0, bench_height])
            cube([28, bench_depth, 3], center = true);
        for (x_offset = [-10, 0, 10])
            translate([x_position + x_offset, 0, bench_height - 2])
                cube([2, bench_depth, 2], center = true);
    }
    color("#6F7475") {
        for (y_position = [-bench_depth / 2 + 6, bench_depth / 2 - 6])
            for (x_offset = [-11, 11])
                translate([x_position + x_offset, y_position, bench_height / 2])
                    cube([2.5, 2.5, bench_height], center = true);
        translate([x_position, 0, 5])
            cube([25, bench_depth - 8, 2], center = true);
    }
}

module roof_vent() {
    vent_x = 16;
    vent_z = roof_z(vent_x) + 2.0;
    vent_angle = atan2(15, roof_z(31) - roof_z(1));
    color("#667176") {
        translate([vent_x, 18, vent_z])
            rotate([0, vent_angle, 0])
                cube([20, 30, 1.8], center = true);
        translate([vent_x - 9, 18, vent_z + 2.0])
            rotate([0, vent_angle, 0])
                cube([1.6, 30, 4], center = true);
        translate([vent_x + 9, 18, vent_z + 2.0])
            rotate([0, vent_angle, 0])
                cube([1.6, 30, 4], center = true);
    }
    color("#9FD7DE", 0.45)
        translate([vent_x, 18, vent_z + 2.1])
            rotate([0, vent_angle, 0])
                cube([16, 26, 1], center = true);
}

module greenhouse() {
    base_frame();
    upright_frame();
    roof_frame();
    side_panels();
    end_panel(-greenhouse_depth / 2, true);
    end_panel(greenhouse_depth / 2, false);
    roof_panels();
    door_assembly();
    bench(-32);
    bench(32);
    roof_vent();
}

greenhouse();
