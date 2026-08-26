# DFM Checklists and Standards

Numeric design-for-manufacture rules backing [SKILL.md](SKILL.md). These are
handbook values, not taste — when a project's own spec disagrees, the spec
wins, but the deviation is recorded next to the parameter.

## Catalog-first: standard parts and standard features

Never design what you can buy; never invent a dimension a standard fixes.

| Item            | Rule                                                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fastener sizes  | Standard coarse metric only: M3, M4, M5, M6, M8, M10, M12, M16 (skip M7/M9/M14). Fewest distinct diameter × length × drive line items per assembly; one tool per subsystem |
| Circlip grooves | DIN 471 (external) / DIN 472 (internal): groove diameter, width, and edge margin from the clip table for the shaft/bore size — never derived                               |
| Keyways         | DIN 6885 / ISO 773: key b×h selected by shaft diameter band; keyway depth split per the table                                                                              |
| Dowel pins      | ISO 2338 (solid) / ISO 8752 (spring): press fit in one part, close slip (H7) in the other, per the pin standard's recommended hole classes                                 |
| O-ring glands   | ISO 3601 / AS568 cord sizes; groove depth/width for ~15–30 % static squeeze from the gland table; surface finish in the gland per the table                                |
| Threads         | ISO 261/965 coarse series default; fine pitch only with a recorded reason (thin wall, adjustment, vibration)                                                               |
| Core plugs      | Standard cup/expansion plug diameters; bore machined to the plug maker's spec                                                                                              |
| Free nominals   | Preferred-number series (R10/R20) when nothing constrains the value                                                                                                        |

Weldment routes (headers, tube frames, brackets):

- Stock tube OD × wall only; one centreline bend radius per die (default
  CLR ≈ 1.5 × OD) reused for every bend on the part.
- Minimum straight tangent ≥ 1 × OD between bends (die clamp length) and
  ≥ 0.5 × OD before a weld prep or flange.
- Mitre-and-weld joints only where a bend die cannot reach; the mitre is a
  welded joint with prep, never a fused-solid seam.

## Tolerance stack-up and tolerance economy

1. Name every functional clearance's chain: list each dimension that adds or
   subtracts (crank endplay, bolt protrusion, bearing crush, deck-to-piston,
   gasket compression). If the chain is longer than three contributors,
   re-datum: dimension contributors from one functional register.
2. Accumulate worst-case for safety-critical fits; RSS is acceptable for
   statistical, non-safety chains. Record the method beside the chain.
3. General tolerance ISO 2768-m; tighten only the named functional
   dimensions. Everywhere-tight drawings are a DFM failure of their own.
4. Surface finish is spent, not sprinkled:

| Surface class              | Typical callout                  |
| -------------------------- | -------------------------------- |
| Honed cylinder bore        | Ra 0.4–0.8, 45° ± 15° crosshatch |
| Ground journal / seal land | Ra 0.2–0.4                       |
| Gasket deck (milled)       | Ra 1.6–3.2                       |
| General machined           | Ra 3.2                           |
| As-cast, non-functional    | free                             |

5. Classify every face of every part as **as-cast** (free) or **machined**
   (stock 2–3 mm modeled or called out). Drafted or as-cast faces never
   seal, never locate.

## DFA: part count, self-location, error-proofing

- **Minimum part criteria** (keep a part separate only if): it moves
  relative to its neighbors, it must be a different material, or it must
  come off for assembly/service. Everything else consolidates.
- **Self-location:** every blind-assembled part gets a lead — 15–30° entry
  chamfer or a pilot diameter ahead of the fit land; the pilot engages
  before threads or press bands take over. Shaft steps get back chamfers so
  seals and bearings slide on without shaving.
- **Poka-yoke:** a part that CAN be installed wrong WILL be. Patterns are
  either truly symmetric (both ways correct) or unmistakably asymmetric
  (one dowel or bolt hole offset ≥ one diameter; an odd tab on a
  symmetric-looking gasket). Never almost-symmetric. Classic victims:
  gaskets, bearing caps, covers, timing sets.
- **Orientation economy:** prefer top-down assembly, minimum
  re-orientations of the base part; heavy subassemblies get lifting/fixture
  features.

## Machined-hole morphology (model what the tool leaves)

- Blind drilled hole = cylinder + 118° (or 135° split-point) cone at the
  bottom. Model the cone; a flat-bottomed blind hole is a flat-ended-mill
  operation and is called out as such.
- Blind tapped stack, top to bottom: usable thread depth (the callout) +
  tap chamfer runout (2–3 pitches) + drill overtravel (point cone + ~3
  pitches of chip room). Threads never reach the bottom. Through-tap
  whenever wall allows.
