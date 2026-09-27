# Kestrel 240 Racing Quadcopter

A 5-inch racing quadcopter decomposed like a product: NACA-section fuselage shells and swept arm fairings over carbon spars, four motor modules, a flight-controller and power stack, and a two-axis camera gimbal. `main.ts` assembles 43 part types into 123 named parts; the `pitchDeg` and `yawDeg` parameters drive the gimbal. `system/quadcopter.sysml` holds the SysML v2 configuration and requirements, and the GeoSpec suites (`main.geospec.ts`, `tests/*.geospec.ts`) check each part and assembly.

The sections below are the engineering record: manufacturing baseline, propulsion and avionics interfaces, camera and gimbal, bill of materials, and the verification trace. Nose is `−X`, `+Y` is right and `+Z` is up; dimensions are millimetres.

## Manufacturing baseline

Revision A, 20 September 2026. Units are millimetres unless stated otherwise. This is a decomposed engineering development assembly prepared for drawing work and supplier DFM review. Manufacturing and flight release remain open: the geometry tests do not establish strength, drag, speed, endurance, optical performance, electrical compatibility or supplier interchangeability.

### Configuration and material decision

The reference configuration uses four 127 mm propeller swept envelopes on motor centres `(±85, ±85)`, a nominal 240.416 mm diagonal wheelbase, rotor plane `z=38`, and a two-axis camera ahead of the fuselage. Nose is `−X`; aft is `+X`; `+Y` is the right side and `+Z` is up. Camera centre is `(-94, 0, -4)`. The 6S battery reservation is `70 × 32 × 34` at `(-27, 0, 0)`; these are packaging reservations, not selected supplier specifications. The ESC and flight-controller stack is centred on `x=24` with mounting axes at `x=14/34, y=±10`. Required maximum speed, flight mass, manoeuvre acceleration, crash survivability, endurance, temperature range and ingress rating require owner-approved numerical requirements before release.

Use **SLS EOS PA 2200 (PA12)** for the custom aerodynamic skins, motor pads, camera housing, yoke, brackets and battery support. Use continuous carbon-composite tubes for arm spars and metal axles, screws and inserts. PA12 offers a practical combination of tough printed shapes, serviceable thin shells and complex internal access; the carbon spar carries the arm's principal bending load through joints that still require qualification. The printed motor pad requires thermal, creep and fastener-retention validation. EOS lists typical PA 2200 modulus 1650 MPa, tensile strength 48 MPa, strain at break 18%, and density 930 kg/m³. These are indicative coupon values, not flight design allowables; qualify the selected machine, powder refresh, build orientation and conditioned state. [EOS PA 2200 material information](https://store.eos.info/products/pa-2200-polyamide-12)

This material decision assumes an SLS service or machine. Printing the same files in a desktop FDM process changes strength, warpage, hole fit and surface quality and requires a separate process qualification. Do not substitute a material name alone for an approved process specification.

### Aerodynamic definition

`lib/naca.ts` constructs the symmetric four-digit NACA thickness law as a polynomial in `u = sqrt(x/c)`, represented by a degree-eight Bézier curve. For `q=x/c`, the nominal half-thickness is:

```text
y(q) = 5 t c (0.2969 sqrt(q) - 0.1260 q - 0.3516 q² + 0.2843 q³ - 0.1015 q⁴)
```

