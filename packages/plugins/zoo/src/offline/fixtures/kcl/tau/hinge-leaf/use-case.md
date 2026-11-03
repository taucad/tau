# Butt hinge leaf

**Who asks:** a maker building a printed box with a hinged lid who wants one leaf of a two-part hinge.

**Prompt:** "Design one leaf of a 3D-printable butt hinge, 40 mm long along the pin. The leaf is 25 mm wide and 3 mm
thick. It has 5 knuckle positions with 0.5 mm gaps between them; this leaf carries knuckles 1, 3 and 5. Knuckles are
8 mm in diameter around a 3.2 mm pin hole, and the plate stays 0.5 mm clear of the other leaf's knuckles. Add two
4 mm screw holes in the plate."

**Dimensions and constraints:** pin axis along −Y at x = 0, z = 4; knuckle length (40 − 4 · 0.5) / 5 = 7.6, pitch
16.2 between this leaf's knuckles; each knuckle is a Ø8 tube joined to the plate by a 5 × 3 tab; plate x ∈ [4.5, 25],
z ∈ [0, 3], y ∈ [−40, 0]; screw holes Ø4 at (15, −10) and (15, −30).

**What right looks like:** one solid; three knuckles at y ∈ [−7.6, 0], [−23.8, −16.2], [−40, −32.4]; one continuous
pin hole through all three; the gaps between knuckles left open for the mating leaf.

**Hand calculation (mm³):** the tab overlaps the tube; its part outside the tube and short of the plate
(x ∈ [0, 4.5], z ∈ [0, 3], outside the Ø8 circle) is 4.892 mm², found by integrating the circle numerically.

| Term                                            | Value        |
| ----------------------------------------------- | ------------ |
| Plate 20.5 · 3 · 40                             | 2 460.00     |
| Three knuckles 3 · (π(4² − 1.6²) + 4.892) · 7.6 | +1 074.21    |
| Screw holes 2 · π · 2² · 3                      | −75.40       |
| **Expected volume**                             | **3 458.81** |

## Offline result

1 solid, volume 3 458.81 mm³, area 3 041.34 mm².

Against the hand calculation (3 458.81): +0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
