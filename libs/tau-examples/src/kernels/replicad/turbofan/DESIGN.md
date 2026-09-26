# Turbofan Engine

## Design Brief

A two-spool, high-bypass turbofan at CFM56 scale: a 1560 mm fan, a separate-flow nacelle and a translating-sleeve cascade thrust reverser. It is a kinematic demonstrator of the whole engine, not a production drawing. Casings carry no flanges or bosses beyond what the mechanism needs, the blades are double-circular-arc sections without fillets, and there are no fasteners.

Every repeated part is modelled once and placed by clone plus rigid transform. That covers blades, vanes, struts, fuel nozzles, cascade segments, blocker doors and drag links.

### Frame

- The engine axis is +X, which is also the direction of flow. Z is up, and the fan face is at x = 0.
- A meridional point is (x, r). Azimuth θ turns about +X from +Y toward +Z, so the top is θ = 90°.
- `layout.ts` holds every dimension, the flowpath, the blade-row table and all the kinematics. `main.ts` builds geometry only.

### Assembly Tree

- **Nacelle:**
  - inlet cowl (elliptic lip, 1536 mm throat);
  - fan cowl;
  - torque box;
  - twelve cascade segments;
  - two translating sleeve halves, each spanning 174°;
  - the hinge beam (top) and latch beam (bottom): fixed 6° strips between the halves whose tracks the sleeves slide on.
- **Fan section:**
  - spinner (a tangent ogive);
  - fan rotor, with 22 twisted wide-chord blades lofted through eight stations on a disk;
  - fan case with its containment ring;
  - 36 outlet guide vanes;
  - fan frame: splitter over the booster case, the transition-duct hub, eight core struts and the 6 o'clock fairing that carries the radial drive.
- **Core, front to back:**
  - three-stage booster on the LP spool;
  - six-stage HP compressor: variable inlet guide vanes and stage-1 stators, fixed stators after;
  - annular combustor, with 20 fuel nozzles through the casing into its swirlers;
  - two-stage HP turbine;
  - four-stage LP turbine;
  - turbine rear frame (12 struts and the LP rear bearing);
  - exhaust plug, core nozzle and core cowl.
- **Shafts and drives:**
  - the LP shaft runs inside the HP shaft;
  - a 36-tooth bevel on the HP shaft drives the 24-tooth radial drive shaft down through the fan frame strut to the accessory gearbox.

### Blades

- Blades are polyhedral solids, sewn from planar triangles between section loops. Each section lies on its stream cylinder, so the tip keeps its clearance across the whole chord.
- A lofted surface would mesh to thousands of triangles per blade at the viewer's 0.02 mm display tolerance. A polyhedral blade needs a few hundred, which keeps the full engine near 0.8 M triangles.
- **Rotors** root in the spinning hub and stop 2 mm short of the casing, measured at the tightest radius across their axial reach.
- **Fixed stators** root in the casing and stop 2 mm short of the hub.
- **Variable vanes** clear both walls by 2.5 mm at any turn within their limits.
- Every blade count is even, so the Run animation loops without a jump.

### Parameters

- `reverserTravel` (mm, default 0, up to 400) poses the sleeves, blocker doors and drag links.
- `vaneAngle` (deg, default 0, −40 closed to +15 open) poses the inlet guide vanes. The stage-1 vanes turn 60% as far.
- `component` (`assembly` by default) returns one part: `fan-blade`, `core-casing` or `sleeve`. Only the assembly exports a mechanism.

### Mechanism

`mechanism({ reverserTravel, vaneAngle })` (built by `layout.ts`) is expressed in the as-built frame, and its coordinates are deltas from that pose.

| Joint                   | Type                                        | Parent → child           | Driven by                                                   |
| ----------------------- | ------------------------------------------- | ------------------------ | ----------------------------------------------------------- |
| `n1`                    | revolute about +X                           | engine → LP spool        | driver, unlimited                                           |
| `n2`                    | revolute about +X                           | engine → HP spool        | driver, unlimited                                           |
| `radial-drive`          | revolute about the tower axis (−Z at x 660) | engine → radial drive    | linear coupling on `n2`, ratio −1.5 (36/24 bevel)           |
| `hpc-igv-ring`          | revolute about +X                           | engine → IGV unison ring | driver, limited to the vane range                           |
| `hpc-s1-ring`           | revolute about +X                           | engine → stage-1 ring    | linear coupling on the IGV ring (bellcrank, 60% vane share) |
| `hpc-igv-n`, `hpc-s1-n` | revolute about the spindle's radial axis    | engine → vane            | linear coupling on its ring, −R/lever                       |
| `sleeve-left`           | prismatic along +X                          | engine → sleeve          | driver, 0–400 mm                                            |
| `sleeve-right`          | prismatic along +X                          | engine → sleeve          | linear coupling, ratio 1                                    |
| `door-n`                | revolute about the tangential hinge chord   | sleeve → door            | curve of `sleeve-left` (5 mm samples)                       |
| `drag-link-n`           | revolute about the tangential lug pin       | door → link              | curve of `sleeve-left`                                      |

The mechanism has 79 joints, 50 linear couplings and 24 curve couplings.

The animations are:

- **Run**, which turns N1 two turns and N2 3.5 turns every 2 s;
- **Thrust reverser**, which deploys and stows the reverser;
- **Variable vanes**, which sweeps the vane schedule.

Dragging a fan blade solves N1. Dragging a door or drag link solves the sleeve travel through the curve couplings.

### Thrust Reverser Linkage

- Each blocker door hinges on its sleeve at the chord through its front corners. A drag link runs from a lug near the door's aft edge to a fitting on the core cowl.
- As the sleeve slides aft, the rigid link swings the door into the bypass duct. It turns 89° at full travel and never passes a toggle point, and its aft edge stays 57 mm off the core cowl.
- The door angle solves the intersection of the circle about the hinge with the circle about the anchor, on the branch the stowed pose starts from. The curves sample that exact solution.
- The anchor station and lug position were chosen by a search over the linkage for early, monotonic motion and cowl clearance.

The variable vanes use a small-angle relation: a unison-ring turn β moves each lever tip R·β along the tangent, so the vane turns −R/lever × β.

### Verification Targets (`main.geospec.ts`)

- **Mechanism:**
  - rigid drag links, with doors turning steadily inward;
  - door and link curves within 0.05° of the exact linkage from any as-built travel;
  - ring-to-vane reach and the stage-1 share;
  - a seamless Run loop for every rotor row and the bevel drive;
  - axial gaps between rows, with the variable vanes at either limit.
- **Assembly:**
  - no diagnostics and closed solids;
  - the nacelle envelope, and every named component exactly once;
  - no unclassified interference with the reverser stowed, half and fully deployed and the vanes at both limits.
- **Parts (exact BRep):**
  - a valid sewn fan blade;
  - the core casing bored for 48 vane spindles and 20 fuel nozzles;
  - a valid sleeve half.
