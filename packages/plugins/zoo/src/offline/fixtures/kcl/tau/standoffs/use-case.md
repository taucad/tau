# PCB standoff and spacer

**Who asks:** someone mounting a Raspberry Pi in a case who wants printable M3 hardware.

**Prompt:** "Make an M3 hex standoff, 5.5 mm across flats and 10 mm long with a 2.5 mm tap hole through it, and next
to it a round nylon-style spacer, 6 mm outside, 3.2 mm inside, 5 mm long."

**Dimensions and constraints:** hex standoff at the origin, flats 5.5 (circumradius 5.5/√3), hole Ø2.5 through,
length 10 along Z; round spacer Ø6 / Ø3.2 × 5 at x = 15.

**What right looks like:** two separate solids on the XY plane, both with through holes.

**Hand calculation (mm³):**

| Term                               | Value      |
| ---------------------------------- | ---------- |
| Hex (√3/2 · 5.5² − π · 1.25²) · 10 | 212.88     |
| Spacer π(3² − 1.6²) · 5            | 101.16     |
| **Expected volume**                | **314.04** |

## Offline result

2 solids, volume 314.04 mm³, area 496.62 mm².

Against the hand calculation (314.04): +0.001 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
