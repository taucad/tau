# Dovetail rail (mirrored half profile)

**Who asks:** a machinist building a sliding stage for a microscope.

**Prompt:** "Make a 100 mm long male dovetail rail. The base is 40 mm wide and 6 mm tall; the dovetail on top is 8 mm
tall, 16 mm wide where it meets the base and 24 mm wide at the top. It's symmetric, so sketch half the profile and
mirror it. Add two 5.5 mm mounting holes straight through the centreline, 25 mm from each end."

**Dimensions and constraints:** half profile on XZ from (0, 0) to (20, 0), (20, 6), (8, 6), (12, 14), (0, 14),
mirrored about the Y (sketch) axis; extruded 100 along −Y; holes Ø5.5 along Z at y = −25 and −75.

**What right looks like:** one solid, symmetric about the YZ plane, with an undercut dovetail and two vertical holes.

**Hand calculation (mm³):**

| Term                                                 | Value         |
| ---------------------------------------------------- | ------------- |
| Profile 2 · (20·6 + (8 + 12)/2 · 8) = 400 mm², × 100 | 40 000.00     |
| Holes 2 · π · 2.75² · 14                             | −665.23       |
| **Expected volume**                                  | **39 334.77** |

## Offline result

1 solid, 39 334.77 mm³, matching the hand calculation. It first failed with the mirror2d gap (G1), closed by #1294.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
