// ============================================================================
// Taj Mahal — parametric architectural replica
// Units: meters. Origin: center of plinth, z = 0 at ground.
// ============================================================================

$fn = 128;
$fa=96;

// ---------- Palette --------------------------------------------------------
c_marble    = "#F4EFE6";
c_marble_d  = "#E8E0D2";
c_sandstone = "#B86A4A";
c_gold      = "#D9A441";
c_shadow    = "#1B1410";

// ---------- Dimensions ----------------------------------------------------
sandstone_w   = 100;
sandstone_h   =  3;

plinth_w      = 95;
plinth_h      =  7;

body_side     = 57;
body_chamfer  = 17;            // length cut off each corner edge
body_h        = 25;

drum_d        = 22;
drum_h        =  7;

dome_rmax     = 11;            // max radius of onion bulge
dome_h        = 17;

finial_h      = 12;

minaret_h     = 41;
minaret_base  =  5;
minaret_top   =  3.4;
minaret_off   = 45;            // distance from center to minaret axis

chhatri_d     = 9;
chhatri_h     = 8;
chhatri_off   = 19;            // from center to chhatri axis (on roof)

// ============================================================================
// Reusable profiles
// ============================================================================

// Pointed (Persian / ogive) arch as 2D polygon, base on x-axis, apex at +z.
module pointed_arch_2d(w, h, point_frac = 0.42) {
    ph = h * point_frac;        // pointed-top portion
    bh = h - ph;                // straight rectangular portion
    polygon([
        [-w/2, 0],
        [ w/2, 0],
        [ w/2, bh],
        [ w/2 * 0.96, bh + ph * 0.30],
        [ w/2 * 0.85, bh + ph * 0.55],
        [ w/2 * 0.65, bh + ph * 0.76],
        [ w/2 * 0.40, bh + ph * 0.90],
        [ w/2 * 0.18, bh + ph * 0.97],
        [ 0,           h],
        [-w/2 * 0.18, bh + ph * 0.97],
        [-w/2 * 0.40, bh + ph * 0.90],
        [-w/2 * 0.65, bh + ph * 0.76],
        [-w/2 * 0.85, bh + ph * 0.55],
        [-w/2 * 0.96, bh + ph * 0.30],
        [-w/2, bh]
    ]);
}

// Onion-dome solid via rotate_extrude.  rmax = bulge radius, h = total height.
module onion_dome(rmax, h) {
    rotate_extrude($fn = 96)
        polygon([
            [0,           0],
            [rmax * 0.86, 0],
            [rmax * 0.96, h * 0.08],
            [rmax * 1.00, h * 0.22],
            [rmax * 0.99, h * 0.35],
            [rmax * 0.92, h * 0.50],
            [rmax * 0.78, h * 0.62],
            [rmax * 0.60, h * 0.74],
            [rmax * 0.40, h * 0.84],
            [rmax * 0.22, h * 0.92],
            [rmax * 0.08, h * 0.98],
            [0,           h]
        ]);
}

// Gilded multi-tier finial (kalash spire) — single rotate_extrude profile.
module finial(h) {
    // Profile is a sequence of [r, z] points forming the silhouette of
    // the spire from base to apex; rotate_extrude turns it into one solid.
    rotate_extrude($fn = 48)
        polygon([
            // base pole (slightly tapered)
            [0.00, 0.000 * h],
            [0.30, 0.000 * h],
            [0.28, 0.110 * h],
            // first kalash bulb (lower, larger)
            [0.55, 0.130 * h],
            [0.95, 0.180 * h],
            [0.95, 0.235 * h],
            [0.55, 0.285 * h],
            // mid pole
            [0.22, 0.300 * h],
            [0.22, 0.395 * h],
            // second kalash bulb (smaller)
            [0.45, 0.410 * h],
            [0.72, 0.450 * h],
            [0.72, 0.500 * h],
            [0.45, 0.540 * h],
            [0.18, 0.555 * h],
            // upper pole
            [0.18, 0.700 * h],
            // top bulb
            [0.35, 0.715 * h],
            [0.50, 0.745 * h],
            [0.50, 0.785 * h],
            [0.35, 0.815 * h],
            [0.13, 0.830 * h],
            // crescent stem
            [0.13, 0.910 * h],
            // final cone to apex
            [0.18, 0.920 * h],
            [0.00, 1.000 * h]
        ]);
}

