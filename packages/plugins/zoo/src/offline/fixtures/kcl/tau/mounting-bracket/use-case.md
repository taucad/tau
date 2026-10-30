# Mounting bracket

**Who asks:** a maker fitting a 3D-printer accessory to an aluminium extrusion frame.

**Prompt:** "Design an L-shaped mounting bracket, 4 mm thick and 50 mm wide. The vertical leg is 60 mm tall and the
horizontal leg 40 mm deep. Put two 5.5 mm holes for M5 screws in each leg, 12.5 mm in from each side; the holes in the
base sit 22 mm from the back face and those in the upright 35 mm up. Add a 6 mm fillet on the inside of the bend so it
doesn't crack, and round the four free corners with 5 mm."

**Dimensions and constraints:**

- Profile: L of 4 mm stock, base 40 mm, upright 60 mm (outside dimensions), extruded 50 mm.
- Holes: 4 × Ø5.5 through, on the leg centrelines 12.5 mm from each side.
- Fillets: R6 on the inside bend edge; R5 on the four corners of the free ends (in the plane of each leg).

**What right looks like:** one solid; the inner bend is a concave R6 blend running the full 50 mm; each leg's free end
is rounded in plan; the holes go through and do not touch the fillets.

**Hand calculation (mm³):**

| Term                                            | Value         |
| ----------------------------------------------- | ------------- |
| L profile (40 × 4 + 4 × 56) × 50                | 19 200.00     |
| Inside fillet adds (6² − π·6²/4) × 50           | +386.28       |
| Four corner rounds remove 4 × (5² − π·5²/4) × 4 | −85.84        |
| Four holes π · 2.75² · 4 each                   | −380.13       |
| **Expected volume**                             | **19 120.31** |

## Offline result

Fails offline: `engine: command Solid3dCutEdges resulted in errors: Unknown edge <id>`.

The second `fillet` call on the same body fails; the KCL is right: with the bend fillet removed, the corner fillets and holes build 18 734.03 mm³, exactly 19 200 − 85.84 − 380.13. Pinned gap, category G2 (later fillet or chamfer edges).

Expected once the gap closes: 19 120.31 mm³.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