The `−0.1015` coefficient retains the original finite trailing edge. Converting the polynomial to Bézier form represents this selected formula without sampling the profile into a polygon; floating-point and CAD-kernel tolerances still apply. The thickness law is documented in [NASA TM 4741, Computer Program to Obtain Ordinates for NACA Airfoils](https://ntrs.nasa.gov/citations/19970008124).

The fuselage is based on a surface of revolution of a NACA 0036 meridian with 176 mm chord. Its camera opening, service seam, internal clearance, root penetrations and locally rounded closures modify that parent surface. The inner shell surface is scaled by 0.91 about `x=−25`; this is not a constant-thickness offset. The arm uses a NACA 0024 nominal profile with 48 mm chord, truncated at `q=0.9` where full thickness is 2.779617 mm, then closed with a circular cap. This replaces the nominal 0.241920 mm trailing edge at `q=1`. Motor-pad pockets and spar passages are further manufacturing features. Only the surviving parent-profile region is exact to the nominal law. Circular caps meet the parent curves in position; tangent and curvature continuity at their junctions is not established and must be resolved in aerodynamic release. The propeller is a purchased-component envelope, not a NACA-derived, thrust-qualified blade design.

“No flat surfaces” is applied to the exposed aerodynamic fairings. Planar split planes, bolt seats, PCB faces and structural datum surfaces are deliberate functional interfaces. A drawing calling every surface curved would make secure, inspectable joints impractical. The finite trailing-edge closure and local transitions are explicitly part of the manufactured definition and must be included in any flow model.

Exact boundary geometry does not establish a fluid solution. Aero release needs a defined speed and attitude envelope, rotor/body interaction, relevant Reynolds numbers, roughness, heat rejection and free-stream conditions. Perform mesh, time-step and iterative convergence studies and compare with measured forces or flight data; the [NASA CFD verification and validation tutorial](https://www.grc.nasa.gov/www/wind/valid/tutorial/tutorial.html) distinguishes numerical verification from experimental validation.

### Print and finish specification to qualify

1. Print custom parts separately and keep the shell halves open for depowdering, inspection and electronics access. Remove powder from every spar socket, fastener bore and recessed pocket before assembly.
2. Confirm local wall thickness with section inspection across the CAD solid; nominal wall parameters do not establish minimum normal thickness at curved noses, intersections or cap transitions. Use 2.4 mm as the fuselage-shell local minimum target and 1.5 mm as the general exposed PA12 feature screening target; increase load-bearing sections from structural evidence. These are project targets, not supplier guarantees. Stratasys' SLS guide gives a general 1.0 mm wall baseline and discusses geometry-dependent process limits. [Stratasys SLS production design considerations](https://www.stratasys.com/siteassets/sdm/content---website-storage/design-guides/dg_sls_stratasys_direct_04192023.pdf)
3. Print fit coupons in the same build as first articles. Record measured tube OD, printed socket ID, screw clearances, bearing pockets and insert pull-out geometry. Tune those parameters to the actual process before locking drawing tolerances.
4. Mask bearing seats, bonding surfaces and fastener datums during finishing. Depowder, media-blast and apply a process-qualified smoothing/sealing finish to the aerodynamic exterior. Record pre/post coating dimensions and mass. Do not hand-sand the exact-profile region without measured contour inspection.
5. Specify powder lot, machine, build recipe, orientation, refresh ratio, finishing process, conditioning method and inspection temperature on the process record. Condition mechanical coupons and parts together; measure the moisture/temperature state used for fit and strength results.
6. Purchase rated flight propellers, motors, bearings, fasteners and electronics. The CAD motor, propeller, PCB, battery, optical dome, connectors and miniature actuators reserve space or illustrate decomposition. Their internal geometry is not a vendor manufacturing definition.

### Drawing preparation

Produce a separate drawing for each custom leaf part, a cut/finish drawing for each spar, procurement specifications for bought items, and assembly drawings for the arm module, airframe, camera cartridge, gimbal, motor module, propulsion, avionics and complete vehicle. The bill of materials and SysML identifiers provide the cross-reference. No geometry export is included in this task.

Each drawing needs part number/revision, native source revision, material and process, drawing units, mass after finishing, datum definitions, section views, hole callouts, insert/bearing installation notes, inspection requirements and acceptance criteria. Show the exact nominal-profile region and manufactured transition boundaries explicitly. Generate STEP/AP242 and print artifacts only after the drawing authority approves the configuration and the user requests those artifacts.

| Custom part                     | Proposed primary datum A        | Secondary/tertiary datums                                  | Critical drawing content                                                                              |
| ------------------------------- | ------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Upper and lower fuselage shells | Shell split-plane datum targets | Longitudinal centre-plane / selected paired fastener bores | Matched seam; profile of external surface; local wall sections; camera/root clearances; insert bosses |
| Arm aerodynamic fairing         | Spar bore axis                  | Root mating station / chord plane                          | Parent NACA curve, cutoff station and cap; bore fit; root/end transitions; minimum wall               |
| Carbon spar                     | Tube axis                       | Cut end / clock mark if laminate directional               | 8 OD × 5 ID; 64 cut length; laminate/process identification; end quality and bond preparation         |
| Root clamp                      | Spar socket axis                | Fuselage mating surface / clock plane                      | Socket fit, wall thickness, retention load path and fastening or bonding specification                |
| Motor pad                       | Motor bolt seating plane        | Central shaft bore / one bolt-pattern axis                 | Ø32 × 12; 8.4 shaft clearance; four Ø3.3 on 16 × 16; flatness, axis alignment and arm attachment      |
| Battery saddle                  | Lower locating surface          | Centre-plane / fore-aft stop                               | Battery clearance, restraints, abrasion isolation, removal clearance and load proof                   |
| Camera front and rear shells    | Split interface datum targets   | Optical centre axis / screw pair                           | Lens stack, aperture and field of view; PCB clearance; fastening stack; shell sections                |
| Lens retainer                   | Optical locating shoulder       | Optical axis / locating clock feature                      | Dome retention, controlled clamp load and axial stack; supplier optical envelope                      |
| Pitch yoke                      | Pitch-bearing axis              | Yaw axis / camera centre-plane                             | Bearing-pocket fits, axis perpendicularity, actuator interface and swept clearance                    |
| Fixed gimbal mount              | Body mounting seats             | Yaw axis / mounting-hole pair                              | M2 clearance bores at `(-65.8, ±7)`; alignment, actuator support and body clearance                   |
| Shoulder axle                   | Ø2.9 spindle axis               | Shoulder seating face / drive detail                       | Bearing fit, axial retention, end play, surface finish and material specification                     |

Datum targets on curved shells are fixturing features; the drawing must identify their positions and the inspection fixture. The above datum scheme is a preparation proposal, not a released GD&T drawing. Final tolerances must come from the stack analysis and demonstrated supplier capability. Threads shown as cylinders or envelopes require complete thread specification on drawings or supplier part numbers.

| Assembly interface    | Current nominal definition                                                     | Drawing/first-article acceptance to establish                                                                                          |
| --------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Fuselage seam         | Upper starts `z=0.2`; lower ends `z=−0.2`; nominal gap 0.4                     | Seam gap and steps after finish, torque and conditioning                                                                               |
| Shell screw stations  | `(-43, ±23)` and `(12, ±19)`, axes parallel Z; screw seat `z=2.5`              | Pattern position, coaxiality, tool access and insert installation                                                                      |
| Shell threaded insert | Ø3.5 × 4 at `z=−5.5…−1.5`; modeled bore Ø2.05                                  | Supplier M2.5 thread and insertion procedure; the simplified screw cylinder intentionally overlaps the insert's thread-envelope region |
| Arm root clamp        | Centres `(±61.68, ±32, 0)`; Ø8.3 socket with Ø8 spar                           | Actual bond/retention specification, alignment and shear/bending proof                                                                 |
| Motor pad and spar    | Ø8.4 radial socket with Ø8 tube; tube ends 5 mm inboard of motor centre        | Bond-gap control, surface preparation, alignment, heat and creep proof                                                                 |
| Gimbal body mount     | M2 screw axes `x=−65.8, y=±7`; fixed mounting seat `z=−9`; insert pockets Ø3.3 | Insert OD3.2 × 4 at `z=−9…−5`; supplier thread, engagement and alignment                                                               |
| Electronics stack     | 20 mm square pattern at `x=14/34, y=±10`; lower support datum `z=−13.4`        | Spacer/isolator compression stack, screw retention, PCB bow and tool access                                                            |
| Battery restraints    | Two 10 mm wide strap envelopes centred at `x=−50` and `x=−10`                  | Supplier closure, adjustable length, abrasion pads, installation access and restraint proof                                            |

Interference corrections move the root clamps outboard of the battery and shorten each spar to 64 mm while retaining its motor-end datum. The fairings have matching clamp pockets and front shell-fastener relief. Shell openings use the solid fairing envelope and a 1.01 scale clearance; clamp pockets also use 1.01 of the blank. These are nominal assembly gaps, not process-qualified fits. The motor pad rotates as a complete part with its motor bolt pattern, and its radial socket has 0.2 mm end clearance. The battery saddle has a 1 mm inner corner radius and a 0.995 inner-shell trim; strap inner corners are R0.2 to clear the battery's square vertical corners. The lower shell has spacer relief at `z=−13.4`, and its gimbal bridge ends at `z=−6` with a Ø3.2 drive passage.

For the complete local camera and propulsion datum definitions, use the camera and gimbal section and the propulsion and avionics section alongside this drawing plan. Source and dimensions must be frozen together; these interface values are not tolerance limits.

### Assembly and inspection sequence

1. Inspect and record every leaf part and purchased component. Separate reference motor internals from the procurement BOM: a motor assembly is purchased once; its depicted internals are not extra purchases.
2. Dry-fit each spar, root clamp, fairing and motor pad. Prove the spar-to-root and spar-to-pad retention mechanism before motor installation; geometric contact alone is not a load path. Apply only a qualified bond or fastening procedure and record cure or torque.
3. Fit shell inserts and assemble the lower airframe, battery support and four arm modules. Verify motor axes, coplanarity and centre positions. Measure rotor clearances using actual selected propellers and worst-case deformation allowance.
4. Assemble camera shells, PCB, dome and retainer; then bearings, axle, yoke, actuators and fixed mount. Verify optical focus, full field of view, end play and travel before attachment to the airframe.
5. Install electronics on isolators, add battery restraints, and route the complete harness with strain relief. Check connector access, insulation clearance from carbon, thermal paths and cable bend/loop travel through both gimbal axes.
6. Assemble the upper shell, inspect seams and establish finished mass and centre of gravity. Complete electrical and control commissioning, then contained propulsion testing, vibration testing and the approved incremental flight programme.

### Manufacturing and flight release gates

All gates are **OPEN** until signed evidence exists; passing GeoSpec checks only closes the specific geometric checks recorded in the verification matrix.

| Gate                                 | Required evidence and exit condition                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G01 — Requirements and configuration | Approved speed, AUW, manoeuvre/landing loads, endurance, environment, camera mass/FOV and joint travel; selected motor/prop/battery/ESC/actuator part numbers                                                                                                                                                                                                                  |
| G02 — Structural load path           | Full arm/root/pad and battery/gimbal retention design; conditioned material allowables; laminate data; static/impact/fatigue analysis; proof and destructive tests; vibration/modal separation from operating excitation                                                                                                                                                       |
| G03 — Additive process               | Supplier DFM approval; minimum-wall survey; build and conditioning recipe; fit and strength coupons; porosity/finish/warpage acceptance; first-article dimensional report                                                                                                                                                                                                      |
| G04 — Tolerance and joints           | Worst-case and statistical stacks for motor axes, rotor flex clearance, shell seams, bearing/shaft fits, gimbal optics and fastener engagement; thread/insert data and verified torque/pull-out results                                                                                                                                                                        |
| G05 — Propulsion                     | Authoritative prop geometry, pitch and RPM rating; motor thrust/current/temperature map with the selected ESC and battery; overspeed margin, fastener retention and balance report. Ratings are prop-family specific; [APC's published limits](https://www.apcprop.com/technical-information/rpm-limits/) illustrate why a generic 127 mm envelope has no usable RPM approval. |
| G06 — Aerodynamics and heat          | Verified CFD on as-manufactured surfaces with powered-rotor effects; wind-tunnel or flight comparison; drag and stability across the approved envelope; component thermal results under heat-soaked worst case                                                                                                                                                                 |
| G07 — Gimbal                         | Continuous swept-volume clearance including cables, tolerances and deflection; motor torque/bandwidth/thermal margin; mechanical retention/stops; camera calibration, focus, vibration and image-latency results                                                                                                                                                               |
| G08 — Electrical and control         | Schematic, complete harness/connector schedule, current protection, grounding, EMC/radio coexistence and failsafe tests; flight control and gimbal control tuning; battery retention and monitored power test                                                                                                                                                                  |
| G09 — Model and drawings             | SysML v2 semantic parse/type check in a conforming tool; CAD compile and all GeoSpec results; revision-locked BOM, native source and approved drawings; supplier signoff and first-article inspection plan                                                                                                                                                                     |
| G10 — Release                        | Approved ground/flight test reports, manufacturing traveller, serial/lot traceability, maintenance limits, prop replacement/inspection policy and signed design authority release                                                                                                                                                                                              |

Known detail work remains visible in these gates: the fully selected and routed harness, proven battery restraint, qualified structural joints, supplier-specific gimbal drive/retention, continuous motion collision proof and functional propeller definition cannot be inferred from geometric envelopes. This baseline is ready to review and dimension; it is not yet a production or flight release.

## Propulsion and avionics interface definition

All dimensions are millimetres. X points aft, Y right, Z up. This package provides native closed BRep mechanical reference envelopes and assembly interfaces. Purchased motor, propeller, battery, connector, electronics and antenna internals are opaque supplier assemblies. Their envelopes are not authority to manufacture those products or evidence of flight performance. Final manufacturer part numbers, mounting drawings, mass, tolerances, electrical ratings and test reports must replace these assumptions before production release.

### Assembly hierarchy

`assemblies/motor-module.ts` builds one independently renderable motor module. `assemblies/propulsion.ts` clones that prototype into four uniquely named 12-component occurrences, for 48 mechanical occurrences total. `assemblies/avionics.ts` builds 24 named occurrences. Every part file below exports its builder, `defaultParams`, and a default renderable entry point. Imports use explicit `.js` ESM paths.

| Station     |   X |   Y | Handedness viewed from above |
| ----------- | --: | --: | ---------------------------- |
| front-left  | -85 | -85 | CW                           |
| front-right | -85 |  85 | CCW                          |
| rear-left   |  85 | -85 | CCW                          |
| rear-right  |  85 |  85 | CW                           |

Nominal rotor swept diameter is 127. Rotor datum plane is Z38; the propeller hub contacts the motor bell at Z35. The nut occupies Z40.5–45. Adjacent rotor-axis spacing is 170, leaving 43 nominal millimetres between swept circles. Propeller blade deflection, assembly tolerance and dynamic clearance remain release checks. Smooth elliptic-section lofts give curved, twisted BRep blades; they are **not** supplier airfoil geometry, not an exact NACA propeller, and **not printable flight propellers**. The aircraft's analytical NACA body/arm geometry is defined elsewhere.

Each complete motor module is rotated about Z by `atan2(-sx × 33, sy × 75)` before translation to `(85sx,85sy,0)`, where `sx,sy` are its quadrant signs. This matches the motor-pad orientation and places the carbon spar between the motor screws. The 16 × 16 bolt square remains local to each motor; it is not aligned with aircraft X/Y in the assembled vehicle. Standalone motor-module and part datums remain unchanged. Rotation preserves the diagonal CW/CCW assignment.

### Propulsion bill of materials and interfaces

| File under `parts/propulsion/` | Quantity | Mechanical reference                                                                          | Intended procurement/material                                                                     |
| ------------------------------ | -------: | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `motor-base.ts`                |        4 | Ø28 flange; assembled Z7–10; bearing carrier to Z31; four Ø3 envelope holes on 16 × 16 square | Included in purchased 2207 motor; nominal aluminium housing                                       |
| `motor-stator.ts`              |        4 | Ø22 × 16.6, bore Ø11.3; assembled Z12.4–29                                                    | Included in motor; opaque steel/copper winding assembly                                           |
| `motor-bell.ts`                |        4 | Ø28 × 22.7; Ø24 internal cavity; 2 mm top; assembled Z12.3–35; six Ø3 reference vents         | Included in motor; opaque aluminium/magnet-carrier assembly                                       |
| `motor-shaft.ts`               |        4 | Ø5 × 33; assembled Z10–43                                                                     | Included in motor; nominal steel; threaded end simplified to envelope                             |
| `motor-bearing.ts`             |        8 | 5 × 9 × 3 bearing envelopes at Z12.5–15.5 and 27.5–30.5                                       | Included in motor; purchased bearing assemblies; races/balls opaque                               |
| `motor-screw.ts`               |       16 | M3 × 7 under-head envelope; Ø5.4 × 2 head; assembled Z1–10; 3 mm nominal motor engagement     | Purchased steel fasteners; actual thread and permitted motor penetration require supplier drawing |
| `propeller.ts`                 |        4 | Two CW + two CCW; nominal 127 swept diameter; Ø5.2 hub passage                                | Purchased rated, balanced moulded propeller; NOT a printed flight component                       |
| `prop-nut.ts`                  |        4 | M5 envelope, 8 across flats × 4.5; Ø5.2 clearance geometry                                    | Purchased prevailing-torque nut; thread/locking details supplier-owned                            |

The motor base bearing carrier has Ø9.1 pockets around Ø9 bearing envelopes: 0.05 nominal radial clearance. Its outer Ø11 is separated from the Ø11.3 stator bore by 0.15 radial clearance. Bell cavity Ø24 clears stator Ø22 by 1 radially. These are deliberate non-interfering reference fits, **not toleranced bearing-seat or shaft-fit prescriptions**. Shaft/bearing nominal contact and propeller/bell seating are intended touching surfaces. Threads are represented by nominal clearance envelopes, not helical thread solids; the mating suppliers govern thread minor diameters, engagement, torque and locking.

### Avionics bill of materials and placement

| File under `parts/avionics/` | Quantity | Envelope and assembly location                                                                      | Intended procurement/material                                                                                   |
| ---------------------------- | -------: | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `battery.ts`                 |        1 | 70 × 32 × 34, 4 mm plan corner radius; centre (-27,0,0)                                             | Purchased 6S pack; capacity, chemistry, current and measured swelling allowance unresolved                      |
| `esc.ts`                     |        1 | 25 × 25 board; 1.6 board + 3 populated height; centre X24,Y0; board Z-9–-7.4                        | Purchased populated 4-in-1 ESC                                                                                  |
| `flight-controller.ts`       |        1 | 25 × 25 board; 1.6 board + 3 populated height; centre X24,Y0; board Z0–1.6                          | Purchased populated controller                                                                                  |
| `receiver.ts`                |        1 | 16 × 9 × 3; centre (56,0,0)                                                                         | Purchased receiver envelope                                                                                     |
| `standoff.ts`                |        8 | Four 3.4 mm lower spacers at Z-13.4–-10; four 7.4 mm interboard spacers at Z-7.4–0; Ø4.8, Ø2.2 bore | Nominal aluminium M2 spacers; height is an exposed fit parameter                                                |
| `board-screw.ts`             |        4 | M2 × 15 envelope, head Ø3.8 × 1.6; shank Z-13.4–1.6                                                 | Purchased steel fasteners; thread depiction omitted                                                             |
| `board-isolator.ts`          |        4 | Ø5 × 1, Ø2.2 bore; Z-10–-9                                                                          | Purchased silicone isolation washers                                                                            |
| `power-connector.ts`         |        1 | 10 × 10 × 5; centre (3,0,20)                                                                        | Purchased polarized two-pole connector; current rating unresolved                                               |
| `power-wire.ts`              |        2 | Ø2 insulated reference routing; 3 mm bend radius arc; battery (8,±3,14) to connector (8,±3,20)      | Copper/silicone lead envelope; conductor gauge and bend radius must be selected to current/fatigue requirements |
| `antenna.ts`                 |        1 | Ø2.4 protected envelope, X64–105, Y=Z=0                                                             | Purchased antenna; RF length and frequency not designed                                                         |

ESC/FC board patterns are four Ø2.2 clearance holes on a 20 × 20 square at X14/34, Y±10. Lower airframe seat datum is Z-13.4. Receiver mount retention and detailed motor-phase/signal/ESC power harnesses require the selected vendors' pinouts; the visible lead pair alone does not claim a complete electrical design. The antenna needs a rear centreline exit clearance of at least Ø3. Electrical insulation, connector retention, motor lead routing, cooling, battery restraint and service access must be verified in the complete aircraft before release.

### Executable verification

`tests/propulsion.geospec.ts` and `tests/avionics.geospec.ts` were created before geometry. They cover every independent part's envelope, positive volume, closedness, connectedness, STEP BRep validity and solid count; exact motor and board bolt patterns; exact bearing interfaces; CW and CCW propeller geometry and hub passage; the standalone motor module; named placement/count rules; and subsystem interference. The hub passage uses its exact cylindrical bore plus bounded void continuity because the generic through-hole classifier compares the bore to the entire twisted-blade Z envelope.

Tests do not establish thrust, maximum RPM, fatigue strength, RF performance, EMI immunity, ESC current, battery discharge capability, heat rejection, aerodynamic drag or a manufacturer-approved tolerance stack. Those are required release evidence, alongside authoritative supplier models. No geometry export was requested or generated by this subpackage.

#### Current-source interference regression

The propeller's 10 mm radial station uses 20° pitch. The previous 26° station let the blade root penetrate the bell by approximately 1.695 mm³. Reducing this local pitch clears the bell while retaining the Z38 rotor datum, Z35 hub seating face, shaft bore and nominal 127 mm swept diameter. Both handed variants have explicit GeoSpec bell/propeller/nut/shaft regression checks.

A fresh esbuild bundle of the actual filesystem sources was evaluated directly with the installed OCCT/Replicad kernel on 2026-09-20 while Tau retained stale geometry. All 72 propulsion and avionics occurrences passed ordinary and strict exact `BRepCheck_Analyzer` validation, had one solid each, and had positive volume. Conservative bounding-box rejection preceded exact OCCT intersections for every remaining pair:

| Assembly            | Occurrences | All possible pairs | Exact intersection pairs | Overlaps above 0.000001 mm³ |
| ------------------- | ----------: | -----------------: | -----------------------: | --------------------------: |
| Complete propulsion |          48 |               1128 |                       88 |                           0 |
| CW motor module     |          12 |                 66 |                       22 |                           0 |
| CCW motor module    |          12 |                 66 |                       22 |                           0 |
| Avionics            |          24 |                276 |                       41 |                           0 |

Avionics GeoSpec now permits no intentional overlap allowances; the power leads terminate at the battery and connector interfaces without shared solid volume. This native-kernel audit covers subsystem interiors. Full-aircraft cross-subsystem interference is verified in the main assembly suite. Native current-source results and Tau GeoSpec outcomes must remain distinct until Tau reloads the same sources.

## Camera and gimbal definition — engineering prototype

`assemblies/gimbal.ts` builds 22 named solid occurrences from 15 leaf part files. `assemblies/camera-cartridge.ts` builds the nine-part removable camera cartridge. Every leaf has `defaultParams`, a named builder, and a default independently renderable entry point. All imports are explicit `.js` ESM paths. `tests/gimbal.geospec.ts` was written before geometry and covers every leaf's dimensions, watertightness, connected solid count and valid native STEP BRep, plus bearing bores, attachment holes, assembly solid counts, neutral fit and a 25-configuration pitch/yaw grid including extrema.

The geometry is an engineering prototype, not a released production design. It establishes curved BRep surfaces, physical mounting locations and assembly separation. Supplier selection, structural analysis, optical design and assembly retention must be closed before drawing release.

| Source under `parts/gimbal/` | Qty | Classification/material                  | Defined geometry and interfaces                                                                                                                          |
| ---------------------------- | --: | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `camera-front.ts`            |   1 | Custom SLS/MJF PA12                      | Ø31 spherical housing, 1.8 radial wall, Ø15.6 optical port, 0.3 diametral shell seam, two Ø2.2 screw bores along X at Y0/Z±10.5 in cartridge coordinates |
| `camera-rear.ts`             |   1 | Custom SLS/MJF PA12                      | Matching Ø31 rear shell, hollow cavity and Ø3.1 pitch spindle bores along Y at X5/Z0; external trunnion tips Y±17.4                                      |
| `optical-dome.ts`            |   1 | Purchased optical glass envelope         | Exact hemispherical radius6.1 plus 3 mm cylindrical insertion tail; full assembly apex X−114.3 at neutral; supplier optical prescription required        |
| `lens-retainer.ts`           |   1 | Custom SLS/MJF PA12                      | OD15.2/ID12.4×3 sleeve; nominal glass radial bond gap0.1 and shell radial bond gap0.2                                                                    |
| `camera-pcb.ts`              |   1 | Purchased camera PCB envelope            | 13×13×1.2 with corner R1, contained in shell; final sensor/board/connector stack unresolved                                                              |
| `pitch-yoke.ts`              |   1 | Custom SLS/MJF PA12                      | True toroidal half-ring, major R19/minor R1.8, two side bosses R5.8; Ø8.3 pitch/yaw bearing seats; Ø9.1 actuator seat                                    |
| `fixed-mount.ts`             |   1 | Custom SLS/MJF PA12                      | 9×20×3 curved perimeter with R1 edge fillets; two Ø2.2 attachment holes and Ø3.2 yaw shaft clearance; the fillet clears the screw bores without tangency |
| `bearing.ts`                 |   2 | Purchased steel bearing envelopes        | ID3/OD8/width3, one pitch and one yaw; internal races, shields and rolling elements are vendor controlled                                                |
| `shoulder-axle.ts`           |   1 | Custom turned stainless candidate        | Ø2.9×8.1 shank and Ø4.2×0.8 head; bearing/retention fit is provisional                                                                                   |
| `actuator-body.ts`           |   2 | Purchased actuator keep-in envelopes     | Ø8.8×4 each; these cylinders do not assert availability of a motor with sufficient torque                                                                |
| `actuator-shaft.ts`          |   2 | Purchased actuator drive envelopes       | Ø2.9; pitch4.6 and yaw10.2 length; coupling and retention interfaces unresolved                                                                          |
| `shell-screw.ts`             |   2 | Purchased M2×10 steel fastener envelopes | Domed head/socket, nominal unthreaded shank envelope; final standard/vendor required                                                                     |
| `shell-nut.ts`               |   2 | Purchased M2 steel nut envelopes         | 4.2 across corners, thickness1.5, cylindrical Ø2.2 thread envelope                                                                                       |
| `mount-screw.ts`             |   2 | Purchased M2×8 steel fastener envelopes  | Same head geometry as shell screws; mounts to airframe insert pair                                                                                       |
| `threaded-insert.ts`         |   2 | Purchased brass bonded insert envelopes  | OD3.2/ID2.2×4 in airframe's Ø3.3 pockets; supplier thread and exterior details omitted                                                                   |

All dimensions above are mm. The spherical housing and optical dome use native circular surfaces. The yoke bridge revolves an exact rational B-spline representation of a circle; this preserves its toroidal geometry while avoiding an OCCT torus/intersection p-curve defect. No mesh approximation defines its surface. The internal mounting interfaces, thread envelopes and nut faces include necessary planar surfaces. Curved external styling alone does not establish aerodynamic performance or optical performance.

### Aircraft interface

Aircraft X points aft, Y right, Z up. The cartridge origin is at aircraft [−94,0,−4]. The camera looks along −X at neutral. Pitch axis is [−89,0,−4] parallel Y; yaw axis is [−70,0,−4] parallel Z. `pitchDeg` accepts ±25° and `yawDeg` ±12°. Camera parts and the pitch spindle rotate about pitch; the complete camera, pitch actuator body and yoke rotate about yaw. The fixed mount and yaw actuator remain fixed to the airframe.

At neutral the complete gimbal spans X[−114.3,−63.5], Y±22.8. The fixed mount spans X[−72.5,−63.5], Y±10, Z[−12,−9]. Its mounting hole axes are at X−65.8/Y±7 along Z. Brass insert envelopes span Z[−9,−5] and sit in the airframe bridge. Screw shanks continue through the inserts to Z−4.2. The yaw actuator cylinder spans X[−74.4,−65.6], Y±4.4, Z[−16.5,−12.5]. The fuselage must clear the entire articulated camera/yoke envelope, including yaw motion at the rear corners.

### Manufacturing and release gates

Print the four camera/yoke/mount PA12 pieces plus the lens retainer by a qualified SLS or MJF process. The split shell gives access for powder removal and camera assembly. Smooth/seal exposed print surfaces using a supplier-qualified process that preserves bearing, lens and mounting datums. Machine critical bores after printing; the current diameters represent nominal geometric clearances, not released fits or GD&T.

Select actual camera, optics, actuators, bearings, fasteners and inserts before freezing dimensions. Provide optical centering and focus stack, PCB retention, flexible harness routing, strain relief, yaw/pitch stops, backlash limits, bearing axial retention, keyed/clamped drive couplings and a validated lens/window adhesive or gasket. The modeled shafts, bearing seats and lens bond gaps are geometry interfaces; they do not yet provide a complete retained mechanism. The fastener and insert bores deliberately use clearance envelopes, so no thread strength is asserted.

The ±25°/±12° GeoSpec checks sample 25 configurations on a pitch/yaw grid. They are not a continuous swept-volume proof or a dynamic test. Required release evidence includes full interference sweep with selected vendor models and harnesses, gimbal inertia/torque sizing, bearing/shaft load and fatigue assessment, PA12 environmental/creep qualification, vibration isolation and image stability tests, optical calibration, and drawing/tolerance review. Do not send this assembly for production tooling or flight release on geometry tests alone.

For the present rigid internal geometry, conservative analytic bounds also support the travel interval. The camera sphere's center is always 5 mm from the pitch axis. On the rear half of the R19 yoke, the centerline-to-camera-center distance is at least √(19²+5²), leaving 2.347 mm between the R15.5 shell and R1.8 bridge tube. The trunnions and drive shafts are coaxial with their cylindrical bores, so pitch does not consume their radial clearance. The optical cartridge stays forward of the yoke at ±25°.

Over the full yaw interval, the moving shell's aftmost bound is local X16.483, compared with the fixed mount's forward face X21.5 and yaw actuator's forward bound X19.6. The bridge's aftmost conservative bound is X26.215; the nearest insert bound is X26.6. The yaw collar has 1.063 mm radial separation from each insert. These positive conservative bounds supplement the sampled tests; they apply to the modeled rigid parts and exclude future vendor detail, harnesses and deformation.

### GeoSpec evidence limits

The connected-component matcher groups overlapping component bounding boxes, so nested lenses, nuts and shafts can form one spatial cluster even with true geometric gaps. Each leaf is still required to be one connected watertight solid. Assembly part count is asserted using exact STEP solid topology, while the mesh interference matcher tests actual positive-volume overlaps. This prevents a bounding-box cluster from being misreported as a fused manufactured part. Visual inspection and validation results are recorded by the project verification report.

Current-source native checks on 2026-09-20 passed strict OCCT `BRepCheck_Analyzer` for all 22 occurrences at neutral and both diagonal travel extrema. A separate exact common-volume check screened all 231 possible component pairs at each of 25 travel configurations (5,775 pair/configuration combinations); all positive-AABB candidates had intersection volume no greater than 0.000001 mm³. This check ran against a fresh filesystem bundle to avoid the Tau session's stale geometry cache. The persistent 80-check GeoSpec suite remains the project verification entry point; the project report records its final Tau execution status.

## Bill of materials — revision A

20 September 2026. Nominal complete-vehicle quantities. The modeled configuration contains **43 leaf source types and 123 physical leaf occurrences**, plus eight assembly source files including `main.ts`. Assembly rows are roll-ups, not additional material quantities.

“Buy reference” reserves an external interface; it is not a selected, approved supplier part. Purchase four complete motors: PR-001 through PR-005 illustrate their mechanical decomposition and are **included** in those four purchases. Similarly, GIM-011 drive shafts belong to the two complete actuators. Printed part geometry is a development manufacturing definition subject to the release gates in the manufacturing baseline section.

| ID      | SysML definition | Qty / vehicle | Make or buy                  | Material / procurement basis | Native CAD source                     | GeoSpec trace                 | Description / release detail                                            |
| ------- | ---------------- | ------------: | ---------------------------- | ---------------------------- | ------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| AF-001  | UpperShell       |             1 | Print                        | EOS PA 2200 / PA12           | `parts/airframe/upper-shell.ts`       | `tests/airframe.geospec.ts`   | Upper aerodynamic fuselage shell                                        |
| AF-002  | LowerShell       |             1 | Print                        | EOS PA 2200 / PA12           | `parts/airframe/lower-shell.ts`       | `tests/airframe.geospec.ts`   | Lower fuselage shell with integral support features                     |
| AF-003  | ArmFairing       |             4 | Print                        | EOS PA 2200 / PA12           | `parts/airframe/arm.ts`               | `tests/airframe.geospec.ts`   | NACA 0024 parent; q=0.9 truncation and round cap                        |
| AF-004  | CarbonSpar       |             4 | Cut purchased stock          | Continuous carbon composite  | `parts/airframe/spar.ts`              | `tests/airframe.geospec.ts`   | 8 OD x 5 ID x 64; laminate and joint qualification pending              |
| AF-005  | RootClamp        |             4 | Print                        | EOS PA 2200 / PA12           | `parts/airframe/root-clamp.ts`        | `tests/airframe.geospec.ts`   | Spar root socket and fuselage attachment                                |
| AF-006  | MotorPad         |             4 | Print                        | EOS PA 2200 / PA12           | `parts/airframe/motor-pad.ts`         | `tests/airframe.geospec.ts`   | Motor mount; qualify heat, creep and bonded retention                   |
| AF-007  | BatterySaddle    |             1 | Print                        | EOS PA 2200 / PA12           | `parts/airframe/battery-saddle.ts`    | `tests/airframe.geospec.ts`   | Battery location and strap slots                                        |
| AF-008  | AirframeScrew    |             4 | Buy                          | Steel, grade TBD             | `parts/airframe/shell-screw.ts`       | `tests/airframe.geospec.ts`   | M2.5 x 8 reference; complete thread specification pending               |
| AF-009  | AirframeInsert   |             4 | Buy                          | Brass, supplier TBD          | `parts/airframe/heat-set-insert.ts`   | `tests/airframe.geospec.ts`   | M2.5 insert reference; OD3.5 x4, modeled bore2.05                       |
| AF-010  | BatteryStrap     |             2 | Buy                          | Woven nylon / hook-and-loop  | `parts/airframe/battery-strap.ts`     | `tests/airframe.geospec.ts`   | Battery restraint envelope; rating and buckle/closure selection pending |
| GIM-001 | CameraFront      |             1 | Print                        | EOS PA 2200 / PA12           | `parts/gimbal/camera-front.ts`        | `tests/gimbal.geospec.ts`     | Front camera shell                                                      |
| GIM-002 | CameraRear       |             1 | Print                        | EOS PA 2200 / PA12           | `parts/gimbal/camera-rear.ts`         | `tests/gimbal.geospec.ts`     | Rear camera shell and pitch interface                                   |
| GIM-003 | OpticalDome      |             1 | Buy reference                | Optical glass, supplier TBD  | `parts/gimbal/optical-dome.ts`        | `tests/gimbal.geospec.ts`     | Optical envelope only; prescription and finish unselected               |
| GIM-004 | LensRetainer     |             1 | Print                        | EOS PA 2200 / PA12           | `parts/gimbal/lens-retainer.ts`       | `tests/gimbal.geospec.ts`     | Optical dome retaining ring                                             |
| GIM-005 | CameraPCB        |             1 | Buy reference                | Supplier electronics         | `parts/gimbal/camera-pcb.ts`          | `tests/gimbal.geospec.ts`     | Opaque camera/sensor board reservation                                  |
| GIM-006 | PitchYoke        |             1 | Print                        | EOS PA 2200 / PA12           | `parts/gimbal/pitch-yoke.ts`          | `tests/gimbal.geospec.ts`     | Camera carrier and perpendicular joint seats                            |
| GIM-007 | GimbalMount      |             1 | Print                        | EOS PA 2200 / PA12           | `parts/gimbal/fixed-mount.ts`         | `tests/gimbal.geospec.ts`     | Fixed mount with M2 clearance holes                                     |
| GIM-008 | GimbalBearing    |             2 | Buy reference                | Bearing steel, supplier TBD  | `parts/gimbal/bearing.ts`             | `tests/gimbal.geospec.ts`     | 3 x 8 x 3 bearing envelope; internal elements opaque                    |
| GIM-009 | ShoulderAxle     |             1 | Machine                      | Stainless steel, grade TBD   | `parts/gimbal/shoulder-axle.ts`       | `tests/gimbal.geospec.ts`     | Pitch support shoulder spindle; fit and retention pending               |
| GIM-010 | ActuatorBody     |             2 | Buy reference                | Supplier actuator            | `parts/gimbal/actuator-body.ts`       | `tests/gimbal.geospec.ts`     | Pitch/yaw actuator body reservations; rated supplier unselected         |
| GIM-011 | ActuatorShaft    |             2 | Buy reference                | Supplier drive shaft         | `parts/gimbal/actuator-shaft.ts`      | `tests/gimbal.geospec.ts`     | Pitch/yaw shaft variants included in actuator procurement               |
| GIM-012 | CameraScrew      |             2 | Buy                          | Steel, grade TBD             | `parts/gimbal/shell-screw.ts`         | `tests/gimbal.geospec.ts`     | M2 x 10 reference                                                       |
| GIM-013 | CameraNut        |             2 | Buy                          | Steel, grade TBD             | `parts/gimbal/shell-nut.ts`           | `tests/gimbal.geospec.ts`     | M2 nut reference                                                        |
| GIM-014 | GimbalScrew      |             2 | Buy                          | Steel, grade TBD             | `parts/gimbal/mount-screw.ts`         | `tests/gimbal.geospec.ts`     | M2 x 8 mount reference                                                  |
| GIM-015 | GimbalInsert     |             2 | Buy                          | Brass, supplier TBD          | `parts/gimbal/threaded-insert.ts`     | `tests/gimbal.geospec.ts`     | M2 insert envelope; OD3.2 x4 with bore2.2                               |
| PR-001  | MotorBase        |             4 | Motor internal reference     | Vendor motor assembly        | `parts/propulsion/motor-base.ts`      | `tests/propulsion.geospec.ts` | Base/hub envelope; included in complete motor purchase                  |
| PR-002  | MotorStator      |             4 | Motor internal reference     | Vendor motor assembly        | `parts/propulsion/motor-stator.ts`    | `tests/propulsion.geospec.ts` | Combined stator/windings; laminations and insulation opaque             |
| PR-003  | MotorBell        |             4 | Motor internal reference     | Vendor motor assembly        | `parts/propulsion/motor-bell.ts`      | `tests/propulsion.geospec.ts` | Combined bell/magnets; retention and magnetic circuit opaque            |
| PR-004  | MotorShaft       |             4 | Motor internal reference     | Vendor motor assembly        | `parts/propulsion/motor-shaft.ts`     | `tests/propulsion.geospec.ts` | 5 mm shaft reference; actual supplier thread/fit required               |
| PR-005  | MotorBearing     |             8 | Motor internal reference     | Vendor motor assembly        | `parts/propulsion/motor-bearing.ts`   | `tests/propulsion.geospec.ts` | 5 x 9 x 3 reference; bearing races/balls/seals opaque                   |
| PR-006  | MotorScrew       |            16 | Buy                          | Steel, grade TBD             | `parts/propulsion/motor-screw.ts`     | `tests/propulsion.geospec.ts` | Four M3 mounting screws per motor; length verified against actual motor |
| PR-007  | Propeller        |             4 | Buy reference                | Rated supplier propeller     | `parts/propulsion/propeller.ts`       | `tests/propulsion.geospec.ts` | Two CW and two CCW 127 mm envelopes; no flight-print approval           |
| PR-008  | PropNut          |             4 | Buy                          | Supplier nut                 | `parts/propulsion/prop-nut.ts`        | `tests/propulsion.geospec.ts` | Propeller retention envelope; thread and locking method TBD             |
| AV-001  | Battery          |             1 | Buy reference                | Supplier 6S battery          | `parts/avionics/battery.ts`           | `tests/avionics.geospec.ts`   | 70 x 32 x 34 reservation; capacity/current/supplier unselected          |
| AV-002  | ESC              |             1 | Buy reference                | Supplier electronics         | `parts/avionics/esc.ts`               | `tests/avionics.geospec.ts`   | Four-channel ESC reservation; 20 mm square mounting                     |
| AV-003  | FlightController |             1 | Buy reference                | Supplier electronics         | `parts/avionics/flight-controller.ts` | `tests/avionics.geospec.ts`   | Flight-controller reservation; 20 mm square mounting                    |
| AV-004  | Receiver         |             1 | Buy reference                | Supplier electronics         | `parts/avionics/receiver.ts`          | `tests/avionics.geospec.ts`   | Radio receiver reservation                                              |
| AV-005  | BoardStandoff    |             8 | Buy or machine               | Metal, supplier TBD          | `parts/avionics/standoff.ts`          | `tests/avionics.geospec.ts`   | Four 3.4 mm lower and four 7.4 mm interboard spacers                    |
| AV-006  | BoardScrew       |             4 | Buy                          | Steel, grade TBD             | `parts/avionics/board-screw.ts`       | `tests/avionics.geospec.ts`   | Board-stack screw reference; final engagement pending                   |
| AV-007  | BoardIsolator    |             4 | Buy                          | Silicone, hardness TBD       | `parts/avionics/board-isolator.ts`    | `tests/avionics.geospec.ts`   | Four board isolation washers                                            |
| AV-008  | PowerConnector   |             1 | Buy reference                | Supplier connector           | `parts/avionics/power-connector.ts`   | `tests/avionics.geospec.ts`   | Opaque 10 x 10 x 5 connector reservation                                |
| AV-009  | PowerWire        |             2 | Cut/terminate purchased wire | Copper / rated insulation    | `parts/avionics/power-wire.ts`        | `tests/avionics.geospec.ts`   | Positive and negative lead envelopes; actual gauge and terminals TBD    |
| AV-010  | Antenna          |             1 | Buy reference                | Supplier antenna             | `parts/avionics/antenna.ts`           | `tests/avionics.geospec.ts`   | RF reservation; connector/cable/radiator details opaque                 |

### Physical assembly hierarchy

| ID      | SysML definition   | Qty / vehicle | Native CAD source                | GeoSpec trace                 | Roll-up                                         |
| ------- | ------------------ | ------------: | -------------------------------- | ----------------------------- | ----------------------------------------------- |
| SYS-000 | Quadcopter         |             1 | `main.ts`                        | `main.geospec.ts`             | 123 physical reference occurrences              |
| AF-100  | AirframeAssembly   |             1 | `assemblies/airframe.ts`         | `tests/airframe.geospec.ts`   | 29 physical leaf occurrences                    |
| AF-110  | ArmModule          |             4 | `assemblies/arm-module.ts`       | `tests/arm-module.geospec.ts` | 4 physical leaves per module                    |
| GIM-100 | GimbalAssembly     |             1 | `assemblies/gimbal.ts`           | `tests/gimbal.geospec.ts`     | 22 physical leaves including camera cartridge   |
| GIM-110 | CameraCartridge    |             1 | `assemblies/camera-cartridge.ts` | `tests/gimbal.geospec.ts`     | 9 physical leaves                               |
| PR-100  | PropulsionAssembly |             1 | `assemblies/propulsion.ts`       | `tests/propulsion.geospec.ts` | 48 physical leaves including four motor modules |
| PR-110  | MotorModule        |             4 | `assemblies/motor-module.ts`     | `tests/propulsion.geospec.ts` | 12 physical reference leaves per module         |
| AV-100  | AvionicsAssembly   |             1 | `assemblies/avionics.ts`         | `tests/avionics.geospec.ts`   | 24 physical reference leaves                    |

```text
Quadcopter
├── AirframeAssembly
│   ├── UpperShell + LowerShell
│   ├── ArmModule × 4
│   │   └── ArmFairing + CarbonSpar + RootClamp + MotorPad
│   ├── BatterySaddle + BatteryStrap × 2
│   └── AirframeScrew × 4 + AirframeInsert × 4
├── GimbalAssembly
│   ├── CameraCartridge
│   │   └── CameraFront + CameraRear + OpticalDome + LensRetainer + CameraPCB
│   │       + CameraScrew × 2 + CameraNut × 2
│   ├── PitchYoke + GimbalMount + GimbalBearing × 2 + ShoulderAxle
│   ├── ActuatorBody × 2 + ActuatorShaft × 2
│   └── GimbalScrew × 2 + GimbalInsert × 2
├── PropulsionAssembly
│   └── MotorModule × 4
│       └── MotorBase + MotorStator + MotorBell + MotorShaft + MotorBearing × 2
│           + MotorScrew × 4 + Propeller + PropNut
└── AvionicsAssembly
    ├── Battery + ESC + FlightController + Receiver + PowerConnector + Antenna
    ├── PowerWire × 2
    └── BoardStandoff × 8 + BoardScrew × 4 + BoardIsolator × 4
```

### Procurement boundary and unmodeled production detail

The decomposition stops at a separately fabricated custom part, hardware item or opaque supplier unit. No motor lamination, winding strand, magnet adhesive, bearing ball/race/seal, battery cell separator, PCB component or optical prescription is invented. Such details belong to the selected supplier's controlled design.

The following production detail is **unreleased and excluded from the modeled quantity total**: selected motor phase leads/terminations; ESC/FC/receiver interconnects; camera video path; both gimbal flex leads and strain reliefs; any required regulator or gimbal controller; exact connector contacts; supplier battery terminals; qualified adhesive/primer and bond-line quantity; final strap closure; labels and consumables. The logical SysML connections specify required interfaces, not a claim that these missing harness and supplier details have been geometrically completed. Complete this schedule and assign approved part numbers before purchasing or drawing release.

## Verification and requirement trace

Revision A, 20 September 2026. `system/quadcopter.sysml` defines the configuration and requirements; the bill of materials section maps every modeled physical leaf to its native source and test suite. Tests were authored before their geometry. A test's presence is trace coverage; only a successful execution against the current source is a test result.

### Executable checks

| SysML requirement | Acceptance statement                                                                                   | Executable evidence                                                                                                | Scope and remaining evidence                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-SYS-001         | Every modeled custom and purchased-reference leaf and physical subassembly has a source file and trace | Source, BOM and test cross-reference review                                                                        | Checks file/BOM/SysML/test references. Does not parse SysML or prove geometry. Supplier internals and not-yet-detailed items remain explicitly identified.                                                                         |
| R-GEO-001         | Leaf parts are connected, watertight solids with valid BRep topology                                   | `tests/airframe.geospec.ts`, `tests/gimbal.geospec.ts`, `tests/propulsion.geospec.ts`, `tests/avionics.geospec.ts` | Each suite loads leaf source files independently. Closed geometry is not a manufacturing process or material test.                                                                                                                 |
| R-AERO-001        | The nominated parent NACA curves preserve the stated analytic thickness law                            | `tests/naca.geospec.ts`                                                                                            | Numerical Bernstein/formula comparisons, independent analytic area/volume checks and dimensional checks. Rounded/truncated manufactured regions are excluded from the claim of an unmodified NACA profile.                         |
| R-AERO-002        | Aerodynamic fairings use curved external parent surfaces and identify manufacturing modifications      | `tests/naca.geospec.ts`; source review; Tau screenshot                                                             | Visual and analytic geometry evidence only. Whole-surface curvature continuity, finish, roughness and measured drag need verification. Internal datums and purchased interfaces retain planes.                                     |
| R-FIT-001         | Motor, spar, electronic-stack and camera interfaces preserve nominated dimensions                      | Feature checks in the four leaf suites below                                                                       | These are nominal CAD interfaces. GD&T, wall thickness, tolerance stacks and physical fits need first-article inspection.                                                                                                          |
| R-PROP-001        | Four motors are located at `(±85, ±85)` with four handed 127 mm reference rotors                       | `tests/propulsion.geospec.ts`; `main.geospec.ts`                                                                   | Static placement and assembly solids. Flexing blades, structural deflection, true prop geometry, RPM, torque and thrust are not simulated.                                                                                         |
| R-GIM-001         | A two-axis gimbal packages the camera and permits the nominated pitch/yaw configurations               | `tests/gimbal.geospec.ts`; `main.geospec.ts`                                                                       | 25 configurations: pitch −25/−12.5/0/12.5/25° × yaw −12/−6/0/6/12°, both independently and installed. Discrete configurations do not prove continuous clearance; supplier drive, harness, stops and tolerance effects remain open. |
| R-PRINT-001       | PA12 printing process and local feature sizes support the released loads and fits                      | CAD/source checks; the manufacturing baseline section G02–G04                                                      | Open: minimum-normal-wall survey, process capability, conditioned material coupons, pull-out/creep/fatigue and proof tests. No GeoSpec result is a material strength result.                                                       |
| R-ELEC-001        | Power, signal, optical and control interfaces are physically and functionally complete                 | SysML power/command/video/mechanical connections; `tests/avionics.geospec.ts`                                      | Logical topology and packaging only. Supplier voltage/current/torque limits, regulator, schematic, full harness, protection, control and EMC tests remain open.                                                                    |
| R-PERF-001        | The complete vehicle achieves approved speed/endurance/stability requirements                          | the manufacturing baseline section G01, G05–G08, G10                                                               | Open: numerical performance requirements, validated aerodynamic/structural/thermal models, bench results and flight evidence.                                                                                                      |
| R-DFM-001         | The approved manufacturing definition can be released with reproducible parts and inspection           | the manufacturing baseline section; the bill of materials section; SysML release status                            | Open: supplier selection, joint detailing, process qualification, semantic SysML validation, approved drawings and first-article report.                                                                                           |

### Leaf coverage and interfaces

The common leaf checks are: a watertight representation, one connected component and one valid BRep solid. Airframe leaves additionally have volume sanity ranges. Propulsion and avionics leaves have controlled bounding envelopes and volume lower bounds. Gimbal leaves have individual bounding envelopes. Additional checks below exercise the interfaces that a generic volume check cannot establish.

| Part source                           | GeoSpec suite                 | Additional acceptance / inspection to complete                                                                                             |
| ------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `parts/airframe/upper-shell.ts`       | `tests/airframe.geospec.ts`   | Named service half and no overlap with lower half; inspect minimum normal wall, seam and openings                                          |
| `parts/airframe/lower-shell.ts`       | `tests/airframe.geospec.ts`   | Named service half; inspect bosses, electronic mounts, battery fit and gimbal interface                                                    |
| `parts/airframe/arm.ts`               | `tests/airframe.geospec.ts`   | Exact parent NACA law covered independently; spar/fairing interference in arm-module suite; inspect socket minimum wall and cap transition |
| `parts/airframe/spar.ts`              | `tests/airframe.geospec.ts`   | 8 mm OD × 5 mm ID × 64 mm; inspect laminate, straightness and cut ends                                                                     |
| `parts/airframe/root-clamp.ts`        | `tests/airframe.geospec.ts`   | 8.3 mm through socket; prove retention, clamp fastening and body load path                                                                 |
| `parts/airframe/motor-pad.ts`         | `tests/airframe.geospec.ts`   | Ø32 × 12, Ø8.4 shaft clearance, four Ø3.3 holes on 16 mm square; prove retention and motor heat/creep resistance                           |
| `parts/airframe/battery-saddle.ts`    | `tests/airframe.geospec.ts`   | Inspect strap slots, abrasion protection, battery removal clearance and positive restraint                                                 |
| `parts/airframe/shell-screw.ts`       | `tests/airframe.geospec.ts`   | M2.5 × 8 reference envelope; authoritative thread/head specification and engagement still required                                         |
| `parts/airframe/heat-set-insert.ts`   | `tests/airframe.geospec.ts`   | Reference insert shape; qualify supplier insert fit, installation and pull-out/torque                                                      |
| `parts/airframe/battery-strap.ts`     | `tests/airframe.geospec.ts`   | Strap routing envelope; select webbing, closure, tension and restraint proof load                                                          |
| `parts/gimbal/camera-front.ts`        | `tests/gimbal.geospec.ts`     | Optical aperture and shell screw bores; inspect normal wall, optical stack and cover seam                                                  |
| `parts/gimbal/camera-rear.ts`         | `tests/gimbal.geospec.ts`     | Pitch spindle bores; inspect bearing/axle retention and sensor-board interface                                                             |
| `parts/gimbal/optical-dome.ts`        | `tests/gimbal.geospec.ts`     | Supplier optical envelope; obtain optical prescription, transmission, distortion and surface quality                                       |
| `parts/gimbal/lens-retainer.ts`       | `tests/gimbal.geospec.ts`     | Retainer envelope; verify axial retention, contact pressure, optical clearance and fastening                                               |
| `parts/gimbal/camera-pcb.ts`          | `tests/gimbal.geospec.ts`     | Opaque purchased envelope; obtain camera FOV, focus, heat, video protocol and connector data                                               |
| `parts/gimbal/pitch-yoke.ts`          | `tests/gimbal.geospec.ts`     | Perpendicular pitch/yaw bearing seats and actuator pocket; verify axis alignment and dynamic stiffness                                     |
| `parts/gimbal/fixed-mount.ts`         | `tests/gimbal.geospec.ts`     | Two M2 clearance holes and central drive clearance; verify body attachment and yaw alignment                                               |
| `parts/gimbal/bearing.ts`             | `tests/gimbal.geospec.ts`     | 3 mm through spindle bore; select real 3 × 8 × 3 bearing and tolerance class                                                               |
| `parts/gimbal/shoulder-axle.ts`       | `tests/gimbal.geospec.ts`     | Dimensional envelope; specify shoulder/shaft fit, retention and surface finish                                                             |
| `parts/gimbal/actuator-body.ts`       | `tests/gimbal.geospec.ts`     | Purchased actuator reservation; prove torque, speed, stiffness, heat and mechanical fixing                                                 |
| `parts/gimbal/actuator-shaft.ts`      | `tests/gimbal.geospec.ts`     | Purchased drive reservation; prove actual coupling interface and axial retention                                                           |
| `parts/gimbal/shell-screw.ts`         | `tests/gimbal.geospec.ts`     | M2 × 10 screw envelope; actual thread, grade and engagement                                                                                |
| `parts/gimbal/shell-nut.ts`           | `tests/gimbal.geospec.ts`     | M2 nut envelope; prove trapping/anti-rotation and locking method                                                                           |
| `parts/gimbal/mount-screw.ts`         | `tests/gimbal.geospec.ts`     | M2 × 8 mount envelope; prove engagement and installation access                                                                            |
| `parts/gimbal/threaded-insert.ts`     | `tests/gimbal.geospec.ts`     | M2 insert reference; Ø3.2 × 4 and 2.2 mm modeled bore; installation and pull-out qualification                                             |
| `parts/propulsion/motor-base.ts`      | `tests/propulsion.geospec.ts` | 16 mm square motor mounting pattern and bearing bore; supplier-authoritative motor drawing required                                        |
| `parts/propulsion/motor-stator.ts`    | `tests/propulsion.geospec.ts` | Stator/winding combined envelope; electromagnetic and insulation internals remain supplier opaque                                          |
| `parts/propulsion/motor-bell.ts`      | `tests/propulsion.geospec.ts` | Bell/magnet combined envelope; supplier rotor strength, magnet retention and balance                                                       |
| `parts/propulsion/motor-shaft.ts`     | `tests/propulsion.geospec.ts` | Nominal 5 mm shaft envelope; supplier fit, thread, material and runout                                                                     |
| `parts/propulsion/motor-bearing.ts`   | `tests/propulsion.geospec.ts` | 5 mm bore and 9 mm housing diameter; real bearing tolerances, load/RPM and retention                                                       |
| `parts/propulsion/motor-screw.ts`     | `tests/propulsion.geospec.ts` | M3 mounting screw envelope; verify purchased grade, head access and safe engagement into motor                                             |
| `parts/propulsion/propeller.ts`       | `tests/propulsion.geospec.ts` | CW/CCW variants, connected 3-blade envelope and 5.2 mm bore; rated supplier blade geometry and performance required                        |
| `parts/propulsion/prop-nut.ts`        | `tests/propulsion.geospec.ts` | Nut envelope; selected supplier shaft thread and locking torque                                                                            |
| `parts/avionics/battery.ts`           | `tests/avionics.geospec.ts`   | 70 × 32 × 34 reservation; actual cell count, capacity, current, swelling/thermal/connector allowances                                      |
| `parts/avionics/esc.ts`               | `tests/avionics.geospec.ts`   | Four 2.2 mm holes on 20 mm square; component heights, cooling, full input voltage/current ratings                                          |
| `parts/avionics/flight-controller.ts` | `tests/avionics.geospec.ts`   | Four 2.2 mm holes on 20 mm square; mounting isolation, IMU alignment, connectors and software                                              |
| `parts/avionics/receiver.ts`          | `tests/avionics.geospec.ts`   | Receiver envelope; radio link, mounting, EMI and failsafe verification                                                                     |
| `parts/avionics/standoff.ts`          | `tests/avionics.geospec.ts`   | 7.4 and 3.4 mm heights, M2 passage; thread/retention and complete stack                                                                    |
| `parts/avionics/board-screw.ts`       | `tests/avionics.geospec.ts`   | Board screw envelope; verify head access, thread length, grade and retention                                                               |
| `parts/avionics/board-isolator.ts`    | `tests/avionics.geospec.ts`   | Elastomer envelope; select compound, hardness, compression and isolation response                                                          |
| `parts/avionics/power-connector.ts`   | `tests/avionics.geospec.ts`   | Connector reservation; selected polarity/keying, contacts, strain relief and current rating                                                |
| `parts/avionics/power-wire.ts`        | `tests/avionics.geospec.ts`   | Routed lead envelope; current-based conductor selection, insulation, terminals and bend radius                                             |
| `parts/avionics/antenna.ts`           | `tests/avionics.geospec.ts`   | Antenna envelope; actual radiating geometry, carbon clearance, attachment and RF performance                                               |

### Assembly coverage

| Native assembly                  | Requirement evidence                                                                                                                                                             | Boundary of evidence                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `assemblies/arm-module.ts`       | `tests/arm-module.geospec.ts`: four solids and complete pairwise interference in all four quadrants, clamp positions                                                             | Does not prove structural bonding or fastening strength                                                                |
| `assemblies/airframe.ts`         | `tests/airframe.geospec.ts`: all 29 solids, complete pairwise interference, multiplicities, bounding envelope and shell service seam                                             | Full load path and assembly operations require review                                                                  |
| `assemblies/gimbal.ts`           | `tests/gimbal.geospec.ts`: neutral packaging, 22-solid count and complete interference at 25 travel configurations                                                               | Continuous sweep and cable envelope remain open                                                                        |
| `assemblies/camera-cartridge.ts` | `tests/gimbal.geospec.ts`: nine closed camera components and interference checks                                                                                                 | Optical prescription, camera function and retention need supplier evidence                                             |
| `assemblies/motor-module.ts`     | `tests/propulsion.geospec.ts`: all 12 physical reference leaves and complete interference for both CW/CCW variants                                                               | Vendor motor internals and rotating strength remain opaque                                                             |
| `assemblies/propulsion.ts`       | `tests/propulsion.geospec.ts`: four motor placements, handed rotors and overlap checks                                                                                           | Supplier geometry, rotating/thermal behaviour and real fastening remain open                                           |
| `assemblies/avionics.ts`         | `tests/avionics.geospec.ts`: all 24 solids, component stations, stack and complete interference without allowances                                                               | Reference component reservations do not establish a circuit or complete harness                                        |
| `main.ts`                        | `main.geospec.ts`: all 123 valid solids and complete pairwise interference at neutral and the four gimbal travel corners, millimetre BRep, watertight surfaces and volume sanity | Discrete rigid configurations; does not establish continuous motion, rotor swept volume, flight performance or release |

Every independent assembly interference check uses all pairs unless explicitly labeled as a focused interface check. The complete vehicle checks every pair at neutral, then every gimbal component against every installed component at the four travel corners (the gimbal suite alone covers the 25-pose grid). Only the gimbal builder receives articulation parameters, so static pairs need not be rechecked at each pose. The only intentional-overlap allowances are the four same-number AF-008 screw/AF-009 insert thread envelopes, each capped at 6.5 mm³. Pattern selectors use regular expressions; plain strings are exact names in GeoSpec.

GeoSpec's interference matcher uses tessellated mesh overlap even for STEP-loaded subjects. The installed-pose grid therefore loads native meshes and verifies 123 uniquely named, watertight occurrences at each pose. STEP separately supplies full-assembly BRep validity and exactly 123 solids, plus validity and 22 solids for the independently loaded gimbal at every pose. This avoids retaining 25 redundant whole-vehicle STEP copies. It is not a continuous motion proof.

### Result recording and semantic validation

Current-source verification, 21 September 2026 (NZST): a native OCCT common-volume checker (a Node-only script not shipped with this example) passed all 123 occurrences at the nine combinations of pitch −25/0/25° and yaw −12/0/12°. It screened 67,527 component-pair/configuration combinations, applied exact common-volume checks to overlapping bounding boxes, and found no invalid solids or unintended overlaps above 0.001 mm³. The initial neutral source had 55 unintended overlapping pairs. Current Tau compilation reports `ready` with no issues, and the final isometric screenshot has been inspected.

Run `get_kernel_result` for current compile/runtime diagnostics, `test_model` for current GeoSpec results and `screenshot` for visual inspection after geometry edits. Save the actual result counts, source revision and failure details with the manufacturing review record; do not substitute this planned coverage table for execution evidence.

The locally discovered Tau SysML support is syntax highlighting. No installed SysML v2 semantic parser/runtime was found in the inspected application, plugin and tool locations. Load `system/quadcopter.sysml` with the standard libraries into a conforming SysML v2 tool and resolve diagnostics before G09 closes. The textual constructs follow the [OMG SysML 2.0 language specification](https://www.omg.org/spec/SysML/2.0/Language/PDF); this repository does not claim parser-certified conformance.
