# Lofted vase

**Who asks:** a designer making a printable flower vase.

**Prompt:** "Design a vase by lofting circles: 60 mm across at the base, swelling to 100 mm at 70 mm up, narrowing to
a 50 mm neck at 160 mm, and flaring to a 60 mm lip at 180 mm. Hollow it with 2.5 mm walls, open at the top."

**Dimensions and constraints:** four circular sections on planes z = 0, 70, 160, 180 (Ø60, Ø100, Ø50, Ø60), lofted
smoothly; shelled 2.5 mm inward with the top face removed.

**What right looks like:** one solid with a smooth, curved side, a closed 2.5 mm floor and an open mouth.

**Expected volume:** not a simple hand calculation (the loft interpolates a spline between sections). Estimate from
the wall area: side area ≈ 2π · r̄ · L ≈ 2π · 36 · 185 ≈ 41 800 mm², plus the floor π · 30² ≈ 2 830 mm², times 2.5:
about 111 000.

## Offline result

1 solid, volume 119 623.90 mm³, area 96 200.41 mm².

Against the rough estimate (111 000): +7.8 %; not held to 1 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
