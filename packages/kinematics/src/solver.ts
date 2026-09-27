import type { Plan } from '#mechanism.js';
import { analyzeMechanism, coordinateSlope, isFiniteNumber, pointer, problem } from '#mechanism.js';
import {
  checkCoordinates,
  clampedDrivers,
  coefficients,
  motion,
  toPose,
  updateCoefficients,
  writeJointMotion,
  writeTransforms,
} from '#pose.js';
import type { Issue, SolvePoseInput, SolvePoseOutcome } from '#types.js';

/** Default goal distance tolerance. Mechanism length units. */
const defaultTolerance = 1e-6;
const maxIterations = 64;
/** Gradient-to-residual cosine below which the solve is stationary. */
const stationaryCosine = 1e-9;
/** Share of the residual an accepted step must remove to count as progress. */
const stallGain = 1e-6;
/** Escape nudge off a stationary point that may be a saddle (a straight arm). Radians. */
const escapeAngle = 1e-2;

const checkPositive = (value: number | undefined, path: string): Issue[] =>
  value === undefined || (isFiniteNumber(value) && value > 0)
    ? []
    : [problem('INVALID_VALUE', path, `Expected a positive finite number; got ${String(value)}.`)];

const checkInput = (plan: Plan, input: SolvePoseInput): Issue[] => {
  const issues = [...checkCoordinates(plan, input.seed, '/seed'), ...checkPositive(input.tolerance, '/tolerance')];
  for (const [index, goal] of input.goals.entries()) {
    const path = pointer('goals', index);
    if (!plan.linkIndex.has(goal.link)) {
      issues.push(problem('UNKNOWN_LINK', `${path}/link`, `Link "${goal.link}" is not declared.`));
    }
    const vectors: ReadonlyArray<readonly [string, readonly number[]]> = [
      ['localPoint', goal.localPoint],
      ['target', goal.target],
    ];
    for (const [key, values] of vectors) {
      if (!values.every((value) => isFiniteNumber(value))) {
        issues.push(problem('INVALID_VALUE', `${path}/${key}`, `Goal ${key} must contain only finite numbers.`));
      }
    }
  }
  return issues;
};

/** One iterate: driver values, link transforms and the weighted residual of the goals. */
export type State = {
  drivers: Float64Array;
  transforms: Float64Array;
  residual: Float64Array;
  cost: number;
  position: number;
};

type Goal = Readonly<{ link: number; row: number; data: Float64Array }>;

/**
 * Solve `matrix × solution = vector` in place by Cholesky factorisation.
 * The solver adds a positive damping to the diagonal of a Gram matrix, so the system is positive
 * definite; were rounding to break that, the NaN solution makes a step the solver rejects.
 *
 * @param matrix - Symmetric positive definite matrix, row-major; its lower triangle is overwritten.
 * @param vector - Right-hand side, overwritten with the solution.
 */
const choleskySolve = (matrix: Float64Array, vector: Float64Array): void => {
  const size = vector.length;
  for (let column = 0; column < size; column += 1) {
    let pivot = matrix[column * size + column]!;
    for (let inner = 0; inner < column; inner += 1) {
      pivot -= matrix[column * size + inner]! ** 2;
    }
    const root = Math.sqrt(pivot);
    matrix[column * size + column] = root;
    for (let row = column + 1; row < size; row += 1) {
      let sum = matrix[row * size + column]!;
      for (let inner = 0; inner < column; inner += 1) {
        sum -= matrix[row * size + inner]! * matrix[column * size + inner]!;
      }
      matrix[row * size + column] = sum / root;
    }
  }
  for (let row = 0; row < size; row += 1) {
    let sum = vector[row]!;
    for (let inner = 0; inner < row; inner += 1) {
      sum -= matrix[row * size + inner]! * vector[inner]!;
    }
    vector[row] = sum / matrix[row * size + row]!;
  }
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = vector[row]!;
    for (let inner = row + 1; inner < size; inner += 1) {
      sum -= matrix[inner * size + row]! * vector[inner]!;
    }
    vector[row] = sum / matrix[row * size + row]!;
  }
};

/**
 * Compile goals as local point (0–2) and target point (3–5).
 *
 * @param plan - Compiled mechanism.
 * @param input - Validated solve input.
 * @returns Goals with their residual row offsets, three rows each.
 */
