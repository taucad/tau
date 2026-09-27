$fn = 32;

square_size = 28;
play_size = square_size * 8;
frame = 10;
board_top = 8.2;

gunmetal = [0.07, 0.10, 0.14];
tile_dark = [0.025, 0.065, 0.09];
tile_light = [0.16, 0.23, 0.25];
steel = [0.26, 0.30, 0.34];
cyan = [0.00, 0.95, 1.00];
magenta = [1.00, 0.02, 0.48];
cyan_body = [0.08, 0.34, 0.38];
magenta_body = [0.40, 0.07, 0.21];

assert(play_size + 2 * frame == 244);
assert(square_size >= 2 * 10);

module torus(major, minor) {
    rotate_extrude(convexity = 8)
        translate([major, 0]) circle(r = minor, $fn = 16);
}

module board() {
    color(gunmetal)
        linear_extrude(height = 6)
            offset(r = 4) square([236, 236], center = true);

    for (x = [0:7], y = [0:7])
        color((x + y) % 2 ? tile_dark : tile_light)
            translate([(x - 3.5) * square_size, (y - 3.5) * square_size, 6])
                linear_extrude(height = 2.2)
                    offset(r = 0.7) square([27.2, 27.2], center = true);

    // One closed frame ring: rails that only touch at their corner edges
    // would leave non-manifold edges.
    color(steel)
        translate([0, 0, 8])
            difference() {
                cube([244, 244, 8], center = true);
                cube([224, 224, 10], center = true);
            }

    for (s = [-1, 1]) {
        color(cyan) translate([s * 117, -60, 12.1]) cube([1.5, 90, 0.8], center = true);
        color(magenta) translate([s * 117, 60, 12.1]) cube([1.5, 90, 0.8], center = true);
        color(cyan) translate([-60, s * 117, 12.1]) cube([90, 1.5, 0.8], center = true);
        color(magenta) translate([60, s * 117, 12.1]) cube([90, 1.5, 0.8], center = true);
    }

    for (x = [-116, 116], y = [-116, 116]) {
        color(gunmetal) translate([x, y, 8]) cylinder(h = 8, r1 = 4.5, r2 = 3.5);
        color(y < 0 ? cyan : magenta) translate([x, y, 16]) sphere(r = 2.2, $fn = 20);
    }
}

module cyber_base(body, glow) {
    color(body) union() {
        cylinder(h = 3, r1 = 10, r2 = 9.5);
        translate([0, 0, 3]) cylinder(h = 3, r1 = 9.5, r2 = 7.5);
        translate([0, 0, 6]) cylinder(h = 2.5, r1 = 7.5, r2 = 6.8);
        for (a = [0:90:270])
            rotate([0, 0, a]) translate([7.6, -1.2, 1.2]) cube([2.4, 2.4, 4]);
    }
    color(glow) translate([0, 0, 4.8]) torus(8.0, 0.65);
}

module reactor_stem(body, glow, height = 18, top_radius = 4.3) {
    color(body) translate([0, 0, 7.5]) cylinder(h = height, r1 = 5.8, r2 = top_radius);
    color(glow) translate([0, 0, 14]) torus(5.25, 0.55);
    color(steel)
        for (a = [0:120:240])
            rotate([0, 0, a]) translate([4.4, -0.65, 10]) cube([1.7, 1.3, height - 5]);
}

module pawn(body, glow) {
    cyber_base(body, glow);
    reactor_stem(body, glow, 13, 3.2);
    color(body) translate([0, 0, 21]) cylinder(h = 3, r1 = 5.2, r2 = 4.4);
    color(body) translate([0, 0, 27]) sphere(r = 4.8);
    color(glow) translate([0, -4.35, 27]) cube([4.2, 0.9, 1.3], center = true);
    color(steel) translate([0, 0, 31]) cylinder(h = 3, r1 = 1.2, r2 = 0.5);
}

module rook(body, glow) {
    cyber_base(body, glow);
    color(body) translate([0, 0, 7.5]) cylinder(h = 20, r1 = 6.8, r2 = 6.0);
    color(steel)
        for (a = [0:90:270])
            rotate([0, 0, a]) translate([5.2, -0.8, 10]) cube([1.8, 1.6, 17]);
    color(glow) translate([0, 0, 19]) torus(6.0, 0.6);
    color(body) translate([0, 0, 27]) cylinder(h = 4, r = 8);
    for (a = [0:90:270])
        color(body) rotate([0, 0, a]) translate([5.3, -2.1, 30]) cube([4.4, 4.2, 6]);
    color(glow) translate([0, 0, 32]) cylinder(h = 1, r = 4.5);
}

