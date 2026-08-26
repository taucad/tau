---
name: brep-design
description: >-
  Design manufacture-ready CAD parts and assemblies with native BRep features
  (sketched profiles, extrude, revolve, sweep, loft, shell, fillet, chamfer,
  draft) and feature-tree thinking instead of CSG primitive-butting. Use when
  modeling any part or assembly in replicad — castings, housings, manifolds,
  ducts, brackets, shafts, covers, gears, springs, fastened joints — when
  choosing between boxes/cylinders/booleans and sketched features, or when a
  design must survive a manufacturability review. Includes numeric DFM
  checklists (catalog standards, tolerance stack-up, design for assembly,
  casting/machining/sheet-metal proportions) and an additive-manufacturing
  rulebook.
---

# BRep Design

CSG primitive-butting — assembling parts from boxes and cylinders joined by
`fuse`/`cut` — produces geometry that renders but cannot be manufactured:
solid bars where fluid must flow, unsplit rings that cannot be installed,
mitred cylinder seams where one swept duct belongs, air gaps posing as
contact. Native BRep features start from engineering intent: a sketched
cross-section on a datum plane, driven through one of five form-making
operations, refined by engineered secondary features. Primitives and booleans
are a fallback (and legitimate as _cutting tools_ for hole features), never
the design vocabulary.

Every replicad operation named here is verified against the pinned build; see
[reference.md](reference.md) for exact signatures and the list of operations
that do NOT exist (threads, patterns, counterbore primitives, gear
generators) with their sanctioned workarounds. Numeric DFM rules — standard
feature sizes, tolerance stacks, assembly error-proofing, per-process
proportion tables — live in [dfm-checklists.md](dfm-checklists.md); parts
whose process is printing follow [additive-dfm.md](additive-dfm.md).

## Feature-Tree Discipline

Model every part in this order. Each step is a deliberate feature with a
manufacturing meaning, not a shape that happens to look right.

1. **Datums first.** Establish the part's frames before any geometry: primary
   axis, deck/parting planes, mounting faces. Derive them from the shared
   params module (`makePlane("XZ", offset)`, `plane.pivot(angle, "Y")`), never
   from scattered absolute literals.
2. **Primary form.** One sketched cross-section on a datum plane, driven by
   the ONE right form-maker (below). The primary form of a casting is a
   single coherent solid — not a pile of fused prisms.
3. **Secondary form.** Bosses, ribs, pads, flanges — each a sketched profile
   extruded/lofted onto the primary form, placed by the params module.
4. **Voids and passages.** Internal flow paths, cored pockets, lightening
   windows — modeled as real connected voids (see below).
5. **Holes and threads.** Engineered hole stacks (drill/tap/counterbore/
   spotface) cut with revolved tool profiles; thread callouts as metadata.
6. **Edge treatment last, planned early.** Fillets, chamfers, draft are the
   final features in the tree, but their budgets (draft angle, corner radii,
   entry chamfers) are decided when the form is sketched — a form that cannot
   accept its fillets is the wrong form. Execution order when radii are many:
   draft before fillets, largest structural radii first, one pass per region
   (`combineFinderFilters`), split failing chains at natural vertices and
   reduce locally rather than dropping treatment.

## The Five Form-Makers

| Operation       | replicad                                                                      | THE right operation for                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extrude         | `sketch.extrude(dist, { twistAngle?, extrusionProfile? })`                    | Constant-section forms: ribs, webs, plates, beam sections, cam lobes, gear/sprocket tooth profiles                                                |
| Revolve         | `sketch.revolve(axis?, { angle? })`                                           | Any axisymmetric part: shafts, bushings, valves, seats, pulleys, bolt blanks. Partial `angle` yields split halves with real parting faces         |
| Sweep           | `spineSketch.sweepSketch(profileFn)` / `genericSweep(wire, spine, cfg)`       | Any duct, runner, pipe, gallery, spring: one section carried along a tangent-continuous path wire — never butted cylinder segments                |
| Loft            | `sketch.loftWith(others, { ruled?, startPoint?, endPoint? })` / `loft(wires)` | Section-to-section transitions: flange-to-runner, collector merges, bellmouths (loft to a `endPoint` closes to a point), blended structural forms |
| Shell / thicken | `solid.shell(t, faceFinder)` / `makeOffset(face, t)`                          | Any vessel, cover, pan, housing, volute: model the outer form solid, then shell to a uniform wall with the open face(s) removed                   |

