# Additive Manufacturing DFM

Rulebook for parts whose selected process is additive — metal laser powder
bed fusion (LPBF) as the primary case, with polymer deltas at the end. When
AM is the process, these rules REPLACE the casting rules in
[dfm-checklists.md](dfm-checklists.md): draft is irrelevant, wall budgets
shrink, and orientation + powder escape + post-machining govern instead.
Everything else in [SKILL.md](SKILL.md) still applies — native BRep
features, voids are geometry, real interfaces, single params source.

## When AM earns its place

AM is justified by: part consolidation (the DFA superpower — one printed
body replacing a fastened stack), internal channels no core or drill can
make (conformal cooling, curved galleries), lattice/topology-driven mass
reduction, or tooling-free low volume. If a casting or machining route is
straightforward, AM is not the lazy path — it trades tooling for per-part
cost, anisotropy, and finishing work.

## Orientation first

Build orientation is the first design decision, recorded in the params
module — every rule below is measured against it.

- **Self-supporting angle:** walls ≥ 45° from the build plate print clean
  (LPBF steels/Al; titanium slightly more forgiving). Shallower overhangs
  need supports — design them out with chamfers/angled webs instead of
  paying for support removal.
- **Downskin vs upskin:** downward-facing surfaces are the roughest;
  critical surfaces face up or vertical, or carry machining stock.
- **Anisotropy:** the build (Z) direction is the weak direction — LPBF
  knocks down ~5–15 % static and more in fatigue; FDM 30–80 %. Orient the
  principal load path in-plane, or derate explicitly.
- **Recoater interaction (LPBF):** no long knife-edges or large flat walls
  parallel to the recoater; rotate the part 5–15° in plan.

## Design out the supports

- Horizontal holes ≤ ~8 mm self-support as printed; model larger horizontal
  bores as **teardrop or diamond** sections (apex ≥ 45°) and machine round
  where a fit needs it. A circular horizontal hole above the limit is a
  supported surface you now have to clean.
- Unsupported bridges ≤ ~2–5 mm; beyond that, chamfer to 45° or add a
  sacrificial rib you machine away.
- Every support that cannot be avoided needs line-of-sight tool access for
  removal — a support in a closed cavity is a defect you designed.

## Feature minimums (LPBF metal, typical)

| Feature                                  | Minimum                                              |
| ---------------------------------------- | ---------------------------------------------------- |
| Wall (short/cosmetic)                    | 0.4–0.5 mm                                           |
| Wall (structural)                        | ≥ 1.0 mm                                             |
| Printed hole Ø                           | 0.5–1.0 mm (fit bores get stock + machining instead) |
| Pin / strut Ø                            | ≥ 1.0 mm (lattice struts ≥ 0.5–1.0)                  |
| Slot width                               | ≥ 0.5 mm                                             |
| Embossed/engraved detail                 | ≥ 0.3–0.4 mm                                         |
| Clearance between printed-in-place parts | ≥ 0.3–0.5 mm                                         |

## Thermal design (LPBF)

- Avoid abrupt thick↔thin transitions — taper ≥ 3:1, same instinct as
  casting; large solid masses hollow out or lattice-fill (with escape).
- Minimize per-layer cross-section jumps; large flat plates parallel to the
  plate warp and tear off supports.
- Stress-relieve before cutting off the plate; long spans get distortion
  allowance or post-machining.

## Powder escape — voids interact with "Voids Are Geometry"

Enclosed voids are still real geometry, but printed voids are born full of
powder:

- Every enclosed cavity gets ≥ 2 escape holes, Ø ≥ 2–3 mm (LPBF; 4–5 mm for
  polymer powder beds), placed at drainage-low points in the chosen build
  orientation, on non-cosmetic faces.
- Internal channels: ≤ ~8 mm self-support (teardrop the section above
  that); long runs need powder-removal access at both ends; NO fully
  trapped volume, ever — a sealed void is uninspectable trapped powder.
- Escape holes are engineered features: positioned in the params module,
  pluggable (threaded plug or welded ball) when the circuit must seal, and
  assertable as circular-hole facts in the verification contract.

## Hybrid: print, then machine the functions

AM tolerance capability is ±0.1–0.3 mm typical — no printed surface is a
running fit, press fit, seat, thread, or sealing face:

- Every fit/seal/thread surface carries 0.5–1 mm machining stock and a
  post-machining callout; the fit values come from the same fit table as
  every other process.
- Design the fixturing WITH the part: three datum bosses/pads or a
  sacrificial base flange the chuck/vice can hold, machined off last or
  left as the datum system. One datum scheme carries from build plate to
  final inspection.
- Threads: print the pilot, tap or thread-mill after (metals); inserts in
  polymers or thin walls. Printed threads are never structural.

## Lattices and topology forms

- replicad has no lattice generator: sanctioned routes are parametric strut
  loops over the placement functions (honest but expensive), rib/shell
  lightweighting per SKILL.md, or importing a topology-optimized body via
  STEP from an external tool. Imported organic forms still obey the 45°
  rule, strut minimums, and escape-hole rules.

## Surface and finishing

- As-built LPBF: Ra ~6–12 µm upskin, 15–30 µm downskin. Bead blast for
  uniform cosmetic; machine or polish functional faces per the surface
  table in [dfm-checklists.md](dfm-checklists.md).

## Polymer deltas

- **FDM/FFF:** wall ≥ 2 × nozzle (0.8–1.0 mm); holes print undersize —
  drill after; the 45° rule is strict; layer seams are crack starters at
  loaded corners (radius them); no structural load across layers.
- **SLA/DLP:** hollow forms need drain holes (cupping suction tears
  features off); supports scar — orient cosmetic faces away.
- **SLS/MJF:** no supports needed (powder bed), but escape holes are
  mandatory and large flat sections warp; spring features and living
  hinges are legitimate here, not in LPBF.

## Checklist

- [ ] Build orientation chosen, recorded in params; loads vs anisotropy checked
- [ ] All overhangs ≥ 45° or chamfered/redesigned; bridges within limit
- [ ] Horizontal bores ≤ 8 mm or teardropped (+ machined where fits need round)
- [ ] Every enclosed void has ≥ 2 escape holes at orientation-low points
- [ ] Thick↔thin transitions tapered ≥ 3:1; no large plate parallel to recoater
- [ ] Every fit/seal/thread face: machining stock + post-machining callout
- [ ] Fixturing datums designed in (bosses or sacrificial flange)
- [ ] Supports (if any) have removal access; stress relief before plate cutoff
