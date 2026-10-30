# Pipe flange with bolt circle

**Who asks:** a plant engineer sketching a slip-on flange for a 2-inch line before ordering one.

**Prompt:** "Model a slip-on pipe flange: 165 mm outside diameter, 18 mm thick, with a 61 mm bore for the pipe. Add
a raised hub 90 mm in diameter and 12 mm tall around the bore, and four 18 mm bolt holes equally spaced on a 125 mm
bolt circle."

**Dimensions and constraints:** disc Ø165 × 18; bore Ø61 through disc and hub; hub Ø90 × 12 on the top face;
4 × Ø18 holes on PCD 125, starting on +X.

**What right looks like:** one solid with the hub fused to the disc, the bore running through both, and four
evenly spaced through holes clear of the hub (hub radius 45 < 62.5 − 9 = 53.5).

**Hand calculation (mm³):**

| Term                       | Value          |
| -------------------------- | -------------- |
| Disc π(82.5² − 30.5²) · 18 | 332 288.47     |
| Bolt holes 4 · π · 9² · 18 | −18 321.77     |
| Hub π(45² − 30.5²) · 12    | +41 262.61     |
| **Expected volume**        | **355 229.31** |

## Offline result

1 solid, volume 355 229.31 mm³, area 57 428.31 mm².

Against the hand calculation (355 229.31): -0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
