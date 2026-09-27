# @taucad/kinematics

Serializable mechanisms, pure forward kinematics, couplings, animation sampling and a damped least-squares pose solver. No renderer, DOM or React dependency: every input and output is plain JSON data.

## Quick start

```typescript
import { admitMechanism, evaluatePose, solvePose } from '@taucad/kinematics';

// 1. Author a mechanism in the as-built frame: joints connect links (groups of components).
const outcome = admitMechanism({
  schemaVersion: 1,
  units: { length: 'mm', angle: 'deg' },
  root: 'base',
  links: { base: { components: ['Base'] }, upper: { components: ['Upper Arm'] }, lower: { components: ['Forearm'] } },
  joints: {
    shoulder: {
      type: 'revolute',
      parent: 'base',
      child: 'upper',
      origin: [0, 0, 0],
      axis: [0, 0, 1],
      limits: { lower: -150, upper: 150 },
    },
    elbow: { type: 'revolute', parent: 'upper', child: 'lower', origin: [100, 0, 0], axis: [0, 0, 1] },
  },
});
if (outcome.status === 'invalid')
  throw new Error(outcome.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
const { mechanism } = outcome;

// 2. Evaluate: each link gets a column-major 4×4 delta from its as-built pose.
const posed = evaluatePose({ mechanism, coordinates: { shoulder: 30, elbow: 45 } });
if (posed.status === 'posed') console.log(posed.pose.linkTransforms['lower'], posed.atLimit);

// 3. Solve: move a point on the forearm to a target, seeded from the current pose.
const solved = solvePose({
  mechanism,
  seed: { shoulder: 30, elbow: 45 },
  goals: [{ type: 'point', link: 'lower', localPoint: [200, 0, 0], target: [120, 90, 0] }],
});
if (solved.status !== 'invalid') console.log(solved.status, solved.pose.coordinates, solved.residual);
```

Joint types: `fixed`, `revolute`, `prismatic`, `cylindrical`, `screw`, `spherical` and `planar`. Linear couplings (`follower = ratio × driver + offset`) cover gears, worms, mimics and rack-and-pinion pairs; curve couplings (`follower = curve(driver)`, one sampled period repeated every `driverPeriod`) cover slider-cranks, rod swing and cam lift, which a tree of joints cannot close. `listDegreesOfFreedom` names every coordinate and `sampleAnimation` plays authored clips (keyframe times and durations are seconds).

A mechanism is authored next to a model as a `MechanismSource`, whose links name returned shapes (`links: { lid: { shapes: ['Lid'] } }`), and checked with `satisfies MechanismSource`. `resolveMechanismComponents` binds those names to canonical component ids and admits the resulting `Mechanism`, whose links carry `components`. `transformMechanism` re-expresses a mechanism in another frame and length unit and reports a non-rigid matrix as an `INVALID_TRANSFORM` issue.

Limits are deltas from the as-built pose and must contain it, so Reset (`coordinates: {}`) always returns there; spherical limits bound each rotation-vector component symmetrically.

A `blocked` solve still returns the best limit-satisfying pose with a reason (`limit`, `unreachable`, `singular` or `budget`). The solver is local: seed it from the last pose so it follows a drag continuously. Goals are points; `tolerance` and `residual` are distances in mechanism length units.

Run `pnpm nx run kinematics:benchmark` to measure `evaluatePose` on 10/100/1000-link chains and `solvePose` on a six-axis arm.
