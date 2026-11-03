# Swept drawer handle

**Who asks:** someone refitting kitchen drawers who wants printed bar pulls.

**Prompt:** "Model a bar pull handle for 128 mm hole spacing, made from 10 mm round bar. It should stand 30 mm off
the drawer front, with 10 mm bend radii, and have 10 mm deep 3.3 mm pilot holes in both feet for M4 screws."

**Dimensions and constraints:** centreline in XZ: from (0, 0) up 20, R10 bend, 108 along X, R10 bend, down 20 to
(128, 0); rod Ø10; pilot holes Ø3.3 × 10 up into each foot.

**What right looks like:** one solid U-shaped bar, feet flat on z = 0, 30 mm to the top of the centreline, holes on
the foot axes.

**Hand calculation (mm³):**

| Term                                             | Value         |
| ------------------------------------------------ | ------------- |
| Centreline 20 + 108 + 20 + 2 · (π/2 · 10)        | 179.42 mm     |
| Rod π · 5² · 179.42 (Pappus; 5 < 10 bend radius) | 14 091.29     |
| Pilot holes 2 · π · 1.65² · 10                   | −171.06       |
| **Expected volume**                              | **13 920.23** |

## Offline result

1 solid, volume 13 920.23 mm³, area 6 000.94 mm².

Against the hand calculation (13 920.23): +0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
