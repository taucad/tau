# Bearing boss plate (sketch on face)

**Who asks:** someone building a small gantry who needs a plate carrying a 12 mm shaft.

**Prompt:** "Make an 80 × 50 × 10 mm base plate. On its top face, add a round boss 30 mm in diameter and 15 mm
tall in the centre. Then, sketching on top of the boss, cut a 12 mm bore 20 mm deep. Also cut two 5.5 mm mounting
holes through the plate, 30 mm either side of the centre, sketched on the plate's top face."

**Dimensions and constraints:** plate centred on the origin, z ∈ [0, 10]; boss Ø30 to z = 25; blind bore Ø12 from
z = 25 down to z = 5; holes Ø5.5 at (±30, 0) through the plate. Every feature after the plate is sketched on a face of
the part, not on a datum plane.

**What right looks like:** one solid; the bore stops 5 mm above the bottom; the holes go through.

**Hand calculation (mm³):**

| Term                     | Value         |
| ------------------------ | ------------- |
| Plate 80·50·10           | 40 000.00     |
| Boss π · 15² · 15        | +10 602.88    |
| Bore π · 6² · 20         | −2 261.95     |
| Holes 2 · π · 2.75² · 10 | −475.17       |
| **Expected volume**      | **47 865.76** |

## Offline result

1 solid, volume 47 865.76 mm³, area 13 018.24 mm².

Against the hand calculation (47 865.76): +0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
