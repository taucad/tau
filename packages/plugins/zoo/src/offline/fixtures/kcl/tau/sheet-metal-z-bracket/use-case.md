# Sheet-metal Z bracket

**Who asks:** an engineer designing a bent-steel offset bracket to be laser-cut and press-braked.

**Prompt:** "Design a Z bracket in 2 mm sheet steel, 25 mm wide: two 20 mm flanges (flat length) going opposite ways,
joined by a web so the overall height is 30 mm, with a 2 mm inside bend radius at both bends. Put a 5 mm hole in the
middle of each flange."

**Dimensions and constraints:** thickness 2, inside radius 2 (outside 4); profile in XZ: bottom flange x ∈ [−20, 0]
at z ∈ [0, 2], web x ∈ [2, 4], top flange x ∈ [6, 26] at z ∈ [28, 30]; extruded 25 symmetric; holes Ø5 at x = −10
and x = 16.

**What right looks like:** one solid of constant 2 mm thickness everywhere, including through both bends, which a
sheet-metal unfold would accept.

**Hand calculation (mm³):**

| Term                      | Value        |
| ------------------------- | ------------ |
| Flats 20·2 + 22·2 + 20·2  | 124.00 mm²   |
| Bends 2 · π/4 · (4² − 2²) | 18.85 mm²    |
| Extruded 25               | 3 571.24     |
| Holes 2 · π · 2.5² · 2    | −78.54       |
| **Expected volume**       | **3 492.70** |

## Offline result

1 solid, volume 3 492.70 mm³, area 3 941.23 mm².

Against the hand calculation (3 492.70): -0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