// ============================================================================
// Components
// ============================================================================

// Two-tier base: red sandstone terrace + white marble chabutra.
module base_platform() {
    color(c_sandstone)
        translate([-sandstone_w/2, -sandstone_w/2, 0])
            cube([sandstone_w, sandstone_w, sandstone_h]);
    color(c_marble)
        translate([-plinth_w/2, -plinth_w/2, sandstone_h])
            cube([plinth_w, plinth_w, plinth_h]);
    // Decorative cornice line on plinth
    color(c_marble_d)
        translate([-plinth_w/2 - 0.1, -plinth_w/2 - 0.1, sandstone_h + plinth_h - 0.6])
            cube([plinth_w + 0.2, plinth_w + 0.2, 0.6]);
}

// Octagonal main body with iwan recesses on all 8 faces.
module mausoleum_body() {
    h2  = body_side / 2;
    c   = body_chamfer;

    // Octagonal plan (chamfered square)
    octagon = [
        [ h2,    h2 - c],
        [ h2 - c, h2   ],
        [-h2 + c, h2   ],
        [-h2,    h2 - c],
        [-h2,   -h2 + c],
        [-h2 + c,-h2   ],
        [ h2 - c,-h2   ],
        [ h2,   -h2 + c]
    ];

    // Distance to chamfered (diagonal) face midpoint
    d_diag = (h2 - c/2) * sqrt(2);

    z0 = sandstone_h + plinth_h;        // body sits on plinth
    pishtaq_w   = 18;
    pishtaq_h   = body_h * 0.85;
    pishtaq_z   = body_h * 0.05;
    pishtaq_dep = 4.5;

    diag_w  = 9;
    diag_h_low  = body_h * 0.42;
    diag_h_high = body_h * 0.42;
    diag_dep = 3.0;

    translate([0, 0, z0])
    color(c_marble)
    difference() {
        // Solid octagonal prism
        linear_extrude(body_h) polygon(octagon);

        // ---------- Cardinal pishtaqs (4) -----------------------------
        for (a = [0, 90, 180, 270])
            rotate([0, 0, a])
                translate([h2 - pishtaq_dep + 0.01, 0, pishtaq_z])
                    rotate([90, 0, 90])
                        linear_extrude(pishtaq_dep + 0.5)
                            pointed_arch_2d(pishtaq_w, pishtaq_h, 0.42);

        // ---------- Diagonal niches (4 chamfered faces) ----------------
        // Each niche: two stacked smaller pointed arches.
        for (a = [45, 135, 225, 315])
            rotate([0, 0, a]) {
                // lower niche
                translate([d_diag - diag_dep + 0.01, 0, body_h * 0.06])
                    rotate([90, 0, 90])
                        linear_extrude(diag_dep + 0.5)
                            pointed_arch_2d(diag_w, diag_h_low, 0.40);
                // upper niche
                translate([d_diag - diag_dep + 0.01, 0, body_h * 0.55])
                    rotate([90, 0, 90])
                        linear_extrude(diag_dep + 0.5)
                            pointed_arch_2d(diag_w, diag_h_high, 0.40);
            }
    }

    // Pishtaq frames (raised rectangular outline around each cardinal arch)
    for (a = [0, 90, 180, 270])
        rotate([0, 0, a])
            translate([h2, 0, z0])
                color(c_marble_d) {
                    fw = pishtaq_w + 5;
                    fh = pishtaq_h + 3;
                    fz = pishtaq_z - 1.5;
                    // Outer frame slab projecting from the face
                    translate([-0.6, -fw/2, fz])
                        cube([1.4, fw, fh]);
                    // Decorative top kanguras (battlement-like merlons)
                    for (i = [-2, -1, 0, 1, 2])
                        translate([-0.6, i * (fw/6), fz + fh])
                            cube([1.4, fw/8, 1.2]);
                }

