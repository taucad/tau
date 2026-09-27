# Standing fan

Replicad assembly in `main.ts`, in millimetres. Default envelope: 444 mm wide and 1342 mm tall, with a 390 mm base and a 412 mm rotor clearance envelope.

The assembly includes a weighted base, four rubber feet and mounting stems, hollow telescopic tubes, height clamp, pivot yoke and axle, vented motor housing, motor core and shaft, oscillation control, five pitched swept blades, hub, front and rear guards with 36 spokes each, retaining band and four clips, badge, four speed buttons, cable, and plug.

| Parameter    | Default | Supported range                           |
| ------------ | ------- | ----------------------------------------- |
| `headHeight` | 1120 mm | 1020–1320 mm                              |
| `tilt`       | 0°      | −15° to 25°                               |
| `yaw`        | 0°      | −45° to 45°                               |
| `bladeCount` | 5       | Integers 3–7                              |
| `part`       | `all`   | A component group or individual part name |

Examples of component selections: `front-guard`, `motor-shell`, `inner-tube`, `blades`, `blade-1`, and `button-1`. Inspection modes `rotation-clearance` and `enclosed-blades` expose the swept-envelope gauge and the blades intersected with that gauge.

Run `main.geospec.ts` with Tau's `test_model`. The suite checks named parts, dimensions and placement, closed meshes, separate components, exact BRep solids, hollow tubes, shaft and pivot bores, base mounting pattern, all eight ventilation passages, whole-assembly interference, full rotor revolution clearance, and height/blade-count/tilt/yaw variants. Only molded blade roots, the overmolded badge, and the cable insertion into the plug have explicit, volume-limited interference allowances.

For curved blades, spatial mesh clustering merges overlapping bounding boxes; exact solid counts and exact neighbor clearances provide the separation checks. Rotor containment uses equal analytical blade volumes before and after intersection with the clearance cylinder (35,681.55 mm³ per blade), avoiding the containment matcher's bounding-box corner samples. The interrupted yoke bore is checked using both bore centers and a continuous void through the two arms.

This is a geometric assembly model. Motor windings, internal oscillation gearing, screw threads, wiring, airflow, electrical operation, strength, and regulatory safety are not simulated or certified by GeoSpec.
