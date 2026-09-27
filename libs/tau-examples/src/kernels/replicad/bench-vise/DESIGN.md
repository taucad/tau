# BV-125 bench vice

Parametric Replicad assembly of a fixed-base bench vice: 125 mm jaws,
100 mm travel, twin 20 mm guide rods, bronze bushes and drive nut, explicit
20 x 4 mm trapezoidal screw, thrust washers, pinned hub, captive sliding
handle, replaceable grooved jaws, and six socket screws. There are 21 named
solids. All dimensions are millimetres.

Open `main.ts` in Tau. `vice.sysml` contains the SysML v2 structure,
requirements, satisfaction relationships and verification plan.
`main.geospec.ts` is the executable geometric acceptance suite.

| Parameter        |    Default | Supported range                  |
| ---------------- | ---------: | -------------------------------- |
| `opening`        |         55 | 0–100 mm                         |
| `jawWidth`       |        125 | 100–150 mm                       |
| `guideClearance` |       0.10 | 0.05–0.25 mm radial              |
| `handleOffset`   |          0 | −60–60 mm                        |
| `component`      | `Assembly` | Any exact part name in the tests |

The bench is Z=0; the fixed gripping plane is X=0; the moving plane is
X=`opening`. The mounting base is 145 × 176 × 16, with four 11 mm holes on
a 107 × 140 pattern. Each mounting hole has a 20 mm diameter × 11 mm deep
counterbore; installed heads must be at most 19.5 mm diameter × 10.5 mm high
so they stay below the carriage. The jaw faces are 30 mm tall at Z=82–112. Their grip
grooves are 1 mm wide and 0.6 mm deep at 5 mm pitch. The body stays at least
125 mm wide so narrower jaw inserts do not compromise guide-bore support.

## Bill of materials

| Component                          | Qty | Material / interface                                   |
| ---------------------------------- | --: | ------------------------------------------------------ |
| Frame with fixed tower             |   1 | Ductile iron; blue finish; machined mounting face      |
| Carriage                           |   1 | Ductile iron; blue finish                              |
| Removable jaw                      |   2 | Hardened tool steel; 6 mm thick                        |
| Guide with integral rear stop      |   2 | Ground steel; 20 mm shaft; 26 mm shoulder              |
| Flanged guide bush                 |   2 | Bronze; 26 mm OD; 20.2 mm default ID                   |
| Lead spindle                       |   1 | Alloy steel; custom 20 × 4 trapezoidal thread          |
| Flanged drive nut                  |   1 | Bronze; matched helical cavity                         |
| Thrust washer                      |   2 | Hardened steel; 34 OD × 20.6 ID × 3                    |
| Handle hub                         |   1 | Steel; 32 OD; transverse handle bore 12.3              |
| Hub pin                            |   1 | Hardened steel; 4.02 diameter × 32; press fit into hub |
| Tommy bar with permanent end knobs |   1 | Steel; 12 mm shaft; 20 mm knobs                        |
| Jaw socket screw                   |   4 | M6 envelope, recessed head                             |
| Nut flange socket screw            |   2 | M6 envelope                                            |

## Assembly and operation

1. Fit the flanged bronze bushes from the rear of the frame. Fit and screw
   the drive nut against the rear frame face.
2. Feed both guides through the bushes from the rear. Press their front
   ends 30 mm into the carriage sockets. The model specifies 0.02 mm radial
   interference; establish actual fits from materials and process capability.
3. Place the rear thrust washer behind the carriage. Feed the spindle from
   the rear through the nut, washer and carriage. Its integral shoulder
   retains the rear washer.
4. Fit the front washer and hub, align the cross holes and secure the hub
   pin into the 4.00 mm hub hole. The pin transfers torque and opening thrust.
   Its retention fit requires qualification before release.
5. Insert the handle before permanently joining its second end knob; the
   CAD represents the finished bar and both knobs as one revolved solid.
6. Screw on both jaws. Bolt the frame to a suitably rated bench using the
   four mounting holes; bench thickness determines the mounting hardware.
   Locate the bench front edge at or behind X=55. The rotating handle stays
   at least 4 mm beyond that edge, including when the jaws are closed.

At 100 mm opening the guide shoulders meet the rear bush flanges. Both
guides still engage the complete 59 mm bearing barrel. Lubricate the screw,
nut and thrust faces. The exposed rods and screw require cleaning in use.

## Verification scope

Verified 2026-09-22: **91/91 GeoSpec cases pass**, kernel status `ready`,
and final geometry visually inspected. Tested `main.ts` SHA-256:
`9c77f7484050b55025f37a3b3789f7a927b641c547f2113a609a382f0c11597b`.

The combined MCP call exceeds its 300-second limit. Reproduce complete
coverage with `test_model` in three batches using these `testNamePattern`
values (83 + 4 + 4 cases, no omissions):

- `^(?!.*(?:R04 R11 opening|R08 rotating))`
- `R04 R11 opening`
- `R08 rotating`

GeoSpec checks the 21-part inventory and placements, individual BRep
validity, solid count, watertightness, connectedness and volume; mounting
holes and bench plane; jaw grooves and counterbores; guide diameters and
running clearances; spindle/nut topology and material; washer volumes;
hub bores; socket screws; travel positions 0, 25, 55 and 100; end-stop
contact; parameter limits; and assembly interference. Only the two specified
guide/carriage press fits (40 mm³ each) and hub-pin press fit (2 mm³) have
interference allowances.

Mounting-hole passage uses bounded void continuity because GeoSpec's
`through` classifier compares a bore against the entire frame height.
Spindle envelope checks use rendered geometry because the exact reader's
conservative helical B-spline bounds add padding; BRep validity and topology
are still checked separately. Thread volume, topology and mating clearance
are proxies, not a thread gauge or pitch/flank metrology.

Thread phase, spindle cross-drilling, hub, pin and handle rotate together
as opening changes, at 90 degrees per millimetre of the 4 mm lead. The
handle is horizontal at the default 55 mm opening. Additional eighth-turn
samples check rotating-handle interference; its entire rotational envelope
is ahead of the base and the specified bench edge. Dynamic loads and
contact friction are not simulated. Commodity M6 threads are represented by shaft
and bore envelopes. The main screw thread is explicit and custom, not a
claim of conformance to a standard thread designation.

<!-- ponytail: commodity M6 fasteners use thread envelopes; add helical detail when fastener thread metrology is required. -->

The SysML text follows the [official SysML v2 examples](https://github.com/Systems-Modeling/SysML-v2-Release/tree/master/sysml/src/examples/Simple%20Tests).
No SysML semantic compiler is installed in this project. The executable
verification is GeoSpec, with requirement identifiers shared by the spec
and tests.

The 3 kN clamp force and 15 Nm torque are design targets, not ratings.
R13 remains open: stress, fatigue, wear, loaded jaw parallelism, manufacturing
tolerances, mounting strength and retention require engineering analysis
and a prototype. Geometric test success alone does not release this design
for manufacture.
