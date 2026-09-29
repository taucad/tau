// Vase Variant - Squared Profile with Geometric Pattern
// Distinctive angular silhouette with cutout pattern

$fa = 2;
$fs = 0.4;

// Parameters
vase_height = 180;
base_diameter = 90;
belly_diameter = 110;
neck_diameter = 55;
rim_diameter = 70;
wall_thickness = 4;
base_height = 15;

// Squared profile with chamfered corners
module vase_variant() {
    difference() {
        // Outer shell
        hull() {
            // Base ring
            translate([0, 0, 0])
                cylinder(h = base_height, r = base_diameter / 2, $fn = 8);
            
            // Belly (widest point at 35% height)
            translate([0, 0, vase_height * 0.35])
                cylinder(h = 10, r = belly_diameter / 2, $fn = 8);
            
            // Neck transition
            translate([0, 0, vase_height * 0.75])
                cylinder(h = 10, r = neck_diameter / 2, $fn = 8);
            
            // Rim
            translate([0, 0, vase_height - 2])
                cylinder(h = 2, r = rim_diameter / 2, $fn = 8);
        }
        
        // Inner cavity
        translate([0, 0, base_height]) {
            hull() {
                // Cavity starts above base
                translate([0, 0, 0])
                    cylinder(h = 5, r = (base_diameter / 2) - wall_thickness, $fn = 8);
                
                // Belly cavity
                translate([0, 0, (vase_height * 0.35) - base_height])
                    cylinder(h = 10, r = (belly_diameter / 2) - wall_thickness, $fn = 8);
                
                // Neck cavity
                translate([0, 0, (vase_height * 0.75) - base_height])
                    cylinder(h = 10, r = (neck_diameter / 2) - wall_thickness + 1, $fn = 8);
                
                // Rim cavity
                translate([0, 0, vase_height - base_height - 5])
                    cylinder(h = 5, r = (rim_diameter / 2) - wall_thickness + 1, $fn = 8);
            }
        }
        
        // Decorative cutouts - vertical slots
        for (i = [0:7]) {
            rotate([0, 0, i * 45])
                translate([belly_diameter / 2 - wall_thickness - 1, 0, vase_height * 0.5])
                    cube([15, 8, vase_height * 0.25], center = true);
        }
    }
    
    // Decorative band at belly
    translate([0, 0, vase_height * 0.35]) {
        difference() {
            cylinder(h = 6, r = belly_diameter / 2 + 1, $fn = 8);
            cylinder(h = 6.5, r = belly_diameter / 2 - wall_thickness + 1, $fn = 8);
        }
    }
}

// Top-level invocation for standalone render
vase_variant();