Decision rules, not suggestions:

- Cross-section constant along a straight line → extrude.
- Cross-section constant around an axis → revolve the TRUE cross-section
  (bore, flange, grooves, seat cones all in one profile), not a stack of
  butted cylinders.
- Cross-section carried along a curve → sweep along one G1-continuous path
  (pen-drawn `tangentArc` segments guarantee tangency). A bend is part of the
  path, never a second solid mitred against the first. Gas-flow passages
  (ports, runners) prefer curvature-continuous (G2) spines — `smoothSpline`
  segments — because flow separates at curvature steps that G1 arcs leave.
- Cross-section changes between stations → loft between sketched sections.
- Thin-walled anything → shell a solid, never assemble plates into a box.

### Form-maker idioms

Revolve — flanged bushing: bore, flange, and step in one profile (CSG
primitive-butting would butt three cylinders and cut one):

```ts
import { draw } from 'replicad';

const bushing = draw([6, 0]) // start at bore radius on the axis-normal face
  .hLine(8) // flange face out to r14
  .vLine(3) // flange land
  .hLine(-4) // step down to body r10
  .vLineTo(25) // body wall
  .hLineTo(6) // top face in to the bore
  .close() // bore wall back to start
  .sketchOnPlane('XZ')
  .revolve(); // default axis Z
```

Sweep — hollow intake runner: one tangent-continuous spine, outer and bore
sections swept along it, cut for a real lumen with a declared wall:

```ts
import { Sketcher, sketchCircle } from 'replicad';

const spinePath = () =>
  new Sketcher('XZ')
    .vLine(60) // rise off the flange
    .tangentArc(25, 25) // G1 bend — tangency guaranteed by the pen
    .hLine(40) // run to the plenum wall
    .done(); // open path: done(), not close()

const outer = spinePath().sweepSketch((plane, origin) => sketchCircle(16, { plane, origin }));
const lumen = spinePath().sweepSketch((plane, origin) => sketchCircle(13, { plane, origin }));
const runner = outer.cut(lumen); // real 3 mm wall, no mitre seams
```

Loft — rectangular flange to round throat in one watertight transition:

```ts
import { sketchCircle, sketchRoundedRectangle } from 'replicad';

const flange = sketchRoundedRectangle(48, 38, 8, { plane: 'XY' });
const throat = sketchCircle(15, { plane: 'XY', origin: 40 });
const transition = flange.loftWith(throat, { ruled: false });
```

Shell — cover as a shelled crown, open at the gasket face, uniform wall:

```ts
import { drawRoundedRectangle } from 'replicad';

const cover = drawRoundedRectangle(120, 80, 12)
  .sketchOnPlane('XY')
  .extrude(30)
  .fillet(6, (e) => e.inPlane('XY', 30)) // crown corners first
  .shell(3, (f) => f.inPlane('XY')); // remove gasket face, 3 mm wall
```

Extrude — I-beam section for a structural link (a sketched section, not a
decorated slab):

```ts
import { draw } from 'replicad';

const beam = draw([-15, -20])
  .hLine(30)
  .vLine(6)
  .hLine(-11)
  .vLine(28)
  .hLine(11)
  .vLine(6)
  .hLine(-30)
  .vLine(-6)
  .hLine(11)
  .vLine(-28)
  .hLine(-11)
  .close()
  .sketchOnPlane('XZ')
  .extrude(120);
```

