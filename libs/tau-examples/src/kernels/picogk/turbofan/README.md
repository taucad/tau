# TF-2000 turbofan assembly

Open `main.cs` in Tau. The default view sections the casings along the horizontal centre plane; disable **Sectioned casings** for the full exterior. Dimensions are millimetres, inlet at X=0, exhaust at X=3600. The inlet envelope is 2000 mm diameter. The mechanism animates the low-pressure fan/booster/turbine spool and the high-pressure compressor/turbine spool independently around the X axis. Selectors and occurrence numbers give each displayed part a unique name within a build.

This example adapts the user's Tau project `new-project-39` (created 27 September 2026), preserving its authored geometry, SysML decomposition and verification files. The creating chat recorded 2,061 occurrences; the current `assembly.json` and SysML revision contains 2,173, including subsequently added accessory and other terminal components. Source files are user-authored for this repository example, not copied from an external model. The `assembly.json` `motion` field assigns 329 occurrences to the low-pressure spool and 370 to the high-pressure spool: 699 moving parts. Slash-separated IDs remain literal part selectors, not an inferred hierarchy.

`turbofan.sysml` decomposes the generic two-spool engine into 19 subsystems, 277 terminal part families and 2,173 physical occurrences. A terminal part is a single manufactured item. Integral surfaces, holes, blade edges, and material composition are features of a part; they are not separately assembled parts. Each terminal usage includes a CAD selector, geometry kind, multiplicity, and NACA designation where applicable. `assembly.json` contains the corresponding geometric specifications, instantiated by `main.cs`.

The layout includes a 24-blade fan, 36 bypass guide vanes, three booster stages, six high-pressure compressor stages, an annular combustor with 20 injectors and two 160-hole liners, one high-pressure turbine stage, three low-pressure turbine stages, concentric shafts, five six-family bearing assemblies, structural frames, exhaust, nacelle, flange hardware, accessory gearbox, starter, generator, fuel/oil pumps, oil tank, FADEC electronics, services and mounts. Starter/generator internals include stator cores, windings, armatures, shafts, end bells, races and individual rolling elements. Pump internals and electronic board/components have separate leaf selectors.

## NACA geometry

Every blade, vane, swirler and aerodynamic strut uses the actual four-digit camber-line and thickness equations, including the original finite trailing-edge coefficient **−0.1015**. The upper/lower surface offsets follow the local camber-line normal. Cosine-spaced chord points are lofted through span stations with twist, taper and sweep; the finite trailing edge and both ends are capped. Sections used: 0012, 0018, 2410, 2412, 4412 and 4415. Casings, shafts, fasteners and axisymmetric nozzles use their mechanical sections rather than airfoils.

References: [NASA TM 4741](https://ntrs.nasa.gov/api/citations/19970008124/downloads/19970008124.pdf), [PDAS four-digit thickness definition](https://www.pdas.com/naca456thick4.html), and [OMG SysML v2 language specification](https://www.omg.org/spec/SysML/2.0/Language/PDF).

## Inspection and verification

- Set **Component path** to any `cadSelector` from the SysML file, or a prefix such as `compressor/stage3`, `bearings/front`, or `accessories/starter`. Blank displays the assembly.
- The default 0.5 mm voxel size and all 2,173 occurrences make a full build resource-intensive. Select a component path for a smaller inspection build; preserve the full assembly for final mechanism and interference checks.
- Named occurrence assertions count the blade arrays and nested shafts in their actual positions. GeoSpec's spatial component matcher groups overlapping bounds, so it is not used as a part census for concentric or adjacent parts. Interference is checked separately in the actual assembled positions.
- `main.geospec.ts` covers every family: closed meshes, finite coordinates, degenerate/duplicate triangles, instance count, positive volume, axial/radial placement for turned parts, box dimensions and cavity volume, analytic annular volumes, perforated-liner material removal, blade-row interference, section caps, resolution variants, complete envelope, and full-assembly interference.
- `python3 verify.py` audits the SysML leaf multiplicities/selectors against CAD, NACA assignments, stage completeness and manifest invariants. The C# runtime also checks independent NACA reference ordinates before constructing any model.

From the Tau repository root, run the source census, native GLB/pose evidence, and model health gate. The native target prepares its pinned PicoGK and GeoSpec dependencies; the health gate uses the prepared PicoGK resource:

```bash
python3 libs/tau-examples/src/kernels/picogk/turbofan/verify.py
pnpm nx run runtime-e2e:native-turbofan
TAU_PICOGK_RESOURCE_ROOT="$PWD/apps/desktop/resources/picogk" \
  TAU_EXAMPLE_PATTERN='picogk\.turbofan$' \
  pnpm nx run runtime-e2e:example-health
```

## Engineering scope

This is a detailed **geometric concept** with executable interference checks, not a manufacturing-complete or flight-qualified engine design. No particular commercial engine is replicated. Stage sizing and NACA assignments are illustrative; no duty point, thrust target, thermodynamic cycle, compressor map, rotor dynamics, thermal growth, fatigue life or material allowables were supplied or solved.

Threads, splines, dovetail/fir-tree blade retention, gear-tooth engagement, cooling passages in hot blades, seals' working contact, bearing race grooves, detailed electrical routing, fluid circuit junctions and manufacturing tolerances remain schematic. Pump rotors and gearbox gears are geometric blanks. Integral chip packaging and windings are terminal manufactured items. These limitations are not certified by geometry tests. A truly production-complete decomposition requires those engineering definitions and the selected engine configuration.

PicoGK publishes triangle meshes here. Exact STEP/BRep topology, analytic hole/fillet recognition, exact minimum-wall certification and named product-structure matchers are unsupported for this mesh output; dimensional, mesh-integrity, volume, and interference checks are the executable proxies. SysML text follows the standard's part-definition/composition subset; no full SysML v2 parser is installed in this project.
