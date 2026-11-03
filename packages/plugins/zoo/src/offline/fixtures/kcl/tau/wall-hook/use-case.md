# Wall hook

**Who asks:** someone who needs a coat hook for a hallway and wants to print it.

**Prompt:** "Make a wall-mounted coat hook: a 60 mm tall, 5 mm thick back plate, 20 mm wide, with an arm 6 mm thick
coming out 40 mm from the wall at the bottom and curling up into an 18 mm tall tip, outer bend radius 10 mm. Two
4.5 mm screw holes in the back plate at 25 and 50 mm up."

**Dimensions and constraints:** side profile in YZ (y away from the wall, z up), extruded 20 symmetric along X;
back plate y ∈ [0, 5], z ∈ [0, 60]; arm z ∈ [0, 6] to y = 30, quarter bend R10 outside / R4 inside to vertical, tip
y ∈ [34, 40] up to z = 18; holes Ø4.5 along Y at z = 25 and 50.

**What right looks like:** one solid; flat back against the wall; the tip curls upward so a coat loop cannot slide off.

**Hand calculation (mm³):**

| Term                                                          | Value         |
| ------------------------------------------------------------- | ------------- |
| Profile: plate 5·60 + arm 25·6 + bend π/4(10² − 4²) + tip 6·8 | 563.97 mm²    |
| Extruded 20                                                   | 11 279.47     |
| Screw holes 2 · π · 2.25² · 5                                 | −159.04       |
| **Expected volume**                                           | **11 120.43** |

## Offline result

1 solid, volume 11 120.43 mm³, area 5 565.52 mm².

Against the hand calculation (11 120.43): -0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
