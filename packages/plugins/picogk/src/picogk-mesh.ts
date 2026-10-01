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
type PicogkComponent = PicogkBuild['components'][number];
type PicogkMeshArtifact = Pick<
  PicogkBuild,
  'artifactPath' | 'byteLength' | 'sha256' | 'components' | 'mechanism' | 'images' | 'textures' | 'samplers'
>;

const sourceToGltf = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1] as const;

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
  const resolved = resolveMechanismComponents({ source, componentIds: Object.fromEntries(names) });
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
    throw new Error(`PicoGK component "${component.name}" has an invalid ${component.kind} shape.`);
  }
};

const recordRanges = (component: PicogkComponent, occupied: Array<readonly [number, number]>): void => {
  const ranges: ReadonlyArray<readonly [number, number]> = [
    [component.positionOffset, component.positionOffset + component.positionCount * scalarBytes],
    [component.normalOffset, component.normalOffset + component.normalCount * scalarBytes],
    [component.indexOffset, component.indexOffset + component.indexCount * scalarBytes],
    [component.texCoordOffset ?? 0, (component.texCoordOffset ?? 0) + (component.texCoordCount ?? 0) * scalarBytes],
    [component.tangentOffset ?? 0, (component.tangentOffset ?? 0) + (component.tangentCount ?? 0) * scalarBytes],
  ];
  for (const range of ranges) {
    if (range[0] === range[1]) {
      continue;
    }
    if (occupied.some(([start, end]) => range[0] < end && start < range[1])) {
      throw new Error(`PicoGK component "${component.name}" has overlapping artifact ranges.`);
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
const assertIndexRange = (indices: Uint32Array<ArrayBuffer>, vertexCount: number, name: string): void => {
  // oxlint-disable-next-line typescript/prefer-for-of, unicorn-js/no-for-loop -- `for…of` runs the iterator protocol over a Uint32Array: measured 10x slower than this indexed scan at 150k indices.
  for (let index = 0; index < indices.length; index++) {
    if (indices[index]! >= vertexCount) {
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
  components: readonly PicogkComponent[],
  options: {
    mechanismSource?: unknown;
    resources: Pick<PicogkMeshArtifact, 'images' | 'textures' | 'samplers'>;
    onIssues?: (issues: KernelIssue[]) => void;
  },
): Uint8Array<ArrayBuffer> => {
  const nodes: GlbNode[] = [];
  const topologyComponents: TauCadTopologyComponent[] = [];
  const occupiedRanges: Array<readonly [number, number]> = [];
  const authoredNames = new Set<string>();
  for (const component of components) {
    if (component.name === undefined) {
      continue;
    }
    if (authoredNames.has(component.name)) {
      throw new Error(`PicoGK part name "${component.name}" is already in use.`);
    }
    authoredNames.add(component.name);
  }
  const usedNames = new Set(authoredNames);
  const names = new Map<string, string>();
  for (const [nodeIndex, component] of components.entries()) {
    let name = resolveShapeName({ index: nodeIndex, name: component.name });
    if (component.name === undefined) {
      let fallbackIndex = nodeIndex;
      while (usedNames.has(name)) {
        name = resolveShapeName({ index: ++fallbackIndex });
      }
      usedNames.add(name);
    }
    // Fallback labels describe display order, so mechanisms may reference only explicit authored names.
    if (component.name !== undefined) {
      names.set(name, component.id);
    }
    const isTriangle = component.kind === 'triangles';
    assertValidShape(component);
    recordRanges(component, occupiedRanges);
    const sourcePositions = viewFloat32(bytes, component.positionOffset, component.positionCount);
    const sourceNormals = isTriangle ? viewFloat32(bytes, component.normalOffset, component.normalCount) : undefined;
    const sourceIndices = viewUint32(bytes, component.indexOffset, component.indexCount);
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
    const displayColor = component.color;
    const materialColor = srgbTupleToLinear(displayColor);
    nodes.push({
      name,
      extras: { tauComponentId: component.id },
      primitives: [
        {
          mode: isTriangle ? 4 : 1,
          positions,
          ...(normals ? { normals } : {}),
          // The writer copies from this view into the GLB buffer, so no copy is made here.
          indices: sourceIndices,
          ...(texCoords ? { texCoords: [texCoords] } : {}),
          ...(tangents ? { tangents } : {}),
          material: component.material ?? {
            doubleSided: false,
            pbrMetallicRoughness: {
              baseColorFactor: materialColor,
              metallicFactor: component.metallic,
              ...(component.roughness === 1 ? {} : { roughnessFactor: component.roughness }),
            },
            ...(materialColor[3] < 1 ? { alphaMode: 'BLEND' } : {}),
            name,
          },
        },
      ],
    });
    topologyComponents.push({
      id: component.id,
      name,
      kind: isTriangle ? 'mesh' : 'polyline',
      selector: formatPrimitiveSelector(nodeIndex, isTriangle ? 'surface' : 'edges'),
      color: displayColor,
      nodeIndex,
      meshIndex: nodeIndex,
      primitiveIndices: [0],
      primitiveRefs: [{ nodeIndex, meshIndex: nodeIndex, primitiveIndex: 0 }],
      capabilities: {
        hasPreciseTopology: false,
        exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
      },
    });
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
      if (end > bytes.byteLength || occupiedRanges.some(([start, stop]) => image.offset < stop && start < end)) {
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
  return componentsToGlb(bytes, result.components, { mechanismSource: result.mechanism, resources: result, onIssues });
};
