import { createHash } from 'node:crypto';

import {
  formatPrimitiveSelector,
  resolveShapeName,
  srgbTupleToLinear,
  transformVectorArrayChecked,
  validateGlbResources,
  writeGlb,
} from '@taucad/geometry-core';
import type { GlbNode, GlbResources, TauCadTopologyComponent, TauCadTopologyPayload } from '@taucad/geometry-core';
import { tauCadTopologyExtension } from '@taucad/runtime/types';
import { resolveMechanismComponents, transformMechanism } from '@taucad/kinematics';
import type { Issue } from '@taucad/kinematics';
import type { KernelIssue } from '@taucad/runtime/kernel';

import type { PicogkBuild } from '#picogk.protocol.js';

const scalarBytes = 4;
type PicogkComponent = PicogkBuild['prototypes'][number];
type PicogkMeshArtifact = Pick<
  PicogkBuild,
  | 'artifactPath'
  | 'byteLength'
  | 'sha256'
  | 'prototypes'
  | 'occurrences'
  | 'mechanism'
  | 'images'
  | 'textures'
  | 'samplers'
>;

type GltfMatrix = NonNullable<GlbNode['matrix']>;

const sourceToGltf = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1] as const;

/** Conjugate source millimetre Z-up placement into canonical metre Y-up asset space. */
const toGlbMatrix = (source: GltfMatrix): GltfMatrix => {
  const axes = [0, 2, 1] as const;
  const signs = [1, 1, -1] as const;
  const result: [...GltfMatrix] = [...source];
  for (let column = 0; column < 3; column++) {
    for (let row = 0; row < 3; row++) {
      result[column * 4 + row] = source[axes[column]! * 4 + axes[row]!]! * signs[column]! * signs[row]!;
    }
  }
  result[12] = source[12] * 0.001;
  result[13] = source[14] * 0.001;
  result[14] = -source[13] * 0.001;
  return result;
};

const mechanismIssue = (issue: Issue): KernelIssue => ({
  code: issue.code.startsWith('UNKNOWN_') ? 'INVALID_REFERENCE' : 'INVALID_ANNOTATION',
  severity: 'warning',
  type: 'kernel',
  message: `Mechanism${issue.path && ` ${issue.path}`}: ${issue.message} ${issue.recovery}`,
  details: { producer: { kernelId: 'picogk' }, mechanism: issue },
});

const convertMechanism = (
  source: unknown,
  names: ReadonlyMap<string, string>,
  onIssues?: (issues: KernelIssue[]) => void,
) => {
  const resolved = resolveMechanismComponents({
    source,
    componentIds: Object.fromEntries(names),
  });
  const outcome =
    resolved.status === 'resolved'
      ? transformMechanism({
          mechanism: resolved.mechanism,
          units: { length: 'm', angle: resolved.mechanism.units.angle },
          matrix: sourceToGltf,
        })
      : resolved;
  if (outcome.status === 'invalid') {
    onIssues?.(outcome.issues.map(mechanismIssue));
    return undefined;
  }
  return outcome.mechanism;
};

const viewFloat32 = (bytes: Uint8Array<ArrayBuffer>, offset: number, count: number): Float32Array<ArrayBuffer> => {
  if (offset % scalarBytes !== 0 || offset + count * scalarBytes > bytes.byteLength) {
    throw new Error('PicoGK worker returned an invalid Float32 artifact range.');
  }
  return new Float32Array(bytes.buffer, bytes.byteOffset + offset, count);
};

const viewUint32 = (bytes: Uint8Array<ArrayBuffer>, offset: number, count: number): Uint32Array<ArrayBuffer> => {
  if (offset % scalarBytes !== 0 || offset + count * scalarBytes > bytes.byteLength) {
    throw new Error('PicoGK worker returned an invalid Uint32 artifact range.');
  }
  return new Uint32Array(bytes.buffer, bytes.byteOffset + offset, count);
};

const assertValidShape = (component: PicogkComponent): void => {
  const invalidShape =
    component.positionCount % 3 !== 0 ||
    (component.kind === 'triangles'
      ? component.normalCount !== component.positionCount || component.indexCount % 3 !== 0
      : component.indexCount % 2 !== 0 || component.positionCount < 6);
  if (invalidShape) {
    throw new Error(`PicoGK component "${component.id}" has an invalid ${component.kind} shape.`);
  }
};