const compileGoals = (plan: Plan, input: SolvePoseInput): readonly Goal[] =>
  input.goals.map((goal, index) => {
    const data = new Float64Array(6);
    data.set(goal.localPoint, 0);
    data.set(goal.target, 3);
    return { link: plan.linkIndex.get(goal.link)!, row: index * 3, data };
  });

/**
 * Allocate an iterate.
 *
 * @param plan - Compiled mechanism.
 * @param rows - Residual rows of the goals.
 * @returns A zeroed state.
 */
export const createState = (plan: Plan, rows: number): State => ({
  drivers: new Float64Array(plan.degreesOfFreedom.length),
  transforms: new Float64Array(plan.linkIds.length * 12),
  residual: new Float64Array(rows),
  cost: 0,
  position: 0,
});

/**
 * World position of a goal's local point on its link.
 *
 * @param transforms - Link transforms.
 * @param goal - Compiled goal.
 * @param point - Output point.
 */
const writeGoalPoint = (transforms: Float64Array, goal: Goal, point: Float64Array): void => {
  const base = goal.link * 12;
  const { data } = goal;
  for (let row = 0; row < 3; row += 1) {
    point[row] =
      transforms[base + row]! * data[0]! +
      transforms[base + 3 + row]! * data[1]! +
      transforms[base + 6 + row]! * data[2]! +
      transforms[base + 9 + row]!;
  }
};

/** The least-squares problem of one solve. */
export type Problem = Readonly<{
  /** Degree-of-freedom index of each variable: the root drivers. */
  variableIndex: Int32Array;
  /** Per variable: bounds from its own limits and those its followers imply. */
  lower: Float64Array;
  upper: Float64Array;
  /** Residual rows: three per goal. */
  rows: number;
  /** Written by `writeJacobian`, row-major `rows × variables`: the goal velocity per variable unit. */
  jacobian: Float64Array;
  clampVariables: (drivers: Float64Array) => void;
  /** Write a state's transforms, residual `target − current`, cost and worst goal distance. */
  evaluate: (state: State) => void;
  /** Write the Jacobian at a state that `evaluate` has written. */
  writeJacobian: (state: State) => void;
}>;

/**
 * Set up the least-squares problem of a solve: variables and their bounds, goal rows, and the
 * residual and analytic Jacobian writers.
 *
 * @param plan - Compiled mechanism.
 * @param input - Validated solve input.
 * @returns The variables, their bounds, the goal rows, and the residual and Jacobian writers.
 */
