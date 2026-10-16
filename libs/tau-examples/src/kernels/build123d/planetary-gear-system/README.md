# Planetary Gear System — build123d

A native build123d port of Tau's Replicad planetary gear example. The default model has **34 Parts in five assemblies**: a root stage, a carrier, and three ten-part planet units. It preserves the 24/24/72 tooth counts, involute profile equations, mounting holes, keyed shafts, carrier reliefs, bronze-colored bearing hardware and socket screws.

## Open and explore

Open this directory as a project in **Tau desktop**, then open `main.py` in the viewer and **Model** in the workbench. Select or isolate a `Planet Unit` to act on its ten descendants. Edit parameters in the Parameters pane to set the authored initial pose. Open **Kinematics** to scrub the sun input or play the four-turn clip without rebuilding geometry.

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

`Part` contains native manufactured geometry. Tau's `Assembly(children={name: shape})` subclasses native `Compound` and owns stable occurrence names, durable native joint connections and gear couplings. The ring connects to the sun and carrier, the carrier connects to each planet unit, and each unit connects to its rotating gear. Hardware stays with the unit while its gear spins. `interfaces["input"]` and `interfaces["output"]` expose actual descendant joints safely, without writing aliases into native `.joints`.

The optional Tau `motion(model)` hook supplies ring ground and the clip. Couplings belong to the reusable assemblies. Every clip reference is `(connection, "angle")`, and clip values are absolute authored degrees. The exporter converts them to deltas from the parameter-authored pose. Planet connections retain their 7.5° tooth phase; the authored affine coupling includes that offset, while compiled delta playback has zero phase offset.

For the fixed 24/24/72 tooth counts, the fixed-ring Willis relation gives carrier/sun = 24/(24+72) = 1/4. Planet spin relative to carrier is −(24/24)×(1−1/4) = −3/4 of sun rotation; adding carrier motion gives world planet spin −1/2. These ratios derive from the named tooth-count constants. Tooth counts are not exposed parameters in this reference. There is one independent sun coordinate and four coupled followers. The eight-second clip advances the sun 1440° (four turns).

`Assembly.connect` uses native Build123D placement and refreshes affected Compound caches. `copy(prototype)` produces independently rebound joints, connection handles and parts; each planet unit can be placed without modifying its siblings.

**Historical regression:** Build123D 0.11.1's shared Compound root copying made the original stage read back as 94 STEP solids. The current Tau Assembly copy path rebuilds independent aggregate containers from copied descendants. The copied 34-part stage now reads back as 34 solids at both 0° and 30° authored sun poses. This qualifies this Assembly copy path; arbitrary upstream Compound copies are not covered by that guarantee.

## Observed transport

- Native geometry: 34 valid solids; default 174 × 174 × 68 mm envelope.
- Tau Model pane: correct nested rows, colors, individual thumbnails, subtree selection and isolation.
- GLB: 39 topology components, but **34 flat glTF nodes**. The Tau extension supplies hierarchy; ordinary glTF consumers do not receive an assembly node tree.
- STEP: 39 nodes / 34 solids / 19 product definitions with independent Assembly copies; advanced pose is 174 × 174 × 72 mm.
- Build123D 0.13 native connected joints now export reusable local interfaces, public descendant aliases, physical connection intent and the compiled Tau playback mechanism. Canonical GLB carries the four couplings and animation; STEP remains geometry/assembly transport.
- This reference deliberately retains its native `Color` appearance. The adapter separately supports native `Shape.material` and embedded texture GLB; changing this model to a material catalog is unnecessary for the planetary motion qualification. Engineering material/density remains unspecified.

## Reproduce the qualification

Prepare the pinned native closure and run the native integration suite from the Tau root:

```sh
pnpm nx run build123d:seed
pnpm nx test build123d --watch=false build123d.native.integration.test.ts
```

The integration case reads this canonical `main.py`, checks 34 parts and five assemblies, admits the shared mechanism contract, verifies the coupling ratios, exports GLB and round-trips STEP. Default and `input_angle=30` native probes retain 34 solids and 39 STEP nodes. Desktop qualification additionally checks the fixed ring and rendered sun/carrier/planet rotation ratios while the clip plays. Geometry construction remains the expensive step; playback updates only transforms. No manufacturing-clearance or engineering physical-property certification is claimed.

This remains a **reference** row: the general example-thumbnail runtime does not compose the native Build123D kernel. It is not a browser builtin or Community showcase. Its native desktop/reference classification is unchanged.

## Provenance and adaptations

Original: `taucad/tau`, `libs/tau-examples/src/kernels/replicad/planetary-gear-system/main.ts`, source revision `f14c35969ec40a34d35db5505ec42978296fb0c5`, **Apache-2.0** (Tau repository license). This is an in-repository Python adaptation, not copied upstream build123d example code.

The gear equations and dimensions are retained. build123d uses native spline interpolation, fillets/chamfers, booleans and revolutions; it does not reuse Replicad tessellation. Flat output has been replaced by native Parts and a nested Compound tree. Python parameters use snake_case. Live motion now uses native Build123D joints plus Tau Assembly-owned connections and couplings. The existing colors are retained; physical material properties are separate work.

Historical owner: `docs/research/replicad-structured-assembly-blueprint.md` (2026-10-01 port). Current qualification owner: `docs/research/build123d-kinematics-blueprint.md`, run `2026-10-16-assembly-api`.
