/**
 * Pose a rendered model from its own mechanism, without a viewer page: the agent's `screenshot { pose }` and the
 * server's `pose_model` read the mechanism the GLB's `TAU_cad_topology` payload carries, sample an animation or take
 * driver coordinates, and evaluate the pose with `@taucad/kinematics`, the solver the viewer's Kinematics pane runs.
 *
 * The payload's mechanism is in the GLB's vertex space, so a link transform applies to the GLB's nodes as the
 * viewer's pose composer applies it to their Three objects: the top-most node owning a linked component takes the
 * local matrix `P⁻¹·D·P·L0`, where `P` is its parent's placement below the scene root, `D` the link transform and
 * `L0` its as-built local matrix. Vertices and the binary chunk are never touched.
 *
 * @module
 */

import { admitMechanism, evaluatePose, sampleAnimation } from '@taucad/kinematics';
import type { Mechanism } from '@taucad/kinematics';

import { glbChunks, isObject, writeGlb } from '#runtime/glb-chunks.js';
import type { GlbChunks, JsonObject } from '#runtime/glb-chunks.js';
import { topologyPayloadOf } from '#runtime/model-mechanism.js';

/**
 * Which pose to take: an authored animation at a time, or driver coordinates. Coordinates are in the mechanism's
 * units (`units.angle`, `units.length`); a driver left out stays at its as-built value, 0.
 *
 * @public
 */
export type ModelPoseRequest =
  | Readonly<{ animation: Readonly<{ id: string; time: number }> }>
  | Readonly<{ coordinates: Readonly<Record<string, number>> }>;

/**
 * An evaluated pose: every degree of freedom's coordinate, drivers and followers alike, and those at a limit.
 *
 * @public
 */
export type ModelPose = Readonly<{
  status: 'posed';
  coordinates: Readonly<Record<string, number>>;
  /** Degrees of freedom whose requested value was clamped, or whose derived value lies outside its limits. */
  atLimit: readonly string[];
}>;

/** Why a pose could not be taken, in a sentence the agent can act on. @public */
export type ModelPoseRefusal = Readonly<{ status: 'refused'; message: string }>;

type Matrix = Float64Array;

const identity = (): Matrix => Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

/** `left · right`, column-major. */
const multiply = (left: Matrix, right: Matrix): Matrix => {
  const out = new Float64Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += left[k * 4 + row]! * right[column * 4 + k]!;
      }
      out[column * 4 + row] = sum;
    }
  }
  return out;
};

/** The inverse of an affine placement (rotation, scale and translation), column-major. */
const invertAffine = (matrix: Matrix): Matrix => {
  const [a, b, c, , d, j, f, , g, h, i] = matrix;
  const determinant = a! * (j! * i! - f! * h!) - d! * (b! * i! - c! * h!) + g! * (b! * f! - c! * j!);
  if (Math.abs(determinant) < Number.EPSILON) {
    throw new RangeError('A node placement is singular.');
  }
  const scale = 1 / determinant;
  const linear = [
    (j! * i! - f! * h!) * scale,
    (c! * h! - b! * i!) * scale,
    (b! * f! - c! * j!) * scale,
    (f! * g! - d! * i!) * scale,
    (a! * i! - c! * g!) * scale,
    (c! * d! - a! * f!) * scale,
    (d! * h! - j! * g!) * scale,
    (b! * g! - a! * h!) * scale,
    (a! * j! - b! * d!) * scale,
  ] as const;
  const [tx, ty, tz] = [matrix[12]!, matrix[13]!, matrix[14]!];
  return Float64Array.of(
    linear[0],
    linear[1],
    linear[2],
    0,
    linear[3],
    linear[4],
    linear[5],
    0,
    linear[6],
    linear[7],
    linear[8],
    0,
    -(linear[0] * tx + linear[3] * ty + linear[6] * tz),
    -(linear[1] * tx + linear[4] * ty + linear[7] * tz),
    -(linear[2] * tx + linear[5] * ty + linear[8] * tz),
    1,
  );
};

const numbers = (value: unknown, length: number): readonly number[] | undefined =>
  Array.isArray(value) && value.length === length && value.every((item) => typeof item === 'number')
    ? (value as readonly number[])
    : undefined;