const recordRanges = (component: PicogkComponent, occupied: Array<readonly [number, number]>): void => {
  const ranges: ReadonlyArray<readonly [number, number]> = [
    [component.positionOffset, component.positionOffset + component.positionCount * scalarBytes],
    [component.normalOffset, component.normalOffset + component.normalCount * scalarBytes],
    [
      component.indexOffset,
      component.indexOffset + component.indexCount * (component.indexComponentType === 5123 ? 2 : 4),
    ],
    [component.texCoordOffset ?? 0, (component.texCoordOffset ?? 0) + (component.texCoordCount ?? 0) * scalarBytes],
    [component.tangentOffset ?? 0, (component.tangentOffset ?? 0) + (component.tangentCount ?? 0) * scalarBytes],
  ];
  for (const range of ranges) {
    if (!Number.isSafeInteger(range[0]) || !Number.isSafeInteger(range[1]) || range[0] < 0 || range[1] < range[0]) {
      throw new Error('Invalid PicoGK artifact range.');
    }
    if (range[0] === range[1]) {
      continue;
    }
    if (occupied.some(([start, end]) => range[0] < end && start < range[1])) {
      throw new Error(`PicoGK component "${component.id}" has overlapping artifact ranges.`);
    }
    occupied.push(range);
  }
};

/**
 * Validate one component's vectors and rotate them from CAD Z-up into the GLB's Y-up in one pass.
 *
 * The finiteness scan is the only trust boundary between user-authored C# and the GPU buffer, and it
 * runs in the same loop as the rotation because a separate callback pass over the same typed array
 * costs more than the whole rest of the adapter. Both live in `@taucad/geometry-core` now, so this
 * adapter states the rotation nowhere.
 *
 * @param source - Component vectors viewed in place in the confined artifact bytes.
 * @param kind - `position` scales CAD millimetres to metres; `direction` only rotates.
 * @param name - Component name, for the rejection message.
 * @returns The rotated vectors, ready for the GLB writer's single copy.
 */
const toGlbVectors = (
  source: Float32Array<ArrayBuffer>,
  kind: 'direction' | 'position',
  name: string,
): Float32Array<ArrayBuffer> =>
  transformVectorArrayChecked({
    vectors: source,
    kind,
    invalidMessage: `PicoGK component "${name}" contains invalid mesh values.`,
  });

/**
 * Reject indices that point past the component's own vertices, in one pass and without a callback.
 * @param indices - Component indices viewed in place in the confined artifact bytes.
 * @param vertexCount - Vertices the component actually has.
 * @param name - Component name, for the rejection message.
 */
const assertIndexRange = (
  indices: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>,
  vertexCount: number,
  name: string,
): void => {
  // oxlint-disable-next-line typescript/prefer-for-of, unicorn-js/no-for-loop -- `for…of` runs the iterator protocol over a Uint32Array: measured 10x slower than this indexed scan at 150k indices.
  for (let index = 0; index < indices.length; index++) {
    if (
      indices[index]! >= vertexCount ||
      indices[index] === (indices instanceof Uint16Array ? 65_535 : 4_294_967_295)
    ) {
      throw new Error(`PicoGK component "${name}" contains invalid mesh values.`);
    }
  }
};

const assertArtifactIntegrity = (bytes: Uint8Array<ArrayBuffer>, result: PicogkMeshArtifact): void => {
  if (bytes.byteLength !== result.byteLength) {
    throw new Error('PicoGK worker mesh byte length does not match its descriptor.');
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== result.sha256.toLowerCase()) {
    throw new Error('PicoGK worker mesh failed its SHA-256 integrity check.');
  }
};

