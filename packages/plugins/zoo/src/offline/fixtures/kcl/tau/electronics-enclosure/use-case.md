# Electronics enclosure with lid

**Who asks:** a hobbyist boxing up a small sensor board.

**Prompt:** "Make me a 3D-printable enclosure for a 60 × 40 mm PCB. Inside should be 70 × 50 mm and 25 mm deep, with
2 mm walls and floor. Put four M3 screw bosses in the corners, 6 mm outside diameter with a 2.5 mm pilot hole, 20 mm
tall, centred 5 mm in from the inside walls. Then a 2 mm lid with a 3 mm locating lip that fits inside the box with
0.2 mm clearance, and 3.4 mm clearance holes over the bosses. Lay the lid next to the box for printing."

**Dimensions and constraints:**

- Box: outside 74 × 54 × 27, shelled 2 mm with the top open; cavity 70 × 50 × 25.
- Bosses: 4 × Ø6 / Ø2.5 tubes standing 20 mm on the floor at (±30, ±20).
- Lid: 74 × 54 × 2 plate; lip ring outside 69.6 × 49.6, 2 mm wall, 3 mm tall; 4 × Ø3.4 holes at the boss positions.
  Placed 90 mm along +X.

**What right looks like:** two solids. The bosses are fused to the floor and their pilot holes stop at the floor. The
lid's holes line up with the bosses when it is flipped onto the box.

**Hand calculation (mm³):**

| Term                                | Value                                       |
| ----------------------------------- | ------------------------------------------- |
| Box shell 74·54·27 − 70·50·25       | 20 392.00                                   |
| Bosses 4 · π(3² − 1.25²) · 20       | +1 869.25                                   |
| Lid plate 74·54·2 − 4·π·1.7²·2      | 7 919.37                                    |
| Lid lip (69.6·49.6 − 65.6·45.6) · 3 | +1 382.40                                   |
| **Expected volume**                 | **31 563.01** (box 22 261.25, lid 9 301.77) |

## Offline result

2 solids, volume 31 563.01 mm³, area 32 939.50 mm².

Against the hand calculation (31 563.01): +0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
