# Spur gear

**Who asks:** a robotics student replacing a stripped gear in a gearbox.

**Prompt:** "I need a spur gear with 24 teeth, module 2, 20° pressure angle, 10 mm face width, with an 8 mm bore
for the motor shaft and a flat for a set screw: make the bore a D shape with the flat 0.5 mm in from the circle."

**Dimensions and constraints:** pitch diameter 48 mm, outside diameter 52 mm, root diameter 43 mm; face width 10;
D bore Ø8 with the flat at 3.5 mm from the axis.

**What right looks like:** one solid, 24 involute teeth, centred on the origin, with the D bore through.

**Expected volume:** not a simple hand calculation (involute flanks). Bounds: between the root cylinder
π · 21.5² · 10 = 14 522 and the tip cylinder π · 26² · 10 = 21 237, less the bore (≈ 491). The pitch-cylinder estimate
π · 24² · 10 − 491 ≈ 17 605 should be within a few percent.

## Offline result

1 solid, volume 17 686.63 mm³, area 6 503.68 mm².

Against the rough estimate (17 605): +0.5 %; not held to 1 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
