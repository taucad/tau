# V8 Engine

## Design Brief

A 90° overhead-valve V8 with a small-block layout: cross-plane crankshaft, one camshaft in the valley, flat-tappet lifters, pushrods and stud-mounted rockers, fully dressed. It is a kinematic demonstrator of a complete engine cycle, not a production drawing. Castings carry no draft or fillets, the ports and water jackets are not cored, and there are no fasteners.

Every repeated part is modelled once and placed by clone plus rigid transform. That covers pistons, rods, valves, rockers, lifters, pushrods, springs, studs, plugs and main caps. Both banks share one bank-local head stack, turned by R_X(−45°) for the right bank and a further R_Z(180°) for the left. Instances share one BRep and one triangulation.

### Frame

- Z is up, the crankshaft lies along +X, and the timing drive is at −X.
- Each bank has a local frame (x', t, s): s runs up the bore axis and t across it, positive outboard.
- `layout.ts` holds every dimension and all the kinematics. `main.ts` builds geometry only.

### Assembly Tree

- **Block.** One extruded section, cut in a single `cutAll` pass:
  - four crankcase bays between five 20 mm bulkheads, with the space under the bulkheads left for the main caps;
  - Ø56.6 main bore and Ø54 cam tunnel;
  - eight Ø100 bores;
  - sixteen Ø25.4 lifter bores.
- **Bottom end:**
  - five main caps (one instanced part);
  - oil pan;
  - timing chain around both sprockets;
  - timing cover.
- **Crankshaft.** Webs are one sketched profile (a hull of pin and hub plus a counterweight sector) extruded once and instanced eight times.
  - Four Ø52 pins at phases 0°, 90°, 270° and 180°.
  - Ø56 mains, snout and flywheel flange.
  - Crank sprocket, harmonic balancer and flywheel ride on it.
- **Camshaft.** Revolved core, five journals and sixteen lobes, each lobe the hull of two circles (base r16, nose r9 at 14 mm, 7 mm lift) at its own phase. It carries the cam sprocket (40 teeth, driven 2:1 from 20).
- **Pistons.** Revolved with three ring grooves and bored for a floating Ø24 wrist pin. Rods are a sketched profile (small end, tapered shank, big end) extruded 22 mm wide, two rods per pin.
- **Per bank:**
  - head gasket;
  - head with chambers, stem guides, pushrod passages and plug holes in one `cutAll`;
  - valve cover;
  - exhaust manifold;
  - eight springs, eight studs and four spark plugs.
- **Valvetrain, per valve:**
  - lifter;
  - pushrod;
  - rocker (stadium bar and pivot boss, arm ratio 1.5);
  - valve, with its spring retainer revolved in one profile.
- **Induction.** Intake manifold between the heads, carburettor and air cleaner.

### Parameters

- `crankAngle` (deg, default 0) poses the as-built model. Every piston, rod, lifter, rocker and valve is placed from the exact kinematics at that angle, and the cam turns at half the angle.
- `component` (`assembly` by default) returns one part in its own frame: `block`, `crankshaft`, `camshaft`, `piston`, `rod` or `head`. Only the assembly exports a mechanism.

### Kinematics

- **Crank train.** Stroke 88 (crank radius 44), rod 150, bore 100, compression height 32 and deck 226.5. The piston stops 0.5 mm below the deck at TDC.
- **Firing.** Firing order 1-8-4-3-6-5-7-2 at 90° intervals. Odd cylinders are on the left bank, and cylinder 1 fires at 45°.
- **Valve timing.** Intake peaks 468° after compression TDC and exhaust 248°.
- **Lift.** Flat-tappet lift is the lobe's support distance: max(0, 14 cos φ + 9 − 16), with φ in cam degrees.
- **Rocker.** The rocker angle solves pushrod lift = (R(δ)a − a)·u. The valve opening follows from the same rotation of the valve arm, reaching up to 10.1 mm.
- **Running clearances:**
  - valve lash 0.8 mm;
  - pushrod-to-rocker 0.5 mm;
  - rod-to-web and lifter-to-lobe-neighbour 1.5 mm or more;
  - valve-to-piston 3 mm or more.

### Mechanism

`mechanism({ crankAngle })` (built by `layout.ts`) is expressed in the as-built frame, and its coordinates are deltas from `crankAngle`.

| Joint             | Type                                        | Parent → child   | Driven by                                  |
| ----------------- | ------------------------------------------- | ---------------- | ------------------------------------------ |
| `crank`           | revolute about +X through the origin        | block → crank    | driver, unlimited                          |
| `cam`             | revolute about +X at z = 130                | block → cam      | linear coupling, ratio 0.5                 |
| `piston-n`        | prismatic along the bore                    | block → piston-n | curve of `crank`, period 360°, 180 samples |
| `rod-n`           | revolute about the bank x' at the wrist pin | piston-n → rod-n | curve of `crank`, period 360°, 180 samples |
| `lifter-<kind>-n` | prismatic along the pushrod axis            | block → lifter   | curve of `crank`, period 720°, 240 samples |
| `rocker-<kind>-n` | revolute about the bank x' at the pivot     | block → rocker   | curve of `crank`, period 720°, 240 samples |
| `valve-<kind>-n`  | prismatic along the bore                    | block → valve    | curve of `crank`, period 720°, 240 samples |

The mechanism has 66 joints, 1 linear coupling and 64 curve couplings. Follower limits are the sampled ranges. The `run` clip turns the crank through one four-stroke cycle (0 → 720°) every 2 s and repeats. Dragging any moving part solves the crank angle through the curve couplings.

Springs are drawn static at their full-lift height; the retainer rides on the valve. This is a documented simplification, because a rigid-body mechanism cannot compress a spring.

### Verification Targets (`main.geospec.ts`)

- **Kinematics:**
  - firing order and TDC per cylinder;
  - rod-length closure over 720°;
  - one opening per valve per cycle and at least 2 mm of valve-to-piston clearance;
  - curve-coupling sampling that tracks the exact motion within 0.02 mm (pistons) and 0.1 mm (valves).
- **Assembly:**
  - no diagnostics and closed solids;
  - the envelope, and every named component exactly once.
- **Motion.** At five crank angles across the cycle, no component interference, with wrist pins and lifters where the kinematics put them.
- **Parts (exact BRep):**
  - block bores;
  - one-piece crankshaft and camshaft;
  - piston and rod bores;
  - head valve guides.