export const createProblem = (plan: Plan, input: SolvePoseInput): Problem => {
  const { degreesOfFreedom, source, gain, bias, internalScale, rotationAxis, translationAxis, jointOrigin } = plan;

  // Variables are the root drivers; followers move with them through their couplings.
  const variableIndex = Int32Array.from(
    degreesOfFreedom.flatMap((dof, index) => (dof.role === 'driver' ? [index] : [])),
  );
  const variableOf = new Int32Array(degreesOfFreedom.length).fill(-1);
  const size = variableIndex.length;
  const lower = new Float64Array(size);
  const upper = new Float64Array(size);
  for (let variable = 0; variable < size; variable += 1) {
    const index = variableIndex[variable]!;
    variableOf[index] = variable;
    lower[variable] = plan.lower[index]!;
    upper[variable] = plan.upper[index]!;
  }
  // Linear followers bound their driver too: gain × driver + bias must stay within the follower's limits.
  // ponytail: a curve follower's limits imply no single driver interval, so they are only reported, not enforced.
  for (const [index, dof] of degreesOfFreedom.entries()) {
    const variable = variableOf[source[index]!]!;
    if (dof.role === 'follower' && variable >= 0 && plan.linear[index] === 1) {
      const first = (plan.lower[index]! - bias[index]!) / gain[index]!;
      const second = (plan.upper[index]! - bias[index]!) / gain[index]!;
      lower[variable] = Math.max(lower[variable]!, Math.min(first, second));
      upper[variable] = Math.min(upper[variable]!, Math.max(first, second));
    }
  }
  const clampVariables = (drivers: Float64Array): void => {
    for (let variable = 0; variable < size; variable += 1) {
      const index = variableIndex[variable]!;
      drivers[index] = Math.min(Math.max(drivers[index]!, lower[variable]!), upper[variable]!);
    }
  };

  const goals = compileGoals(plan, input);
  const rows = goals.length * 3;

  // Workspace reused by every evaluation.
  const jacobian = new Float64Array(rows * size);
  const point = new Float64Array(3);
  const lever = new Float64Array(3);
  const angular = new Float64Array(3);
  const velocity = new Float64Array(3);

  const evaluate = (state: State): void => {
    writeTransforms(plan, state.drivers, state.transforms);
    const { transforms, residual } = state;
    state.position = 0;
    for (const goal of goals) {
      const { data, row } = goal;
      writeGoalPoint(transforms, goal, point);
      const dx = data[3]! - point[0]!;
      const dy = data[4]! - point[1]!;
      const dz = data[5]! - point[2]!;
      state.position = Math.max(state.position, Math.hypot(dx, dy, dz));
      residual[row] = dx;
      residual[row + 1] = dy;
      residual[row + 2] = dz;
    }
    let cost = 0;
    for (const value of residual) {
      cost += value * value;
    }
    state.cost = cost;
  };

  // Jacobian of the residual rows with respect to the variables, through couplings by the chain rule.
  const writeJacobian = (state: State): void => {
    jacobian.fill(0);
    const { transforms, drivers } = state;
    for (const goal of goals) {
      writeGoalPoint(transforms, goal, point);
      for (let joint = plan.parentJoint[goal.link]!; joint >= 0; joint = plan.parentJoint[plan.jointParent[joint]!]!) {
        writeJointMotion(plan, drivers, joint);
        const rx = motion[0]!;
        const ry = motion[1]!;
        const rz = motion[2]!;
        updateCoefficients(Math.hypot(rx, ry, rz));
        const versine = coefficients[2]!;
        const cubic = coefficients[3]!;
        const parent = plan.jointParent[joint]! * 12;
        const child = (joint + 1) * 12;
        const origin = joint * 3;
        // The joint pivots about its origin carried by the child: delta(child) × origin.
        for (let row = 0; row < 3; row += 1) {
          lever[row] =
            point[row]! -
            (transforms[child + row]! * jointOrigin[origin]! +
              transforms[child + 3 + row]! * jointOrigin[origin + 1]! +
              transforms[child + 6 + row]! * jointOrigin[origin + 2]! +
              transforms[child + 9 + row]!);
        }
        const start = plan.jointDofStart[joint]!;
        const end = start + plan.jointDofCount[joint]!;
        for (let dof = start; dof < end; dof += 1) {
          // Every degree of freedom traces back to a root driver, and every root driver is a variable.
          const variable = variableOf[source[dof]!]!;
          const chain = internalScale[dof]! * coordinateSlope(plan, drivers, dof);
          // Local angular velocity: the rotation-vector left Jacobian applied to the axis.
          const ax = rotationAxis[dof * 3]!;
          const ay = rotationAxis[dof * 3 + 1]!;
          const az = rotationAxis[dof * 3 + 2]!;
          const cx = ry * az - rz * ay;
          const cy = rz * ax - rx * az;
          const cz = rx * ay - ry * ax;
          const localX = ax + versine * cx + cubic * (ry * cz - rz * cy);
          const localY = ay + versine * cy + cubic * (rz * cx - rx * cz);
          const localZ = az + versine * cz + cubic * (rx * cy - ry * cx);
          const tx = translationAxis[dof * 3]!;
          const ty = translationAxis[dof * 3 + 1]!;
          const tz = translationAxis[dof * 3 + 2]!;
          for (let row = 0; row < 3; row += 1) {
            const px = transforms[parent + row]!;
            const py = transforms[parent + 3 + row]!;
            const pz = transforms[parent + 6 + row]!;
            angular[row] = px * localX + py * localY + pz * localZ;
            velocity[row] = px * tx + py * ty + pz * tz;
          }
          for (let row = 0; row < 3; row += 1) {
            const next = (row + 1) % 3;
            const after = (row + 2) % 3;
            const linear = velocity[row]! + angular[next]! * lever[after]! - angular[after]! * lever[next]!;
            jacobian[(goal.row + row) * size + variable]! += chain * linear;
          }
        }
      }
    }
  };
  return { variableIndex, lower, upper, rows, jacobian, clampVariables, evaluate, writeJacobian };
};

