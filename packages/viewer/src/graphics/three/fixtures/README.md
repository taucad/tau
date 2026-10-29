# Planetary regression fixture

`planetary.glb` is the user's supplied native Build123d planetary assembly, from
`b123d-planetary.zip`, used with permission for this rendering investigation.
SHA-256: `7ffb9e08bd07eab38e853c5ed0684223012737616297d5bc003e4aa3531a5585`.

The model has 34 surface meshes, 73,720 surface triangles and 31,539 line segments.
It is the F8 calibration fixture. The production-composition regression fixes its
orthographic camera and evaluates the front ring's continuous rim at a 5120×2880
buffer. Geometry, authored PBR materials and topology are unmodified.

## Deployed planetary depth regression

`planetary-depth-repro.glb` is the user's SMLib Planetary Gear System exported from
the failing deployed view on 2026-10-26 (`Planetary Gear System (3).glb`). It is
retained with the user's authorization to fix and test that regression.
SHA-256: `81c72606ac65efa533ef62a11bada39e8dc31d7491c7ffa808f9ef9cfc50aa4d`.

The fixture retains the original GLB geometry and materials. The ownership test
replaces materials with distinct unlit IDs and disables frustum culling to isolate
depth from lighting, AO and culling. It uses the reported camera pose and clip
interval, compares against a well-conditioned interval at the same pose, and
checks flat interiors strictly while excluding one-pixel material boundaries.
It is separate from the earlier Build123d appearance fixture.