- External thread meeting a shoulder: relief groove ~2–3 pitches wide, cut
  to just under minor diameter — or an explicit incomplete-thread
  allowance. No thread runs hard into a shoulder.
- Internal corners carry the cutter radius: pocket wall corners R ≥ tool
  radius, floor corners per the tool's corner radius. Where a mating part
  needs a sharp corner, dogbone the 2D profile
  (`customCorner(r, "dogbone")`).
- Drill depth ≤ 5×D standard, ≤ 8×D with pecking; beyond that is a
  gun-drill callout (straighter, but its own tolerance class).
- Cross-drillings enter normal to the surface or via a spot face (drill
  wander); exits into bores/journals get deburr chamfers.

## Casting proportions

| Feature         | Rule                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| Nominal wall W  | 4–8 mm (light-alloy sand/PM class); uniform ±25 %                           |
| Ribs            | thickness 0.6–0.8 × W, height ≤ 4–5 × thickness, base fillets ≥ 0.25 × W    |
| Bosses          | wall ≥ 0.5 × d around a tapped hole; blend into walls with ribs, not bulk   |
| Transitions     | taper ≥ 3:1 between different wall sections, or blend R ≥ W                 |
| Junctions       | prefer T over X (stagger crossings); core out the mass at heavy Y junctions |
| Cored holes     | no smaller than the local wall W (smaller holes are drilled after)          |
| Draft           | external walls 1–2°, internal walls/pockets 2–3° (shrink grips cores)       |
| Machining stock | 2–3 mm on every machined cast face                                          |

- Parting line lands on non-functional, non-sealing surfaces; flash witness
  is acceptable only there.
- No undercuts along the draw direction unless a core or slide is
  explicitly budgeted; core prints sized to carry their cores.
- First machining op establishes datums from three cast target pads;
  everything else measures from machined datums, never cast skin.

## Bolted-joint numbers

| Item              | Rule                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Thread engagement | ≥ 1.0 × d into steel/iron; 1.5–2 × d into aluminum; through-bolt when both walls allow          |
| Protrusion        | ≥ 2 pitches beyond every nut                                                                    |
| Spacing           | ≥ 3 × d bolt-to-bolt                                                                            |
| Edge distance     | ≥ 1.5 × d machined, ≥ 2 × d in castings                                                         |
| Spot face         | Ø ≥ 2.2 × d, just deep enough to clean up 100 %                                                 |
| Pattern           | bolt line bisects the gasket land; spacing even enough that the gasket pressure map has no gaps |

## Fillet and edge execution strategy (OCCT robustness)

1. Draft before fillets; fillets before cosmetic edge breaks.
2. Largest structural radii first, then descending; one pass per region
   using `combineFinderFilters` for per-region radius maps.
3. A failing chain splits at natural vertices; if a segment still fails,
   reduce the radius locally and record the deviation — never silently drop
   the treatment.
4. Never fillet an edge of a face a later feature consumes (the face
   `shell` removes, a parting face, a face a sketch lands on).

## Sheet-metal branch (stamped/pressed parts)

Decision rule: a thin-walled part produced in volume (pan, cover, bracket,
shield) is stamped constant-thickness — model bend features on a constant-t
body, never `shell()` a casting-shaped solid.

| Feature       | Rule                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| Bend radius   | ≥ 1 × t (steel), one radius per part where possible                            |
| Flange height | ≥ 4 × t (below that the bend cannot form)                                      |
| Hole to edge  | ≥ 2 × t                                                                        |
| Hole to bend  | ≥ 2.5 × t + bend R (or the hole distorts)                                      |
| Bend reliefs  | notches at every intersecting bend                                             |
| Stiffness     | beads/embosses (depth ≤ 3 × t) and flanged rims instead of thickness           |
| Threads       | never tapped into sheet: weld nuts, clinch nuts, or extruded-and-tapped bosses |

## Secondary processes

- Heat-treated running surfaces (journals, seats, lobes): rough → harden →
  finish grind, with 0.1–0.3 mm grind stock modeled or called out;
  thin adjacent sections flagged for distortion.
- Plating/coating thickness enters the fit chain (hard anodize ~50 % growth
  per surface, chrome per spec) — add it to the stack, don't discover it.

## Inspection access

- Every functional datum is reachable by a CMM stylus with the part on its
  fixture; add witness flats/pads where the scheme needs them.
- Critical bores have entry access for a bore gauge; deep internal passages
  get borescope paths or inspection ports (pairs with the void-continuity
  verification frontier).