/** A glTF node's local matrix: its `matrix`, else translation · rotation · scale. */
const localMatrix = (node: JsonObject): Matrix => {
  const matrix = numbers(node['matrix'], 16);
  if (matrix !== undefined) {
    return Float64Array.from(matrix);
  }
  const [tx, ty, tz] = numbers(node['translation'], 3) ?? [0, 0, 0];
  const [x, y, z, w] = numbers(node['rotation'], 4) ?? [0, 0, 0, 1];
  const [sx, sy, sz] = numbers(node['scale'], 3) ?? [1, 1, 1];
  return Float64Array.of(
    (1 - 2 * (y! * y! + z! * z!)) * sx!,
    2 * (x! * y! + z! * w!) * sx!,
    2 * (x! * z! - y! * w!) * sx!,
    0,
    2 * (x! * y! - z! * w!) * sy!,
    (1 - 2 * (x! * x! + z! * z!)) * sy!,
    2 * (y! * z! + x! * w!) * sy!,
    0,
    2 * (x! * z! + y! * w!) * sz!,
    2 * (y! * z! - x! * w!) * sz!,
    (1 - 2 * (x! * x! + y! * y!)) * sz!,
    0,
    tx!,
    ty!,
    tz!,
    1,
  );
};

/** The admitted mechanism a GLB's topology payload carries, with the payload's components. */
const mechanismOfGlb = (
  chunks: GlbChunks,
): Readonly<{ mechanism: Mechanism; components: readonly JsonObject[] }> | undefined => {
  const payload = topologyPayloadOf(chunks);
  if (payload?.['mechanism'] === undefined) {
    return undefined;
  }
  const outcome = admitMechanism(payload['mechanism']);
  if (outcome.status === 'invalid') {
    return undefined;
  }
  const components = Array.isArray(payload['components']) ? payload['components'].filter(isObject) : [];
  return { mechanism: outcome.mechanism, components };
};

const offered = (mechanism: Mechanism): string => {
  const ids = (mechanism.animations ?? []).map(({ id }) => id);
  return ids.length === 0 ? 'it declares no animation' : `it offers ${ids.join(', ')}`;
};

/**
 * The admitted mechanism a GLB carries, as the viewer's Kinematics pane loads it.
 *
 * @param content - GLB bytes.
 * @returns The mechanism, or `undefined` when the GLB carries none the solver admits.
 * @public
 */
export const readModelMechanism = (content: Uint8Array<ArrayBuffer>): Mechanism | undefined => {
  const chunks = glbChunks(content);
  return chunks === undefined ? undefined : mechanismOfGlb(chunks)?.mechanism;
};

/** Degrees of freedom an agent may set: every joint that no coupling drives. */
const driversOf = (mechanism: Mechanism): readonly string[] => {
  const followers = new Set((mechanism.couplings ?? []).map(({ follower }) => follower));
  return Object.keys(mechanism.joints).filter((id) => !followers.has(id));
};

const evaluate = (
  mechanism: Mechanism,
  request: ModelPoseRequest,
): (ModelPose & { linkTransforms: Readonly<Record<string, readonly number[]>> }) | ModelPoseRefusal => {
  let drivers: Readonly<Record<string, number>>;
  if ('animation' in request) {
    const animation = mechanism.animations?.find(({ id }) => id === request.animation.id);
    if (animation === undefined) {
      return {
        status: 'refused',
        message: `This model's mechanism has no animation ${request.animation.id}; ${offered(mechanism)}.`,
      };
    }
    drivers = sampleAnimation({ animation, time: request.animation.time });
  } else {
    drivers = request.coordinates;
  }
  const outcome = evaluatePose({ mechanism, coordinates: drivers });
  if (outcome.status === 'invalid') {
    return {
      status: 'refused',
      message: `${outcome.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}. Its driver coordinates are ${driversOf(mechanism).join(', ') || 'none'}.`,
    };
  }
  return {
    status: 'posed',
    coordinates: { ...outcome.pose.coordinates },
    atLimit: [...outcome.atLimit],
    linkTransforms: outcome.pose.linkTransforms,
  };
};

/**
 * Evaluate one pose of a mechanism: an animation sampled at a time, or driver coordinates.
 *
 * @param mechanism - An admitted mechanism.
 * @param request - The animation and time, or the driver coordinates.
 * @returns Every degree of freedom's coordinate, or why the pose was refused.
 * @public
 *
 * @example <caption>A quarter of the planetary's four sun turns</caption>
 * ```typescript
 * import { resolveModelPose } from '@taucad/agent-tools/runtime';
 * import type { Mechanism } from '@taucad/kinematics';
 *
 * declare const mechanism: Mechanism;
 * const pose = resolveModelPose(mechanism, { animation: { id: 'four-sun-turns', time: 2 } });
 * ```
 */
