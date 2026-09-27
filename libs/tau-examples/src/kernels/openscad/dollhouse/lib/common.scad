// Shared parameters and placement helpers for the dollhouse.
// `include`d by every component file so variables AND helper modules propagate.

$fa = 2;
$fs = 0.5;
eps = 0.1;

// ---- Core house dimensions (mm) ----
house_w = 240;          // width  (X)
house_d = 170;          // depth  (Y)
wall_t  = 8;            // exterior wall thickness
floor_h = 130;          // interior storey height
mid_t   = 8;            // mid-floor slab thickness
wall_height = floor_h * 2 + mid_t;   // 268
half_depth  = house_d / 2;           // 85

// ---- Roof ----
gable_rise = 95;
ridge_z    = wall_height + gable_rise;   // 363
over_x     = 18;        // gable-end overhang
over_y     = 18;        // eave overhang
roof_w     = house_w + 2 * over_x;       // 276
roof_t     = 9;
ridge_r    = 7;
theta      = atan(gable_rise / half_depth);
panel_len  = (half_depth + over_y) / cos(theta);

// ---- Foundation ----
foundation_h    = 18;
foundation_over = 14;

// ---- Windows ----
win_w   = 42;
win_h   = 58;
frame_w = 6;
frame_t_out = 5;        // how far trim/frame protrudes outside
mull_w  = 3;
ground_z = 67;          // window centre, ground floor
upper_z  = 201;         // window centre, upper floor

// ---- Door ----
door_w = 56;
door_h = 104;

// ---- Chimney ----
chimney_w   = 26;
chimney_d   = 22;
chimney_x   = -72;
chimney_y   = 38;
chimney_base_z = 250;
chimney_top = ridge_z + 40;   // 403

// ---- Window / opening placement lists [u, z_centre] ----
front_windows = [[-80, ground_z], [80, ground_z],
                 [-80, upper_z], [0, upper_z], [80, upper_z]];
back_windows  = [[-80, ground_z], [80, ground_z],
                 [-80, upper_z], [80, upper_z]];
side_windows  = [[-40, ground_z], [40, ground_z],
                 [-40, upper_z], [40, upper_z]];

// ---- Colours ----
col_wall    = "#F2E7CE";
col_roof    = "#9B3B2E";
col_trim    = "#FBFBF7";
col_door    = "#3C5A78";
col_found   = "#9A968E";
col_glass   = "#AFC9DE";
col_chimney = "#A14B36";
col_shutter = "#46603F";
col_stair   = "#C8A97E";

// ---- Helpers ----------------------------------------------------------

// Position children flush against a given exterior face, local +Y = outward.
module place_on_face(face, u, z) {
    if (face == "front")
        translate([u, half_depth, z]) children();
    else if (face == "back")
        translate([u, -half_depth, z]) rotate([0, 0, 180]) children();
    else if (face == "left")
        translate([-house_w / 2, u, z]) rotate([0, 0, 90]) children();
    else
        translate([house_w / 2, u, z]) rotate([0, 0, -90]) children();
}

// Solid that pierces a wall to make a window/door opening.
module opening_cut(face, u, z, w, h) {
    if (face == "front")
        translate([u, half_depth - wall_t / 2, z])
            cube([w, wall_t + 4, h], center = true);
    else if (face == "back")
        translate([u, -(half_depth - wall_t / 2), z])
            cube([w, wall_t + 4, h], center = true);
    else if (face == "left")
        translate([-(house_w / 2 - wall_t / 2), u, z])
            cube([wall_t + 4, w, h], center = true);
    else
        translate([house_w / 2 - wall_t / 2, u, z])
            cube([wall_t + 4, w, h], center = true);
}