module knight(body, glow) {
    cyber_base(body, glow);
    color(body)
        translate([0, 0, 7.5])
            rotate([90, 0, 0])
                linear_extrude(height = 8, center = true)
                    polygon([[ -6,0], [6,0], [5,8], [2,14], [5,23], [1,30],
                             [-7,27], [-9,20], [-4,14], [-6,8]]);
    color(body) translate([-1, -4, 31]) rotate([0, 12, 0]) cube([11, 8, 6], center = true);
    color(steel) translate([-5, 0, 24]) rotate([0, 25, 0]) cube([2, 9, 14], center = true);
    color(glow) translate([2.5, -4.15, 32.5]) sphere(r = 1.25, $fn = 16);
    color(glow) translate([2.5, 4.15, 32.5]) sphere(r = 1.25, $fn = 16);
    color(steel) translate([3.5, 0, 35]) rotate([0, -20, 0]) cylinder(h = 5, r1 = 1.2, r2 = 0.3);
}

module bishop(body, glow) {
    cyber_base(body, glow);
    reactor_stem(body, glow, 24, 3.0);
    color(body) translate([0, 0, 31.5]) cylinder(h = 4, r1 = 5.5, r2 = 4.2);
    color(body)
        difference() {
            translate([0, 0, 39]) scale([1, 1, 1.35]) sphere(r = 5.2);
            translate([-0.8, -7, 38]) rotate([0, -28, 0]) cube([2.2, 14, 12]);
        }
    color(glow) translate([0, 0, 34.5]) torus(4.7, 0.55);
    for (a = [0, 180])
        color(steel) rotate([0, 0, a]) translate([4.7, -0.8, 26]) cube([1.4, 1.6, 8]);
}

module queen(body, glow) {
    cyber_base(body, glow);
    reactor_stem(body, glow, 28, 3.6);
    color(body) translate([0, 0, 35]) cylinder(h = 5, r1 = 6.5, r2 = 5.2);
    color(glow) translate([0, 0, 39.2]) torus(5.6, 0.7);
    color(body) translate([0, 0, 45]) sphere(r = 5.4);
    for (a = [0:60:300]) {
        color(body) rotate([0, 0, a]) translate([4.8, 0, 43])
            rotate([0, 20, 0]) cylinder(h = 10, r1 = 1.7, r2 = 0.55);
        color(glow) rotate([0, 0, a]) translate([8.1, 0, 52]) sphere(r = 1.15, $fn = 16);
    }
}

module king(body, glow) {
    cyber_base(body, glow);
    reactor_stem(body, glow, 25, 4.0);
    color(body) translate([0, 0, 32]) cylinder(h = 5, r1 = 7, r2 = 5.2);
    color(steel)
        for (a = [0:90:270])
            rotate([0, 0, a]) translate([5.2, -1, 33]) cube([4, 2, 8]);
    color(body) translate([0, 0, 37]) cylinder(h = 10, r1 = 5.0, r2 = 3.3);
    color(glow) translate([0, 0, 44]) torus(4.0, 0.65);
    color(body) translate([-1.5, -1.5, 47]) cube([3, 3, 14]);
    color(body) translate([-6, -1.5, 53]) cube([12, 3, 3]);
    color(glow) translate([0, -1.7, 54.5]) cube([8, 0.8, 1.1], center = true);
    color(glow) translate([0, 0, 61]) sphere(r = 2);
}

module piece(kind, body, glow) {
    if (kind == 0) pawn(body, glow);
    else if (kind == 1) rook(body, glow);
    else if (kind == 2) knight(body, glow);
    else if (kind == 3) bishop(body, glow);
    else if (kind == 4) queen(body, glow);
    else king(body, glow);
}

module army(side) {
    body = side < 0 ? cyan_body : magenta_body;
    glow = side < 0 ? cyan : magenta;
    back_rank = [1, 2, 3, 4, 5, 3, 2, 1];
    for (x = [0:7]) {
        translate([(x - 3.5) * square_size, side * 3.5 * square_size, board_top])
            rotate([0, 0, side < 0 ? 0 : 180]) piece(back_rank[x], body, glow);
        translate([(x - 3.5) * square_size, side * 2.5 * square_size, board_top])
            rotate([0, 0, side < 0 ? 0 : 180]) pawn(body, glow);
    }
}

board();
army(-1);
army(1);