export const resolveModelPose = (mechanism: Mechanism, request: ModelPoseRequest): ModelPose | ModelPoseRefusal => {
  const outcome = evaluate(mechanism, request);
  return outcome.status === 'refused'
    ? outcome
    : { status: 'posed', coordinates: outcome.coordinates, atLimit: outcome.atLimit };
};

/** The node indices a topology component owns. */
const ownedNodes = (component: JsonObject): readonly number[] => {
  const references = Array.isArray(component['primitiveRefs']) ? component['primitiveRefs'].filter(isObject) : [];
  const fromReferences = references.flatMap((reference) =>
    typeof reference['nodeIndex'] === 'number' ? [reference['nodeIndex']] : [],
  );
  return typeof component['nodeIndex'] === 'number' ? [component['nodeIndex'], ...fromReferences] : fromReferences;
};

/**
 * A GLB posed by its own mechanism: the top-most node of each linked component carries the link's transform.
 *
 * @param content - A rendered GLB whose topology payload carries a mechanism.
 * @param request - The animation and time, or the driver coordinates.
 * @returns The posed GLB and the pose's coordinates, or why it could not be posed.
 * @public
 */
export const poseModelGlb = (
  content: Uint8Array<ArrayBuffer>,
  request: ModelPoseRequest,
): (ModelPose & Readonly<{ content: Uint8Array<ArrayBuffer> }>) | ModelPoseRefusal => {
  const chunks = glbChunks(content);
  const carried = chunks === undefined ? undefined : mechanismOfGlb(chunks);
  if (chunks === undefined || carried === undefined) {
    return {
      status: 'refused',
      message:
        'This view carries no mechanism to pose. Export one named mechanism from the source; evaluate_model reports its mechanism status.',
    };
  }
  const outcome = evaluate(carried.mechanism, request);
  if (outcome.status === 'refused') {
    return outcome;
  }
  const linkOfComponent = new Map<string, string>();
  for (const [linkId, link] of Object.entries(carried.mechanism.links)) {
    /* The root link never moves: its nodes keep their own matrices. */
    for (const componentId of linkId === carried.mechanism.root ? [] : link.components) {
      linkOfComponent.set(componentId, linkId);
    }
  }
  const linkOfNode = new Map<number, string>();
  for (const component of carried.components) {
    const linkId = typeof component['id'] === 'string' ? linkOfComponent.get(component['id']) : undefined;
    for (const node of linkId === undefined ? [] : ownedNodes(component)) {
      if (!linkOfNode.has(node)) {
        linkOfNode.set(node, linkId!);
      }
    }
  }
  const nodes: JsonObject[] = Array.isArray(chunks.json['nodes'])
    ? chunks.json['nodes'].map((node: unknown) => (isObject(node) ? { ...node } : {}))
    : [];
  const children = (node: JsonObject): readonly number[] =>
    Array.isArray(node['children'])
      ? node['children'].filter((child): child is number => typeof child === 'number')
      : [];
  const childIndices = new Set(nodes.flatMap((node) => children(node)));
  const scenes = Array.isArray(chunks.json['scenes']) ? chunks.json['scenes'].filter(isObject) : [];
  const sceneIndex = typeof chunks.json['scene'] === 'number' ? chunks.json['scene'] : 0;
  const sceneRoots = scenes[sceneIndex]?.['nodes'];
  const roots = Array.isArray(sceneRoots)
    ? sceneRoots.filter((index): index is number => typeof index === 'number')
    : nodes.flatMap((_, index) => (childIndices.has(index) ? [] : [index]));
  const visited = new Set<number>();
  const visit = (index: number, parentPlacement: Matrix): void => {
    const node = nodes[index];
    if (node === undefined || visited.has(index)) {
      return;
    }
    visited.add(index);
    const local = localMatrix(node);
    const linkId = linkOfNode.get(index);
    const transform = linkId === undefined ? undefined : outcome.linkTransforms[linkId];
    if (transform !== undefined) {
      const posed = multiply(
        multiply(invertAffine(parentPlacement), multiply(Float64Array.from(transform), parentPlacement)),
        local,
      );
      const { translation: _translation, rotation: _rotation, scale: _scale, ...rest } = node;
      nodes[index] = { ...rest, matrix: [...posed] };
      return;
    }
    const placement = multiply(parentPlacement, local);
    for (const child of children(node)) {
      visit(child, placement);
    }
  };
  for (const root of roots) {
    visit(root, identity());
  }
  return {
    status: 'posed',
    coordinates: outcome.coordinates,
    atLimit: outcome.atLimit,
    content: writeGlb(chunks, { ...chunks.json, nodes }),
  };
};
