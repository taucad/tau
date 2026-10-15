// A block with a square hole through it: planar faces only, so every mesher encloses the same volume.
width = 20;
depth = 10;
height = 5;
hole = 4;

difference() {
  translate([-width / 2, -depth / 2, 0]) cube([width, depth, height]);
  translate([3 - hole / 2, -hole / 2, -height]) cube([hole, hole, height * 3]);
}
