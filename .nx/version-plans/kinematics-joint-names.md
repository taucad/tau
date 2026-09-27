---
kinematics: minor
geometry-core: minor
---

Joints accept an optional `name` for people, such as `Fan` for joint `n1`. `admitMechanism` rejects a non-string name, `transformMechanism` keeps it, and the `TAU_cad_topology` schema allows it. Tools show the name and fall back to the joint id, which remains the key couplings, animations and code use.
