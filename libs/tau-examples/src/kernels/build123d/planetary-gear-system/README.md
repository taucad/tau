# Planetary Gear System — build123d

A native build123d port of Tau's Replicad planetary gear example. The default model has **34 Parts in five assemblies**: a root stage, a carrier, and three ten-part planet units. It preserves the 24/24/72 tooth counts, involute profile equations, mounting holes, keyed shafts, carrier reliefs, bronze-colored bearing hardware and socket screws.

## Open and explore

Open this directory as a project in **Tau desktop**, then open `main.py` in the viewer and **Model** in the workbench. Select or isolate a `Planet Unit` to act on its ten descendants. Edit parameters in the Parameters pane to rebuild a static pose.

| Parameter     | Default | Meaning                                                               |
| ------------- | ------- | --------------------------------------------------------------------- |
| `module`      | 2 mm    | Gear size; bounded to 1.5–3 mm in this spike                          |
| `face_width`  | 14 mm   | Gear face width; bounded to 10–24 mm                                  |
| `input_angle` | 0°      | Sun angle; carrier = input / 4, world planet phase = 7.5° − input / 2 |

The bounds are authoring guards, not a qualification of every value in those ranges. Verified poses are the defaults and `face_width=18, input_angle=30`.

## Authored structure

```text
Planetary Gear System
├── Internal Ring Gear
├── Sun Gear And Input Shaft
└── Carrier
    ├── Carrier Rear
    ├── Carrier Front And Output Hub
    └── Planet Unit 1 / 2 / 3
        ├── Planet Gear
        ├── Planet Pin
        ├── Flanged Bushing
        ├── Thrust Washer
        ├── Front / Rear Thrust Spacer
        ├── Front / Rear Screw Washer
        └── Front / Rear Socket Screw
```

`Part` contains manufactured solid geometry; `Compound(children=...)` declares product structure. `planet_unit()` returns a complete module-local assembly, including a named mounting joint. Parent locations position the unit and carrier. Product grouping does not imply rigidity: the gear rotates around the pin.

**Copying caveat, build123d 0.11.1:** `copy(Compound)` shares its root native shape while copying descendants. Reusing that assembly root caused the STEP exporter to append its children repeatedly: this stage read back as 94 solids. The port creates fresh assembly containers with copied leaf Parts; corrected STEP reads back as 34 solids, five assemblies and 39 nodes. Leaf geometry is reused; nested assembly definition reuse is not established by this pattern.

## Observed transport

- Native geometry: 34 valid solids; default 174 × 174 × 68 mm envelope.
- Tau Model pane: correct nested rows, colors, individual thumbnails, subtree selection and isolation.
- GLB: 39 topology components, but **34 flat glTF nodes**. The Tau extension supplies hierarchy; ordinary glTF consumers do not receive an assembly node tree.
- STEP: 39 nodes / 34 solids / 19 product definitions after the container correction; advanced pose is 174 × 174 × 72 mm.
- Native mounting joints remain Python authoring data. Tau's build123d adapter does not currently export them as interfaces or mechanisms. This example has no live playback contract.
- The adapter exports base color; the original Replicad PBR metalness/roughness factors are not carried by native `Color`. Engineering material/density is unspecified, so Tau correctly shows unknown weight.

## Reproduce the spike

From the Tau root, using the prepared native resource (adjust the platform target):

```sh
pnpm nx run desktop:prepare-build123d-python
apps/desktop/resources/python/darwin-arm64/bin/python3 \
  docs/research/artifacts/replicad-structured-assembly-blueprint/runs/2026-10-01-build123d-planetary/probe.py \
  "$PWD" out/research/build123d-planetary
```

The probe lives in optional Tau Brain; ordinary modeling needs only `main.py` and `tau.json`. It checks two poses, native validity, ownership, GLB structure and STEP read-back. Measured build/mesh/export/read-back takes 22–25 seconds per pose after import on the spike host; geometry alone took about six seconds. No GeoSpec suite or manufacturing-clearance certification is claimed for this port.

This is a **reference** row, matching the existing build123d V8: the general example-thumbnail runtime does not compose the native build123d kernel. It is not a browser builtin or a Community showcase. Promote it to a public model only when that native example host is composed and its thumbnail/health gates run.

## Provenance and adaptations

Original: `taucad/tau`, `libs/tau-examples/src/kernels/replicad/planetary-gear-system/main.ts`, source revision `f14c35969ec40a34d35db5505ec42978296fb0c5`, **Apache-2.0** (Tau repository license). This is an in-repository Python adaptation, not copied upstream build123d example code.

The gear equations and dimensions are retained. build123d uses native spline interpolation, fillets/chamfers, booleans and revolutions; it does not reuse Replicad tessellation. Flat output has been replaced by native Parts and a nested Compound tree. Python parameters use snake_case. The live Replicad mechanism export and PBR factors are intentionally not presented as implemented in build123d.

The research owner is `docs/research/replicad-structured-assembly-blueprint.md`; its 2026-10-01 planetary run records the measured findings and their consequences for the proposed TypeScript API.