    // Cornice band on top of body
    color(c_marble_d)
        translate([0, 0, z0 + body_h - 0.5])
            linear_extrude(0.7)
                offset(r = 0.4) polygon(octagon);
}

// Drum + central onion dome + finial.
module central_dome_assembly() {
    z0 = sandstone_h + plinth_h + body_h;

    // Drum (cylindrical base for dome)
    color(c_marble)
        translate([0, 0, z0])
            cylinder(h = drum_h, d = drum_d);
    // Drum cornice
    color(c_marble_d)
        translate([0, 0, z0 + drum_h - 0.4])
            cylinder(h = 0.5, d = drum_d + 0.6);

    // Onion dome
    color(c_marble)
        translate([0, 0, z0 + drum_h])
            onion_dome(dome_rmax, dome_h);

    // Finial
    color(c_gold)
        translate([0, 0, z0 + drum_h + dome_h])
            finial(finial_h);
}

// Small domed pavilion (chhatri).
module chhatri(d, h) {
    col_n  = 8;
    base_h = 0.6;
    col_h  = h * 0.42;
    cap_h  = 0.5;
    dome_r = d * 0.42;
    dome_part_h = h * 0.45;

    color(c_marble) {
        // base ring
        cylinder(h = base_h, d = d);
        // columns
        for (i = [0 : col_n - 1]) {
            a = i * 360 / col_n;
            translate([d * 0.40 * cos(a), d * 0.40 * sin(a), base_h])
                cylinder(h = col_h, d = d * 0.09);
        }
        // ceiling slab
        translate([0, 0, base_h + col_h])
            cylinder(h = cap_h, d = d * 1.05);
        // little onion dome
        translate([0, 0, base_h + col_h + cap_h])
            onion_dome(dome_r, dome_part_h);
    }
    color(c_gold)
        translate([0, 0, base_h + col_h + cap_h + dome_part_h])
            finial(h * 0.22);
}

// Four chhatris around the central dome (on roof of body).
module chhatris() {
    z_roof = sandstone_h + plinth_h + body_h;
    for (a = [45, 135, 225, 315])
        rotate([0, 0, a])
            translate([chhatri_off, 0, z_roof])
                chhatri(chhatri_d, chhatri_h);
}

// Tapered minaret with three balcony rings and chhatri crown.
module minaret() {
    h  = minaret_h;
    rb = minaret_base / 2;
    rt = minaret_top  / 2;

    // taper profile (rotate_extrude)
    color(c_marble)
        rotate_extrude($fn = 48)
            polygon([
                [0,            0],
                [rb,           0],
                [rb * 0.94,    h * 0.30],
                [rb * 0.86,    h * 0.55],
                [rb * 0.78,    h * 0.80],
                [rt,           h],
                [0,            h]
            ]);

    // Balcony rings
    for (zfrac = [0.30, 0.55, 0.80]) {
        zr = h * zfrac;
        rr = rb * (zfrac == 0.30 ? 0.94 :
                   zfrac == 0.55 ? 0.86 : 0.78);
        color(c_marble_d)
            translate([0, 0, zr - 0.25])
                cylinder(h = 0.7, d = rr * 2 + 1.4);
        color(c_shadow)
            translate([0, 0, zr - 0.05])
                cylinder(h = 0.15, d = rr * 2 + 1.5);
    }

    // Crown chhatri
    translate([0, 0, h])
        chhatri(rt * 2.6, 4.5);
}

module minarets() {
    z0 = sandstone_h + plinth_h;
    for (sx = [-1, 1])
        for (sy = [-1, 1])
            translate([sx * minaret_off, sy * minaret_off, z0])
                minaret();
}

// ============================================================================
// Assembly
// ============================================================================

base_platform();
mausoleum_body();
central_dome_assembly();
chhatris();
minarets();