const componentsToGlb = (
  bytes: Uint8Array<ArrayBuffer>,
  prototypes: readonly PicogkComponent[],
  options: {
    occurrences: PicogkBuild['occurrences'];
    mechanismSource?: unknown;
    resources: Pick<PicogkMeshArtifact, 'images' | 'textures' | 'samplers'>;
    onIssues?: (issues: KernelIssue[]) => void;
  },
): Uint8Array<ArrayBuffer> => {
  const { occurrences } = options;
  const nodes: GlbNode[] = [];
  const topologyComponents: TauCadTopologyComponent[] = [];
  const occupiedRanges: Array<readonly [number, number]> = [];
  const authoredNames = new Set<string>();
  for (const component of occurrences) {
    if (component.name === undefined) {
      continue;
    }
    if (authoredNames.has(component.name)) {
      throw new Error(`PicoGK part name "${component.id}" is already in use.`);
    }
    authoredNames.add(component.name);
  }
  const usedNames = new Set(authoredNames);
  const names = new Map<string, string>();
  const converted = new Map<
    string,
    {
      kind: 'triangles' | 'lines';
      positions: Float32Array<ArrayBuffer>;
      normals: Float32Array<ArrayBuffer> | undefined;
      indices: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>;
      texCoords: Float32Array<ArrayBuffer> | undefined;
      tangents: Float32Array<ArrayBuffer> | undefined;
    }
  >();
  for (const component of prototypes) {
    if (converted.has(component.id)) {
      throw new Error('Duplicate PicoGK prototype identity.');
    }
    const name = component.id;
    const isTriangle = component.kind === 'triangles';
    assertValidShape(component);
    recordRanges(component, occupiedRanges);
    if (
      component.indexOffset % (component.indexComponentType === 5123 ? 2 : 4) !== 0 ||
      component.indexOffset + component.indexCount * (component.indexComponentType === 5123 ? 2 : 4) > bytes.byteLength
    ) {
      throw new Error('Invalid PicoGK index artifact range.');
    }
    const sourcePositions = viewFloat32(bytes, component.positionOffset, component.positionCount);
    const sourceNormals = isTriangle ? viewFloat32(bytes, component.normalOffset, component.normalCount) : undefined;
    const sourceIndices =
      component.indexComponentType === 5125
        ? viewUint32(bytes, component.indexOffset, component.indexCount)
        : new Uint16Array(bytes.buffer, bytes.byteOffset + component.indexOffset, component.indexCount);
    const positions = toGlbVectors(sourcePositions, 'position', name);
    const normals = sourceNormals ? toGlbVectors(sourceNormals, 'direction', name) : undefined;
    assertIndexRange(sourceIndices, sourcePositions.length / 3, name);
    const texCoordCount = component.texCoordCount ?? 0;
    const tangentCount = component.tangentCount ?? 0;
    if (
      (!isTriangle && (texCoordCount > 0 || tangentCount > 0)) ||
      (texCoordCount > 0 && texCoordCount !== (sourcePositions.length / 3) * 2) ||
      (tangentCount > 0 && tangentCount !== (sourcePositions.length / 3) * 4)
    ) {
      throw new Error(`PicoGK component "${name}" has invalid material attribute counts.`);
    }
    const texCoords = texCoordCount > 0 ? viewFloat32(bytes, component.texCoordOffset ?? 0, texCoordCount) : undefined;
    const sourceTangents =
      tangentCount > 0 ? viewFloat32(bytes, component.tangentOffset ?? 0, tangentCount) : undefined;
    const tangents = sourceTangents ? new Float32Array(sourceTangents.length) : undefined;
    if (sourceTangents && tangents) {
      for (let index = 0; index < sourceTangents.length; index += 4) {
        tangents[index] = sourceTangents[index]!;
        tangents[index + 1] = sourceTangents[index + 2]!;
        tangents[index + 2] = -sourceTangents[index + 1]!;
        tangents[index + 3] = sourceTangents[index + 3]!;
      }
    }
    converted.set(component.id, {
      kind: component.kind,
      positions,
      normals,
      indices: sourceIndices,
      texCoords,
      tangents,
    });
  }
  const ids = new Set<string>();
  const referenced = new Set<string>();
  const meshIndices = new Map<GlbNode['primitives'], number>();
  const primitiveInputs = new Map<string, GlbNode['primitives']>();
  for (const [nodeIndex, component] of occurrences.entries()) {
    if (ids.has(component.id)) {
      throw new Error('Duplicate PicoGK occurrence identity.');
    }
    ids.add(component.id);
    referenced.add(component.prototypeId);
    const geometry = converted.get(component.prototypeId);
    if (!geometry) {
      throw new Error('Unknown PicoGK prototype identity.');
    }
    let name = resolveShapeName({ index: nodeIndex, name: component.name });
    if (component.name === undefined) {
      let fallbackIndex = nodeIndex;
      while (usedNames.has(name)) {
        name = resolveShapeName({ index: ++fallbackIndex });
      }
      usedNames.add(name);
    } else {
      names.set(name, component.id);
    }
    const { positions, normals, indices: sourceIndices, texCoords, tangents } = geometry;
    const isTriangle = geometry.kind === 'triangles';
    const displayColor = component.color;
    const materialColor = srgbTupleToLinear(displayColor);
    const material: NonNullable<GlbNode['primitives'][number]['material']> = component.material ?? {
      doubleSided: false,
      pbrMetallicRoughness: {
        baseColorFactor: materialColor,
        metallicFactor: component.metallic,
        ...(component.roughness === 1 ? {} : { roughnessFactor: component.roughness }),
      },
      ...(materialColor[3] < 1 ? { alphaMode: 'BLEND' } : {}),
    };
    const key = `${component.prototypeId}:${JSON.stringify(material)}`;
    let primitives = primitiveInputs.get(key);
    if (!primitives) {
      primitives = [
        {
          mode: isTriangle ? 4 : 1,
          positions,
          ...(normals ? { normals } : {}),
          indices: sourceIndices,
          ...(texCoords ? { texCoords: [texCoords] } : {}),
          ...(tangents ? { tangents } : {}),
          material,
        },
      ];
      meshIndices.set(primitives, primitiveInputs.size);
      primitiveInputs.set(key, primitives);
    }
    nodes.push({
      name,
      matrix: toGlbMatrix(component.matrix),
      extras: { tauComponentId: component.id },
      primitives,
    });
    topologyComponents.push({
      id: component.id,
      name,
      kind: isTriangle ? 'mesh' : 'polyline',
      selector: formatPrimitiveSelector(nodeIndex, isTriangle ? 'surface' : 'edges'),
      color: displayColor,
      nodeIndex,
      meshIndex: meshIndices.get(primitives)!,
      primitiveIndices: [0],
      primitiveRefs: [
        {
          nodeIndex,
          meshIndex: meshIndices.get(primitives)!,
          primitiveIndex: 0,
        },
      ],
      capabilities: {
        hasPreciseTopology: false,
        exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
      },
    });
  }

  if (referenced.size !== converted.size) {
    throw new Error('Unreferenced PicoGK prototype identity.');
  }

  const mechanism =
    options.mechanismSource === undefined
      ? undefined
      : convertMechanism(options.mechanismSource, names, options.onIssues);
  const topology: TauCadTopologyPayload = {
    schemaVersion: 1,
    components: topologyComponents,
    ...(mechanism ? { mechanism } : {}),
  };
  const topologyData = new TextEncoder().encode(JSON.stringify(topology));
  const resources: GlbResources = {
    images: (options.resources.images ?? []).map((image) => {
      const end = image.offset + image.byteLength;
      if (
        image.offset % 4 !== 0 ||
        end > bytes.byteLength ||
        occupiedRanges.some(([start, stop]) => image.offset < stop && start < end)
      ) {
        throw new Error('PicoGK worker returned an invalid image artifact range.');
      }
      occupiedRanges.push([image.offset, end]);
      return {
        data: bytes.slice(image.offset, end),
        mimeType: image.mimeType,
        ...(image.name ? { name: image.name } : {}),
      };
    }),
    textures: options.resources.textures ?? undefined,
    samplers: options.resources.samplers ?? undefined,
  };
  validateGlbResources(resources);
  return writeGlb({
    nodes,
    ...resources,
    extensionsUsed: [tauCadTopologyExtension],
    extraBufferViews: [{ key: 'topology', data: topologyData }],
    extensions: (bufferViews) => {
      return {
        [tauCadTopologyExtension]: {
          schemaVersion: 1,
          encoding: 'application/json',
          topologyBufferView: bufferViews['topology']!,
        },
      };
    },
  });
};

/**
 * Validate and adapt one worker scene artifact into Tau's canonical GLB topology substrate.
 * @param bytes - Confined artifact bytes read from the worker.
 * @param result - Validated artifact descriptor returned by the worker.
 * @param onIssues - Receives mechanism metadata warnings without discarding geometry.
 * @returns A canonical inline GLB with mesh-only Tau topology.
 */
export const picogkArtifactToGlb = (
  bytes: Uint8Array<ArrayBuffer>,
  result: PicogkMeshArtifact,
  onIssues?: (issues: KernelIssue[]) => void,
): Uint8Array<ArrayBuffer> => {
  assertArtifactIntegrity(bytes, result);
  return componentsToGlb(bytes, result.prototypes, {
    occurrences: result.occurrences,
    mechanismSource: result.mechanism,
    resources: result,
    onIssues,
  });
};