## Voids Are Geometry

A part with solid metal where fluid flows is not a model of the part. Every
internal flow path — intake/exhaust port, oil gallery, water jacket, pump
volute, runner lumen — is real connected void geometry with walls:

- Model the void deliberately: sweep/loft a core solid along the passage
  route, then cut it from the casting; or shell the housing and bore the
  connections. Drilled galleries are straight-hole cuts that MEET — a gallery
  network is connected from source to every consumer, with chamfered exits
  where drillings break into journal surfaces.
- One coherent solid per casting. Verify cohesion after the feature tree
  runs; a casting that is secretly five disconnected lumps is a construction
  error, not a style issue.
- Walls have budgets. Declare wall thickness in the params module (casting
  walls typically 4–8 mm, uniform) and check that bores, pockets, and
  passages never breach a declared wall. A cut that overshoots into an
  adjacent chamber is invisible to booleans — budget it at sketch time:
  compute the remaining land from params before placing the cut.
- Passages connect where the schematic says: flange opening → passage →
  chamber. Dead-end "ports" that stop at a solid face are the signature CSG
  primitive-butting failure.

## Split-Line Thinking

Assemblability is a modeling-time property. Anything that installs around
another part must be MODELED split:

- Bearing shells, bushings around a crank/shaft between shoulders: two 180°
  halves (`revolve(axis, { angle: 180 })` gives real planar parting faces),
  with locating tangs and declared crush interference — never a full 360°
  ring that could not physically be installed.
- Caps (bearing caps, split housings, clamp blocks): separate occurrences
  with a parting plane through the bore, registers or dowels for location,
  and fastener stacks through real holes in BOTH halves.
- Piston-ring-class parts: split with an end gap (an angled gap cut), sized
  to reach their sealing surface.
- Rotors/gears trapped between webs: check the insertion path exists; if it
  does not, the part splits or the housing does.
- Opposite-hand parts: model the true single-hand part once and
  `part.clone().mirror("XZ")` for the other side — never a double-featured
  symmetric prototype carrying a dead mirror set of unused features.

## Real Interfaces, No Magic Standoffs

Mating faces meet at true contact or at the specified fit — never a cosmetic
0.01 mm air gap inserted to appease tooling or tests:

- Clamped joints (gasket faces, cap-to-saddle, flange-to-flange): coincident
  nominal faces. Gaskets are modeled at compressed thickness.
- Press fits (guides, seats, dowels, bearing crush, hub pilots): modeled
  interference at nominal, declared as intentional in the verification
  contract — the interference IS the design.
- Running fits (pins, journals, skirts): clearance from a handbook fit class,
  typically 0.005–0.05 mm radial — not 0.2 mm of convenience air.
- Drafted or as-cast faces never seal and never locate: every gasket land,
  register, or datum on a cast wall is a machined land with declared stock
  (classify each face as-cast vs machined per part).
- One fit table. All fits live in a single parametric source of truth; both
  sides of every joint derive from the same entry (`bore = fit.shaft +
2 * fit.radialClearance`), so a fit change moves both parts together.

## Fastening and Threads

Every clamped joint gets engineered fastening; a bolt that touches no hole is
decoration:

- A hole stack is a feature: drill + tap depth, or clearance + counterbore/
  spotface, with an entry chamfer. Compose it as ONE revolved tool profile
  cut at each position (replicad has no counterbore primitive):

```ts
import { draw } from 'replicad';

// M6 clearance + counterbore tool, revolved once, cut per position
const cboreTool = draw([0, -0.5])
  .hLine(3.3) // clearance radius
  .vLineTo(2) // to counterbore floor
  .hLineTo(5.6) // counterbore radius
  .vLineTo(8.5) // through the top
  .hLineTo(0)
  .close()
  .sketchOnPlane('XZ')
  .revolve();

const bossed = housing.cutAll(boltXY.map(([x, y]) => cboreTool.clone().translate(x, y, 0)));
```

