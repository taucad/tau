# Screw-down cable clip

**Who asks:** someone tidying a 6 mm power cable along a desk underside.

**Prompt:** "Make a screw-down cable clip for a 6 mm cable: a closed loop with a 6.2 mm inside diameter and 1.6 mm
wall sitting on a flat 28 mm long, 1.6 mm thick tab, 8 mm wide, with a 3.5 mm screw hole 10 mm either side of the
loop."

**Dimensions and constraints:** profile in XY extruded 8 along Z; tab x ∈ [−14, 14], y ∈ [0, 1.6]; loop centred at
(0, 4.7), inner radius 3.1, outer 4.7; screw holes Ø3.5 along Y at x = ±10, z = 4.

**What right looks like:** one solid; the loop and tab are fused; the screw holes go through the tab perpendicular to
the mounting face.

**Hand calculation (mm³):**

| Term                                                | Value      |
| --------------------------------------------------- | ---------- |
| Tab 28 · 1.6 · 8                                    | 358.40     |
| Loop π(4.7² − 3.1²) · 8                             | +313.66    |
| Loop segment inside the tab (r 4.7, height 1.6) · 8 | −62.70     |
| Screw holes 2 · π · 1.75² · 1.6                     | −30.79     |
| **Expected volume**                                 | **578.57** |

## Offline result

1 solid, volume 578.57 mm³, area 894.23 mm².

Against the hand calculation (578.57): +0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
