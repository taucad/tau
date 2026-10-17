# Parametric mounting plate

An original Tau example (Apache-2.0) for the SMLib kernel (`@classcad/smlibwasm`, smlibpy's API on the SMLib NURBS kernel). It is the SMLib "hello world": a box on the XY plane, its vertical edges filleted, a `GridLocations` pattern of cylinders cut through it and the top edges softened with a second fillet.

Geometry uses millimetres, Z-up. Parameters: `length`, `width` and `thickness` size the plate; `cornerRadius` rounds the corners; `edgeRadius` rounds the top edges (`0` leaves them sharp); `holeDiameter`, `holeColumns`, `holeRows` and `holeSpacing` lay out the hole grid. `main` rejects a grid that does not fit with a 2 mm margin.

The model is exact B-rep, so the STEP export carries the true cylinders and fillets. Expected cost: light (well under a second).