const solve = (plan: Plan, input: SolvePoseInput): SolvePoseOutcome => {
  const tolerance = input.tolerance ?? defaultTolerance;
  const { variableIndex, lower, upper, rows, jacobian, clampVariables, evaluate, writeJacobian } = createProblem(
    plan,
    input,
  );
  const size = variableIndex.length;
  let current = createState(plan, rows);
  let trial = createState(plan, rows);
  current.drivers.set(clampedDrivers(plan, input.seed));
  clampVariables(current.drivers);

  // Workspace reused by every iteration.
  const normal = new Float64Array(rows * rows);
  const system = new Float64Array(rows * rows);
  const solution = new Float64Array(rows);
  const free = new Uint8Array(size);

  let damping = -1;
  let growth = 2;
  let iterations = 0;
  let escaped = false;
  let stalled = false;
  let binding = false;
  let jacobianNorm = 0;
  const best = { drivers: new Float64Array(current.drivers.length), cost: Infinity, position: 0 };
  const keepBest = (): void => {
    if (current.cost < best.cost) {
      best.drivers.set(current.drivers);
      best.cost = current.cost;
      best.position = current.position;
    }
  };
  const blocked = (reason: 'limit' | 'unreachable' | 'singular' | 'budget'): SolvePoseOutcome => {
    writeTransforms(plan, best.drivers, current.transforms);
    return {
      status: 'blocked',
      reason,
      pose: toPose(plan, best.drivers, current.transforms),
      iterations,
      residual: best.position,
    };
  };

  evaluate(current);
  keepBest();
  for (;;) {
    if (current.position <= tolerance) {
      return {
        status: 'solved',
        pose: toPose(plan, current.drivers, current.transforms),
        iterations,
        residual: current.position,
      };
    }
    if (stalled) {
      if (binding) {
        return blocked('limit');
      }
      if (escaped) {
        return blocked(jacobianNorm === 0 ? 'singular' : 'unreachable');
      }
      // A stationary point short of the goals may be a saddle, such as a straight arm reaching for a point
      // inside its reach: Gauss–Newton cannot see the curvature that bends it, so nudge off it once.
      escaped = true;
      stalled = false;
      damping = -1;
      for (const index of variableIndex) {
        const nudge = plan.degreesOfFreedom[index]!.kind === 'angle' ? escapeAngle / plan.angleScale : 0;
        current.drivers[index]! += nudge;
      }
      clampVariables(current.drivers);
      evaluate(current);
      keepBest();
      continue;
    }
    if (iterations >= maxIterations) {
      return blocked('budget');
    }
    writeJacobian(current);
    // Pin variables held at a limit that the gradient pushes outward (projected gradient).
    binding = false;
    jacobianNorm = 0;
    let gradientNorm = 0;
    for (let variable = 0; variable < size; variable += 1) {
      let gradient = 0;
      let column = 0;
      for (let row = 0; row < rows; row += 1) {
        gradient += jacobian[row * size + variable]! * current.residual[row]!;
        column += jacobian[row * size + variable]! ** 2;
      }
      const value = current.drivers[variableIndex[variable]!]!;
      const pinned = (value <= lower[variable]! && gradient < 0) || (value >= upper[variable]! && gradient > 0);
      binding ||= pinned;
      free[variable] = pinned ? 0 : 1;
      gradientNorm += pinned ? 0 : gradient * gradient;
      jacobianNorm += pinned ? 0 : column;
    }
    let largestDiagonal = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let other = 0; other <= row; other += 1) {
        let sum = 0;
        for (let variable = 0; variable < size; variable += 1) {
          sum += free[variable]! * jacobian[row * size + variable]! * jacobian[other * size + variable]!;
        }
        normal[row * rows + other] = sum;
      }
      largestDiagonal = Math.max(largestDiagonal, normal[row * rows + row]!);
    }
    if (damping < 0) {
      damping = 1e-3 * largestDiagonal;
      growth = 2;
    }
    const scale = Math.sqrt(jacobianNorm * current.cost);
    stalled = Math.sqrt(gradientNorm) <= stationaryCosine * scale;
    while (!stalled && iterations < maxIterations) {
      iterations += 1;
      system.set(normal);
      for (let row = 0; row < rows; row += 1) {
        system[row * rows + row]! += damping;
      }
      solution.set(current.residual);
      choleskySolve(system, solution);
      trial.drivers.set(current.drivers);
      let predicted = current.cost;
      for (let row = 0; row < rows; row += 1) {
        // The damped linear model leaves the residual damping × solution.
        predicted -= (damping * solution[row]!) ** 2;
      }
      for (let variable = 0; variable < size; variable += 1) {
        let step = 0;
        for (let row = 0; row < rows; row += 1) {
          step += jacobian[row * size + variable]! * solution[row]!;
        }
        const index = variableIndex[variable]!;
        trial.drivers[index]! += free[variable]! * step;
      }
      clampVariables(trial.drivers);
      evaluate(trial);
      // Only improving steps are accepted; a worsening step grows the damping instead.
      if (trial.cost < current.cost) {
        // Nielsen's update keeps the damping steady for good steps instead of oscillating.
        const gainRatio = (current.cost - trial.cost) / predicted;
        damping *= Math.max(1 / 3, 1 - (2 * gainRatio - 1) ** 3);
        growth = 2;
        // Converging on a residual the mechanism cannot remove: a step that removes a negligible share of it is
        // no progress. The share is relative, so the rule is the same in every unit system.
        const gain = Math.sqrt(current.cost) - Math.sqrt(trial.cost);
        stalled = gain >= 0 && gain <= stallGain * Math.sqrt(current.cost);
        [current, trial] = [trial, current];
        keepBest();
        break;
      }
      if (damping > 1e12 * largestDiagonal) {
        stalled = true;
      } else {
        damping *= growth;
        growth *= 2;
      }
    }
  }
};

