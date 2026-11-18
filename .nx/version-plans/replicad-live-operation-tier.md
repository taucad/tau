---
replicad: minor
---

Replicad keeps the results of recent builds live in the kernel worker while compute reuse is on, so an edit reruns only the operations it reaches. Each Replicad operation is keyed by what it is called on and with, counted by occurrence so a build with the tier delivers the same bytes as one without it; a revisit of a build already seen (same bundle, same parameters) runs no user code. Entries unused for three builds are evicted and deleted, at most 16,384 are kept, and `computeReuse: false` turns the tier off. Uses `@taulabs/replicad` 1.2.0-beta.0, whose operation cache seam the tier installs. The per-operation text B-rep reuse adapter is removed.