- Threads are callouts, not geometry: bind `{ callout: "M10x1.5", class:
"6H", engagement: 1.5 * d }` metadata to the hole feature in the params
  module. Model helical thread (`makeHelix` + sweep) only where the thread
  itself is under proof (e.g. a sealing plug); it is expensive.
- Every fastener is an occurrence that passes through a modeled hole in every
  clamped layer and terminates in a modeled tapped depth or nut, head seated
  on a spot face. Gasket and shim blanks are cut from the SAME hole map as
  the faces they sit between.
- Location is not fastening: parts that must reposition after service get
  dowels or registers (press in one side, slip in the other), because
  clearance bolt holes do not locate.
- Joint numbers are standards, not taste: engagement ≥ 1.0×d into steel or
  iron and 1.5–2×d into aluminum, ≥ 2 pitches proud of every nut, spacing
  ≥ 3×d, edge distance ≥ 1.5×d (2×d in castings), spot face Ø ≥ 2.2×d —
  tables in [dfm-checklists.md](dfm-checklists.md).

## Catalog Parts And Standard Features

Never design what you can buy, and never invent a dimension a standard
already fixes. Fasteners, bearings, seals, circlips, dowels, keys, O-rings,
core plugs, and tube stock are catalog parts at standard sizes (M6/M8/M10 —
never M7); their seats — circlip grooves, keyways, O-ring glands, dowel
holes — are dimensioned from the governing standard's table (DIN 471/472,
DIN 6885, ISO 3601/AS568, ISO 2338), parametrized in the params module with
the standard cited. Free nominals come from preferred-number series.
Weldment routes (headers, tube frames) use stock tube OD × wall, one bend
radius per die, and minimum straight tangents between bends. Tables in
[dfm-checklists.md](dfm-checklists.md).

## Tolerance Stack-Up And Economy

Every functional clearance is the sum of a dimension chain. Name the chain
(endplay, protrusion, crush, deck-to-piston), dimension its contributors
from one functional datum so the chain stays short, and verify accumulation
worst-case (safety-critical) or RSS (statistical). Then spend tolerance like
money: ISO 2768-m as the general default, tight bands and fine finishes only
on named functional dimensions — an everywhere-tight drawing is its own DFM
failure. Surface-finish classes and the as-cast vs machined face
classification live in [dfm-checklists.md](dfm-checklists.md).

## Design For Assembly

- A part exists only if it moves relative to its neighbors, must be a
  different material, or must come off for service — otherwise consolidate.
- Blind assembly self-locates: lead chamfers (15–30°) and pilot diameters
  ahead of every fit land; pilots engage before threads or press bands.
- Poka-yoke: a part that CAN be installed wrong WILL be. Patterns are truly
  symmetric (both ways correct) or unmistakably asymmetric (one dowel or
  bolt offset) — never almost-symmetric. Gaskets, caps, and covers are the
  classic victims.
- Fastener commonality: fewest distinct diameter × length × drive line
  items; one tool per subsystem.

## DFM Per Process

Casting (blocks, heads, housings, covers, pans):

- 1–3° draft on every mold-normal wall: `.draft(2, (f) => f.atAngleWith("Z", 90), "XY")` from a declared parting plane.
- Uniform wall (4–8 mm) + ribs, never bulk; cored voids where metal does no work.
- Fillets at every wall junction; no razor re-entrant corners.
- Machining stock (2–3 mm) on faces that will be machined; core prints and core plugs for every internal core.
- Proportions from the handbook, not taste: rib thickness 0.6–0.8× the adjoining wall, wall-to-wall transitions tapered ≥ 3:1, boss wall ≥ 0.5×d around tapped holes, cored holes no smaller than the local wall; stagger junctions into T's, core out masses at Y's.
- Parting line lands on non-functional, non-sealing surfaces; no undercuts along the draw direction without budgeting a core or slide.

