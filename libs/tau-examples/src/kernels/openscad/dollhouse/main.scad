// ===========================================================================
//  Two-storey gabled DOLLHOUSE
//  Foundation + steps, hollow two-storey shell with gable ends, interior
//  mid-floor, partitions and staircase, framed shuttered windows, panelled
//  front door, pitched roof with ridge cap, and a brick chimney.
// ===========================================================================
include <lib/common.scad>
use <lib/foundation.scad>
use <lib/walls.scad>
use <lib/window.scad>
use <lib/door.scad>
use <lib/roof.scad>
use <lib/chimney.scad>

dollhouse();

module dollhouse() {
    foundation();
    walls();

    // Windows on every facade.
    for (w = front_windows) place_on_face("front", w[0], w[1]) window();
    for (w = back_windows)  place_on_face("back",  w[0], w[1]) window();
    for (w = side_windows) { place_on_face("left",  w[0], w[1]) window();
                             place_on_face("right", w[0], w[1]) window(); }

    // Front door.
    place_on_face("front", 0, 0) door();

    roof();
    chimney();
}
