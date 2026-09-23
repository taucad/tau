// Beautiful Vase - Parametric Design
// Adaptive tessellation for smooth curves
$fa = 2;
$fs = 0.4;

// Import variant
use <lib/vase_variant.scad>

// ===== Parameters =====
vase_height = 200;
base_diameter = 100;
belly_diameter = 124;
belly_height = 90;
neck_diameter = 60;
neck_height = 185;
rim_diameter = 100;
wall_thickness = 4;

// ===== Profile Points =====
// Define the outer profile as a smooth curve
// Points from base to rim (half profile, will be revolved)

function outer_profile() = [
    // Base contact point
    [base_diameter/2, 0],
    // Base transition (slight flare)
    [base_diameter/2 + 3, 5],
    // Rising to belly - quadratic curve approximation
    [base_diameter/2 + 10, 20],
    [belly_diameter/2 - 5, 45],
    // Belly maximum
    [belly_diameter/2, belly_height],
    // Tapering to neck - elegant S-curve
    [belly_diameter/2 - 8, 110],
    [neck_diameter/2 + 5, 140],
    // Neck
    [neck_diameter/2, neck_height],
    // Flared rim
    [neck_diameter/2 + 8, neck_height + 15],
    [rim_diameter/2, vase_height],
];

// Compute inner profile with true perpendicular offset for uniform wall thickness
function compute_inner_profile(pts, thickness) = [
    // For each point, offset inward along the normal to the curve
    for (i = [0 : len(pts)-1])
        let (
            p = pts[i],
            // Use adjacent points for tangent (or edge tangents at endpoints)
            p0 = (i > 0) ? pts[i-1] : [2*pts[0].x - pts[1].x, 2*pts[0].y - pts[1].y],
            p1 = (i < len(pts)-1) ? pts[i+1] : [2*pts[len(pts)-1].x - pts[len(pts)-2].x, 2*pts[len(pts)-1].y - pts[len(pts)-2].y],
            // Tangent vector
            dx = p1.x - p0.x,
            dy = p1.y - p0.y,
            // Inward normal (pointing toward axis for right-side profile)
            len = sqrt(dx*dx + dy*dy),
            nx = -dy / len,
            ny = dx / len,
            // Offset point
            ox = p.x + nx * thickness,
            oy = p.y + ny * thickness
        )
        [ox, oy]
];

function inner_profile() = compute_inner_profile(outer_profile(), wall_thickness);

// ===== Modules =====

module outer_body() {
    // Solid outer body
    rotate_extrude(angle = 360, $fn = 120) {
        polygon(outer_profile());
    }
}

module inner_void() {
    // Inner void for shelling - creates the hollow cavity
    // The void starts at floor_height to leave solid material at the base
    floor_height = 3; // solid base thickness
    
    rotate_extrude(angle = 360, $fn = 120) {
        // Build inner cavity polygon starting from floor level
        inner_pts = inner_profile();
        h_top = outer_profile()[len(outer_profile())-1].y;
        
        // Find the first point at or above floor_height
        // Cavity polygon: center axis, floor, inner wall points above floor, top cap
        cavity_polygon = concat(
            [[0, floor_height]],
            [for (i = [0 : len(inner_pts)-1]) if (inner_pts[i].y >= floor_height) inner_pts[i]],
            [[0, h_top + 1], [0, floor_height]]
        );
        polygon(cavity_polygon);
    }
}

module vase_profile() {
    // Create hollow vase with uniform wall thickness
    floor_thickness = 3; // solid base
    
    difference() {
        // Outer solid body
        rotate_extrude(angle = 360, $fn = 120) {
            polygon(outer_profile());
        }
        
        // Inner cavity - horizontal offset, starts above base
        translate([0, 0, floor_thickness]) {
            rotate_extrude(angle = 360, $fn = 120) {
                pts = outer_profile();
                h_top = pts[len(pts)-1].y;
                
                // Cavity: start at axis, go to first offset point, follow profile, close at top
                cavity_pts = [
                    [0, 0],
                    for (i = [0 : len(pts)-1]) [pts[i].x - wall_thickness, pts[i].y],
                    [0, h_top],
                    [0, 0]
                ];
                
                polygon(cavity_pts);
            }
        }
    }
}

module base_ring() {
    // Stable base - solid frustrum that is already part of vase_profile
    // No separate module needed - base is formed by the outer profile
}

// ===== Main Assembly =====
color("#E8D5C4") {
    vase_profile();
}