Machining:

- Datum scheme first (axis + face + dowel); features placed from datums.
- Tool access: a straight tool axis reaches every hole and fastener head; verify the tool cylinder is not blocked.
- Chamfered entries on every bore that receives a part (rings, seals, pins); relief/overtravel grooves where a tool must run out (hone, grind, thread).
- Spot faces under every fastener head landing on a cast or angled surface.
- Model what the tool leaves: blind drilled holes end in a 118°/135° point cone; blind tapped stacks are usable thread + tap chamfer (2–3 pitches) + drill overtravel — threads never reach the bottom; external threads get a relief groove at the shoulder.
- Internal corners carry the cutter radius; where a mating part needs a sharp corner, dogbone the profile (`customCorner(r, "dogbone")`).
- Drilling beyond 8×D is a gun-drill callout, not just a longer cylinder.
- Grind stock (0.1–0.3 mm) on surfaces finished after heat treatment: rough → harden → finish grind.

Forging (cranks, rods, levers):

- Grain-friendly sections: I/H beams from sketched profiles, lofted blends into bosses.
- Generous fillets at every section change — sharp web-to-journal corners are fatigue initiators.
- Draft and a flash plane on the forged envelope.

Sheet metal (pans, covers, brackets at volume):

- Decision rule: a thin-walled part produced by the thousand is stamped constant-thickness — model bend features on a constant-t body (bend R ≥ 1×t, flange height ≥ 4×t, hole-to-edge ≥ 2×t, hole-to-bend ≥ 2.5×t + R, reliefs at intersecting bends, stiffening beads), never `shell()` a casting-shaped solid.
- Thin walls never tap: weld nuts or clinch nuts.

Additive (when printing is the selected process):

- Orientation, self-supporting angles (≥ 45°), powder escape, anisotropy, and print-then-machine fits replace the casting/machining rules above — full rulebook in [additive-dfm.md](additive-dfm.md). Enclosed voids ALWAYS get escape holes.

Assembly and service:

- Every part has an insertion path and tool clearance at its fasteners; torque tools need a straight axis.
- Serviceable items (plugs, filters, drains) reachable without major teardown.
- Lifting/handling bosses on anything heavy.
- Inspection is access too: functional datums reachable by a CMM stylus; deep passages get borescope paths or ports.

## Lightweighting As Structure

Remove metal by design, not by decoration: ribbed panels instead of thick
plates, windowed webs instead of solid bulkheads, profile-driven sections
(I-beam, channel) from sketches instead of rectangular bars, scallops where
swinging parts need clearance, rim-biased mass where inertia is the function.
Counterweights and balance features are sized from a mass calculation
(`measureShapeVolumeProperties(part).centerOfMass` supports the check), not
drawn to look plausible.

## Parametric Single Source Of Truth

One params/layout module drives everything:

- Dimensions, fit table, thread callouts, wall budgets, and datum frames are
  exported constants; geometry, placement, and any verification probes all
  read the same values. A parameter no geometry consumes is dead — delete it
  or make it load-bearing; a parameter the geometry contradicts is a lie.
