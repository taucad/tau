# Threaded-looking bolt

**Who asks:** a product designer who needs a visually convincing M10 bolt for a render, not a functional thread.

**Prompt:** "Model an M10 hex bolt for a visual model: 16 mm across flats, 6.4 mm head, 30 mm shank. Make the thread
look real by sweeping a triangular profile along a helix with a 1.5 mm pitch over the shank."

**Dimensions and constraints:** head z ∈ [−6.4, 0], hex 16 across flats; core Ø8.4 for z ∈ [0, 30]; thread ridge a
triangle 1.3 mm wide at the core, 0.75 mm tall (tip at r = 4.95 ≈ M10 major radius), on a helix of radius 4.2,
pitch 1.5, 18 turns (27 mm).

**What right looks like:** one solid; a continuous helical ridge from the head to near the end of the shank.

**Expected volume:** not a simple hand calculation. Estimate: head (√3/2) · 16² · 6.4 = 1 419, core π · 4.2² · 30 =
1 663, ridge (screw-motion Pappus) 0.4875 mm² × 2π · 4.43 × 18 ≈ 244: about 3 330.

## Offline result

1 solid, volume 3 310.59 mm³, area 2 005.94 mm².

Against the rough estimate (3 330): -0.6 %; not held to 1 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
