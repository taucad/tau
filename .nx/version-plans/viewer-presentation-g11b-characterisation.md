---
viewer: minor
---

Characterise the presentation seams the presentation actor (G11b) moves, on top of G11.0's rows: the replaced scene is freed only after its replacement is committed and attached, an in-place update expands no edges, rebuilds no surface batches and applies no matcap, but keeps an instanced batch and recomputes its box and sphere, the bounds owner polls an empty scene and warns once for non-finite bounds, a measurement carries the kinematics revision it reads at completion and a pose change between picks drops it, a GLB replaced by another artifact of the same file keeps its unit id, the presented unit changes only when a commit lands and survives a failed replacement, and a view keeps a shared manifest only while it presents that GLB. Tests only; no runtime change.
