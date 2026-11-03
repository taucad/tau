# Shelled storage bin

**Who asks:** someone organising a drawer, asking for a printable bin.

**Prompt:** "Create an open-top storage bin 120 × 80 mm and 60 mm tall with 2.5 mm walls and floor. Round the
vertical corners with a 10 mm radius."

**Dimensions and constraints:** outside 120 × 80 × 60; R10 on the four vertical outside edges; shell 2.5 mm inward
with the top face removed, so the inside corners are R7.5 and the cavity is 115 × 75 × 57.5.

**What right looks like:** one solid, open at the top, uniform 2.5 mm walls including around the rounded corners.

**Hand calculation (mm³):**

| Term                                  | Value         |
| ------------------------------------- | ------------- |
| Outside (120·80 − (4 − π)·10²) · 60   | 570 849.55    |
| Cavity (115·75 − (4 − π)·7.5²) · 57.5 | −493 161.08   |
| **Expected volume**                   | **77 688.47** |

## Offline result

1 solid, volume 77 688.47 mm³, area 63 107.85 mm².

Against the hand calculation (77 688.47): -0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