- Derive frames, don't hardcode: `const bankPlane = makePlane("XZ").pivot(45,
"Z")`; positions come from functions of params (`bore(i)`, `boltXY(j)`),
  so a bore-spacing change moves barrels, bolt patterns, gasket holes, and
  probes together.
- Nominal geometry is exact. Never undersize a part so downstream mesh
  evidence stays clean — tolerance lives in the verification contract, not in
  the model.
- No native pattern feature exists: patterns are parametric loops over the
  same placement functions (`positions.map((p) => tool.clone().translate(p))`).

## Anti-Pattern Table

If you are about to do X, do Y instead:

| About to do (CSG primitive-butting)                                    | Do instead (native BRep features)                                                                                                       |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Butt two cylinders at an angle for a bend (mitred elliptical seam)     | One profile swept along a G1 path wire (`tangentArc` spine)                                                                             |
| Leave a duct/runner/manifold as solid bar stock                        | Sweep/loft the lumen and cut it: real void, declared wall                                                                               |
| Stack coaxial cylinders for a stepped shaft/bushing/valve              | Revolve the one true cross-section profile                                                                                              |
| Offset a disc from an axis and call it a cam lobe                      | Sketch the cam form (base circle, flanks, nose) and extrude at phase                                                                    |
| Smooth tubes at gear positions, radii ignoring centre distance         | Extruded tooth profiles whose pitch radii sum to the centre distance — or a named simplification with an explicit follow-up requirement |
| Full 360° ring where assembly requires a split (bearings, rings, caps) | Partial-angle revolve halves with parting faces, tangs, gap cuts                                                                        |
| Duplicate features symmetrically so one part serves both hands         | Model the single-hand part; `mirror()` the occurrence                                                                                   |
| Weld plates and tubes into a "thin-walled" box                         | Extrude/loft the outer form, `shell()` to a uniform wall                                                                                |
| Leave 0.01 mm air at every mate so nothing interferes                  | Coincident faces for clamps; declared interference for press fits                                                                       |
| Float bolts near flanges with no holes                                 | Hole-stack tool cuts through every layer + fastener occurrences                                                                         |
| Fuse a hex onto a cylinder and call it a bolt                          | Revolve the bolt blank (shank, chamfer, point), add the hex, seat it in a real stack                                                    |
| Annular sleeve standing in for a spring                                | `sketchHelix` + `sweepSketch` a round section — or a named simplification                                                               |
| Cut holes wherever the drill happens to land                           | Hole positions from the shared params map, shared with gaskets and probes                                                               |
| Sharp bore entries, sharp wall junctions, no draft anywhere            | Entry chamfers, junction fillets, drafted walls — planned in the budget, applied last                                                   |
| Flat-bottomed blind hole with threads to the bottom                    | Drill-point cone + tap-chamfer and overtravel allowances                                                                                |
| Invented groove/gland/keyway dimensions                                | The governing standard's table (DIN/ISO/AS568), cited in params                                                                         |
| Shelling a part production would stamp                                 | Constant-thickness bend features per the sheet-metal rules                                                                              |
| Almost-symmetric bolt/dowel patterns                                   | Poka-yoke: truly symmetric, or unmistakably offset                                                                                      |

## Verification Boundary

Manufacture-ready designs are proven with GeoSpec assertions (see
`packages/geospec/README.md`): contact/clearance/interference with declared
allowances, coaxiality through hole stacks, containment/insertion for
retention, wall-thickness and fillet/chamfer presence. This skill governs
DESIGN; write geometry whose intent those assertions can state directly —
coincident faces assert as contact, modeled interference asserts as a
declared press fit, connected voids assert as passages. Do not bend nominal
geometry to make evidence easy.

Out of scope for this skill: injection-molding and PCB/electronics DFM.
Additive manufacturing IS in scope via [additive-dfm.md](additive-dfm.md).

## References

- [reference.md](reference.md) — verified replicad API catalog: exact
  signatures, finder filters, and the not-present list with workarounds.
- [dfm-checklists.md](dfm-checklists.md) — numeric DFM tables: catalog
  standards, tolerance stack-up and finish classes, DFA/poka-yoke,
  machined-hole morphology, casting proportions, bolted-joint numbers,
  fillet execution strategy, sheet metal, secondary processes, inspection
  access.
- [additive-dfm.md](additive-dfm.md) — additive manufacturing rulebook:
  orientation and anisotropy, support elimination, feature minimums, powder
  escape, hybrid print-then-machine, lattices, polymer deltas.
- `docs/research/v8-engine-rev2-manufacturability-issues.md` — the 58-issue
  manufacturability register this doctrine is distilled from (categories:
  modeling technique, missing components, DFM, lightweighting, fits, spec
  integrity).
