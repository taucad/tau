---
kinematics: minor
geometry-core: minor
replicad: minor
---

Add `@taucad/kinematics`: serializable mechanisms with fixed, revolute, prismatic, cylindrical, screw, spherical and planar joints, linear couplings and animation clips, pure forward kinematics and a damped least-squares pose solver. The `TAU_cad_topology` payload can carry a mechanism, replicad models can export `mechanism(params)`, and `@taucad/geometry-core` gains `uniqueComponentId` so distinct shape names never share a component id.
