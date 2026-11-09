# 90° pipe elbow

**Who asks:** someone laying out a 1-inch schedule 40 pipe run in a plant model.

**Prompt:** "Make a 90 degree elbow for 1-inch schedule 40 pipe (33.4 mm OD, 26.6 mm ID) with a 50 mm bend radius
and 30 mm straight tangents on both ends. Sweep the pipe section along the centreline."

**Dimensions and constraints:** annulus Ø33.4 / Ø26.6; centreline: 30 mm up +Z, 90° bend of radius 50 towards +X,
30 mm along +X.

**What right looks like:** one hollow solid, ends square to the centreline, the bore open at both ends.

**Hand calculation (mm³):** the annulus is swept perpendicular to the path, so by Pappus the volume is the section
area times the centreline length.

| Term                          | Value         |
| ----------------------------- | ------------- |
| Section π(16.7² − 13.3²)      | 320.44 mm²    |
| Centreline 30 + 30 + π/2 · 50 | 138.54 mm     |
| **Expected volume**           | **44 394.04** |

## Offline result

1 solid, volume 44 394.04 mm³, area 26 755.03 mm².

Against the hand calculation (44 394.04): -0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
