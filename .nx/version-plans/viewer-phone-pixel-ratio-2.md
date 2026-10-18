---
viewer: patch
---

`@taucad/viewer` caps the drawing buffer at a pixel ratio of 2 on phones and tablets again, as on desktop, instead of 1.5. At 1.5 the model's edges and section outlines looked soft on a 3x screen. The coarse-pointer composer, ambient occlusion and environment tiers are unchanged.
