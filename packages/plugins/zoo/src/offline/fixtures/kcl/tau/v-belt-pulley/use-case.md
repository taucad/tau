# V-belt pulley (revolve)

**Who asks:** someone rebuilding a bench grinder drive with an A-section V-belt.

**Prompt:** "Design a V-belt pulley for an A-section belt: 80 mm outside diameter, 20 mm wide, one groove with a 40°
included angle, 13 mm wide at the top and 11 mm deep, centred on the width. Bore 12 mm, with a 24 mm hub sticking
out 8 mm on one side. Revolve it from a half section."

**Dimensions and constraints:** half section in XY (x = radius, y = axial), revolved 360° about Y. Rim r = 40 for
y ∈ [0, 20]; groove from r = 40 to r = 29, 13 mm wide at the rim, 4.99 mm at the floor, centred at y = 10; bore
r = 6; hub r = 12 for y ∈ [−8, 0].

**What right looks like:** one solid of revolution; the groove flanks make 20° to the radial plane.

**Hand calculation (mm³):** section vertices (6, −8), (12, −8), (12, 0), (40, 0), (40, 3.5), (29, 7.504),
(29, 12.496), (40, 16.5), (40, 20), (6, 20); Pappus, 2π · x̄ · A with x̄ and A from the shoelace formula:
**79 024.58**.

## Offline result

1 solid, volume 79 024.58 mm³, area 19 229.68 mm².

Against the hand calculation (79 024.58): +0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