/**
 * Solve driver coordinates so that the goals are met as closely as the mechanism allows,
 * with an adaptive Levenberg–Marquardt iteration on an analytic Jacobian: a step that worsens
 * the residual is rejected and the damping grows. Couplings fold into their drivers by the
 * chain rule and every iterate is projected onto the joint limits (including limits that
 * followers imply for their drivers). The solve is deterministic and stops after 64 iterations.
 *
 * A `blocked` outcome carries the best limit-satisfying pose found: `limit` when a joint
 * limit stops progress, `unreachable` when the goals lie outside what the drivers can reach,
 * `singular` when no driver moves the goals at all, and `budget` when the iteration budget ran
 * out while still improving. The solve is local: seed it from the last pose.
 *
 * @param input - Mechanism, seed driver coordinates, point goals and an optional tolerance.
 * @returns A solved or blocked pose with its residual in mechanism length units, or issues.
 * @public
 * @example <caption>Reach a point with a two-link arm</caption>
 * ```typescript
 * import { solvePose } from '@taucad/kinematics';
 * import type { Mechanism } from '@taucad/kinematics';
 *
 * const mechanism: Mechanism = {
 *   schemaVersion: 1,
 *   units: { length: 'm', angle: 'rad' },
 *   root: 'base',
 *   links: { base: { components: [] }, upper: { components: ['Upper'] }, lower: { components: ['Lower'] } },
 *   joints: {
 *     shoulder: { type: 'revolute', parent: 'base', child: 'upper', origin: [0, 0, 0], axis: [0, 0, 1] },
 *     elbow: { type: 'revolute', parent: 'upper', child: 'lower', origin: [1, 0, 0], axis: [0, 0, 1] },
 *   },
 * };
 * const outcome = solvePose({
 *   mechanism,
 *   seed: { shoulder: 0.1, elbow: 0.2 },
 *   goals: [{ type: 'point', link: 'lower', localPoint: [2, 0, 0], target: [1, 1, 0] }],
 * });
 * console.log(outcome.status === 'invalid' ? outcome.issues : outcome.pose.coordinates);
 * ```
 */
export const solvePose = (input: SolvePoseInput): SolvePoseOutcome => {
  const analysis = analyzeMechanism(input.mechanism);
  if (analysis.status === 'invalid') {
    return analysis;
  }
  const issues = checkInput(analysis.plan, input);
  return issues.length > 0 ? { status: 'invalid', issues } : solve(analysis.plan, input);
};
