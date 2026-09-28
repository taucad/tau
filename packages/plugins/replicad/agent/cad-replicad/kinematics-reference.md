# Replicad kinematics reference

Use this reference when a requested Replicad model has parts intended to move relative to one another: hinges, lids, doors, sliders, shafts, gears, linkages, articulated arms, fans, or adjustable mechanisms. Export a mechanism for the **modeled moving assembly**, including an animation that exercises every intended independent motion. A single rigid part with no relative motion has no mechanism.

## Authoring contract

The entry module exports `main(params)` as usual and also a named `mechanism` value or `mechanism(params)` function. The kernel calls the function with the same resolved parameters as `main` (and can await an async result). Author plain JSON data matching `MechanismSource`; import its **type only** from `@taucad/kinematics`. The runtime module is not available inside Replicad source, so do not import `admitMechanism`, `evaluatePose`, or other kinematics functions there.

Return moving bodies as **separate, uniquely named** `ShapeConfig` shapes. `links` groups names of shapes that move rigidly together. A named shape belongs to at most one link. `root` is the grounded link; it may have `shapes: []` if there is no physical base. Every non-root link has exactly one incoming joint, giving a connected tree. A rigidly attached subpart can share its carrier link or use a `fixed` joint. Include every returned shape whose pose matters, including pins or fasteners that ride a moving link. Keep names consistent with whichever shapes `main` returns for the current parameters; a filtered part view needs a correspondingly filtered mechanism.

Use the **as-built geometry frame**: `origin` is a point in the model's coordinate system at the rendered reference pose; `axis`, `normal`, and `xAxis` are directions in that same frame. Replicad geometry is typically Z-up. State `schemaVersion: 1` and explicit `units: { length: 'mm', angle: 'deg' }` or `{ length: 'm', angle: 'rad' }`; the kernel transforms the mechanism alongside vertices into the GLB frame and units. Joint coordinates are **deltas** from the rendered pose, so zero means Reset. If parameters already rotate or translate parts, calculate the corresponding as-built joint origins/axes and shift travel limits so zero remains inside every limit. Do not pre-pose the geometry a second time in `mechanism`.

## Complete hinged model

```typescript
import { makeBox } from 'replicad';
import type { ShapeConfig } from '@taucad/replicad/model';
import type { MechanismSource } from '@taucad/kinematics';

export const defaultParams = { width: 60, depth: 40, maxOpen: 110 };

export default function main(p = defaultParams): ShapeConfig[] {
  return [
    { name: 'Base', shape: makeBox([0, 0, 0], [p.width, p.depth, 4]), color: '#52677a' },
    { name: 'Lid', shape: makeBox([0, 0, 4], [p.width, p.depth, 7]), color: '#c78b52' },
  ];
}

export function mechanism(p = defaultParams) {
  return {
    schemaVersion: 1,
    units: { length: 'mm', angle: 'deg' },
    root: 'base',
    links: { base: { shapes: ['Base'] }, lid: { shapes: ['Lid'] } },
    joints: {
      hinge: {
        type: 'revolute',
        name: 'Lid hinge',
        parent: 'base',
        child: 'lid',
        origin: [0, 0, 4],
        axis: [1, 0, 0],
        limits: { lower: 0, upper: p.maxOpen },
      },
    },
    animations: [
      {
        id: 'open-close',
        name: 'Open and close',
        duration: 2,
        loop: 'pingPong',
        keyframes: [
          { time: 0, coordinates: { hinge: 0 } },
          { time: 2, coordinates: { hinge: p.maxOpen } },
        ],
      },
    ],
  } satisfies MechanismSource;
}
```

The lid remains closed in `main`; the Kinematics pane rotates it about the X-axis through `[0, 0, 4]`. Validate model parameters so `width`, `depth`, and `maxOpen` are finite and positive, and `maxOpen` stays within the intended mechanical travel.

## Joints and degree-of-freedom IDs

Every joint has a stable object key, optional human `name`, `parent`, `child`, and `origin: [x, y, z]`. The key is used by couplings and animation coordinates; `name` labels the pane. Axes must be finite, nonzero vectors; the runtime normalizes them. Limits are inclusive in mechanism units and must contain the as-built coordinate, usually `0`.

