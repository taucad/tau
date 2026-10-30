//! A small multi-file project: a model that uses a gear library and includes a configuration file, plus a part
//! the model does not import yet.

#![allow(dead_code)]

pub const MAIN: &str = r#"use <lib/gears.scad>
include <config.scad>

/* [Size] */
// Plate thickness
thickness = 2; // [1:10]

/**
 * A mounting plate. Pair it with {@link spur_gear}.
 * @param width Plate width
 * @param holes Number of holes
 */
module plate(width = 40, holes = 4) {
  difference() {
    cube([width, width, thickness]);
    for (i = [0:holes - 1]) translate([i * 10, 5, -1]) cylinder(h = thickness + 2, r = hole_radius);
  }
}

plate(width = 60);
spur_gear(teeth = 12);
echo(gear_ratio(12, 24));
"#;

pub const GEARS: &str = r#"/**
 * A spur gear.
 * @param teeth Tooth count
 * @param module_size Gear module
 */
module spur_gear(teeth = 20, module_size = 1) {
  cylinder(h = 5, r = pitch_radius(teeth, module_size));
}

/** Pitch radius of a gear. */
function pitch_radius(teeth, module_size) = teeth * module_size / 2;

function gear_ratio(a, b) = b / a;

gear_secret = 3;
"#;

pub const CONFIG: &str = "// Radius of mounting holes\nhole_radius = 1.5;\n";

pub const BRACKET: &str = "/** An L bracket. */\nmodule bracket(size = 10) { cube(size); }\n";

pub fn project() -> Vec<(&'static str, &'static str)> {
    vec![("main.scad", MAIN), ("lib/gears.scad", GEARS), ("config.scad", CONFIG), ("parts/bracket.scad", BRACKET)]
}
