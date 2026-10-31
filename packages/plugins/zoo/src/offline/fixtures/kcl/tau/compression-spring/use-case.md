# Compression spring

**Who asks:** a mechanism designer placing a return spring in an assembly.

**Prompt:** "Create a compression spring: 1.5 mm wire, 12 mm mean diameter, 8 coils, 30 mm free length."

**Dimensions and constraints:** helix radius 6 about Z, 8 turns over 30 mm, starting on +X; wire section Ø1.5 in
the XZ plane at (6, 0).

**What right looks like:** one solid coil; adjacent coils do not touch (pitch 3.75 > 1.5).

**Hand calculation (mm³):** the section lies in a plane through the axis and is carried by a screw motion, so the
volume is its area times the distance its centroid travels around the axis: π · 0.75² × 2π · 6 × 8 = **532.96**
(the helix's lead only shears the section along the axis, which preserves volume).

## Offline result

1 solid, volume 532.96 mm³, area 1 428.28 mm².

Against the hand calculation (532.96): -0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