| `type`        | Additional fields                                                               | Motion and coordinate IDs                                                                                                            |
| ------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `fixed`       | None                                                                            | Welds the child to the parent; no degree of freedom.                                                                                 |
| `revolute`    | `axis`, optional `limits`                                                       | Rotation around the axis; ID is the joint key.                                                                                       |
| `prismatic`   | `axis`, optional `limits`                                                       | Translation along the axis; ID is the joint key.                                                                                     |
| `cylindrical` | `axis`, optional `limits: { angle?, distance? }`                                | Independent rotation and translation; IDs `<joint>/angle`, `<joint>/distance`.                                                       |
| `screw`       | `axis`, nonzero `lead`, `handedness` (`'right'` or `'left'`), optional `limits` | One rotation ID equal to the joint key; one full turn advances by `lead` in length units, signed by handedness.                      |
| `spherical`   | Optional symmetric `limits`                                                     | Rotation vector about `origin`; IDs `<joint>/x`, `<joint>/y`, `<joint>/z`. Bounds, when present, use `lower = -upper` for all three. |
| `planar`      | `normal`, perpendicular in-plane `xAxis`, optional `limits: { x?, y?, angle? }` | Two in-plane translations and rotation about `normal`; IDs `<joint>/x`, `<joint>/y`, `<joint>/angle`.                                |

Choose joints from the physical relationship: a hinge or shaft is revolute, a drawer is prismatic, a spindle that independently spins and slides is cylindrical, a threaded drive is screw, a ball joint is spherical, and a body freely moving in one plane is planar. Combine two revolutes for a universal joint. A rigid assembly of several returned shapes uses one link. Fixed joints express a useful rigid hierarchy but do not create animation controls.

## Couplings and constrained motion

`couplings` derive a follower coordinate from a driver coordinate, using the IDs above. Their graph must be acyclic; each follower has one coupling and cannot be directly keyed in an animation. Ratios and curve values use the follower's units per the driver's units.

- **Linear:** `{ driver: 'pinion', follower: 'wheel', ratio: -teethPinion / teethWheel }` means `follower = ratio × driver + offset` (`offset` defaults to zero). The sign follows the modeled axes and mesh direction. Gear trains, worm gears, mimics, and rack-and-pinion use this form. For a pinion rotating in degrees and a rack traveling in mm, a pitch radius `r` gives `ratio: 2 * Math.PI * r / 360`, with sign chosen for the axes.
- **Periodic curve:** `{ driver: 'crank', follower: 'slider', curve: { driverPeriod: 360, values: [0, 8, 0, -8] } }` samples one period at evenly spaced driver values `0, 90, 180, 270` degrees, interpolates linearly, and wraps at 360 degrees. Use enough samples to preserve the needed motion. This approximates a slider-crank, cam lift, or connecting-rod swing when a tree of joints cannot itself close the loop; it does not solve contact or arbitrary loop geometry.

The coupling's value at driver zero (including `offset` or `values[0]`) is part of the as-built pose and must be inside the follower's limits. Align returned geometry with that relationship. Drive the primary joint in the pane and verify every follower moves in the intended direction and ratio.

## Animations and pane behavior

An animation is `{ id, name?, duration, loop?, keyframes }`. `id` is unique; `duration` and keyframe `time` are seconds. `loop` is `'none'`, `'repeat'`, or `'pingPong'`. Keyframes are ordered, inside `[0, duration]`, and contain finite coordinates keyed by **driver** degree-of-freedom IDs. Values between keyframes interpolate linearly; absent coordinates retain their value until changed. Coupled followers move automatically. Keep each keyframed value within travel limits; choose an arc that avoids part collisions where possible.

Author at least one meaningful clip for a moving assembly. Keyframe every independent driver required to demonstrate the requested motion, or supply separate named clips for distinct motions. The pane also offers **Sweep drivers** for mechanisms with drivers, but that generic sweep is not a substitute for a deliberate authored sequence. The pane's Play/Pause, timeline, speed, joint controls, Reset, and pose dragging operate on the admitted mechanism. A mechanism with only fixed joints has no moving controls or playback.

## Verify the finished model

1. Render the entry with the final parameter set and inspect `get_kernel_result`. A geometry success can coexist with a mechanism warning. Fix every `Mechanism ...` warning; the kernel otherwise writes geometry without motion. An unknown shape name reports `UNKNOWN_COMPONENT` at `/links/<link>/shapes/<index>`.
2. Open the **Kinematics** pane after the build. Confirm each intended moving body appears under its joint, with the expected driver and any coupled followers. An empty or rejected-mechanism state is incomplete for a moving model.
3. Select each authored clip and Play. Watch every intended independent body move, verify directions and travel, then Reset to the exact as-built pose. Test a parameter variant that changes dimensions, filters parts, or changes the as-built pose if the model offers one.

For larger patterns already exercised in Tau, inspect the Replicad example sources `planetary-gear-system/main.ts` (multi-link gears and couplings), `worm-gear-system/main.ts` (parameter-filtered components and a worm relation), and `six-axis-arm/main.ts` (serial joints and changing as-built pose). `@taucad/kinematics`'s `MechanismSource` type is the exact schema; compiler support is type-only in the model editor.
