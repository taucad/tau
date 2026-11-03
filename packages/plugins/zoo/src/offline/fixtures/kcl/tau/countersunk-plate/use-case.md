# Plate with countersunk holes

**Who asks:** someone making a cover plate that must sit flush against a mating part.

**Prompt:** "Make a 100 × 60 × 6 mm mounting plate with four countersunk holes for M4 flat-head screws (4.5 mm
clearance hole, 8.4 mm countersink at 90°), 10 mm in from each edge, so the screw heads sit flush."

**Dimensions and constraints:** plate centred, z ∈ [0, 6]; holes through at (±40, ±20); countersink Ø8.4 at the top
face, 90° included, depth (8.4 − 4.5)/2 = 1.95.

**Note on `hole::holes`:** its docs say `cutAt` is in global coordinates, but `holeGeometry` sketches on a plane
normal to the face, aligned with −Y, offset along X by `cutAt[1]` and shifted by `−cutAt[0]`; on a top face the hole
lands at (−cutAt[1], cutAt[0]). Written as `[x, y]`, the corner holes fell off the 60 mm wide plate and the plate came
out whole (36 000 mm³). The vendored `samples/countersunk-plate` uses `[0, ±boltSpacing/2]` for holes along X and
agrees with Zoo's oracle, so the offline engine follows Zoo here; the fixture lists its points as `[y, x]`.

**What right looks like:** one solid; four through holes with conical seats at the top face.

**Hand calculation (mm³):**

| Term                                                                       | Value         |
| -------------------------------------------------------------------------- | ------------- |
| Plate 100·60·6                                                             | 36 000.00     |
| Holes 4 · π · 2.25² · 6                                                    | −381.70       |
| Countersinks 4 · (π·1.95/3 · (4.2² + 4.2·2.25 + 2.25²) − π · 2.25² · 1.95) | −138.58       |
| **Expected volume**                                                        | **35 479.72** |

## Offline result

1 solid, volume 35 479.72 mm³, area 14 087.26 mm².

Against the hand calculation (35 479.72): +0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
