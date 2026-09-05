import { createHash } from 'node:crypto';

import {
  formatPrimitiveSelector,
  srgbTupleToLinear,
  transformNormalArray,
  transformVertexArray,
  writeGlb,
} from '@taucad/geometry-core';
import type { GlbNode, TauCadTopologyComponent, TauCadTopologyPayload } from '@taucad/geometry-core';
import { tauCadTopologyExtension } from '@taucad/runtime/types';

import type { PicogkBuild } from '#picogk.protocol.js';

const scalarBytes = 4;
type PicogkComponent = PicogkBuild['components'][number];
type PicogkMeshArtifact = Pick<PicogkBuild, 'artifactPath' | 'byteLength' | 'sha256' | 'components'>;

/** One stable PicoGK component encoded as an independently transferable GLB asset. */
export type PicogkComponentGlb = {
  readonly id: string;
  readonly name: string;
  readonly content: Uint8Array<ArrayBuffer>;
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
): Uint8Array<ArrayBuffer> => {
  const nodes: GlbNode[] = [];
  const topologyComponents: TauCadTopologyComponent[] = [];
  const occupiedRanges: Array<readonly [number, number]> = [];
  for (const [nodeIndex, component] of components.entries()) {
    const isTriangle = component.kind === 'triangles';
    assertValidShape(component);
    recordRanges(component, occupiedRanges);
    const sourcePositions = viewFloat32(bytes, component.positionOffset, component.positionCount);
    const sourceNormals = isTriangle ? viewFloat32(bytes, component.normalOffset, component.normalCount) : undefined;
    const sourceIndices = viewUint32(bytes, component.indexOffset, component.indexCount);
    if (
      sourcePositions.some((value) => !Number.isFinite(value)) ||
      (sourceNormals?.some((value) => !Number.isFinite(value)) ?? false) ||
      sourceIndices.some((index) => index >= sourcePositions.length / 3)
    ) {
      throw new Error(`PicoGK component "${component.name}" contains invalid mesh values.`);
    }
    const displayColor = component.color;
    const materialColor = srgbTupleToLinear(displayColor);
    nodes.push({
      name: component.name,
      primitives: [
        {
          mode: isTriangle ? 4 : 1,
          positions: transformVertexArray(sourcePositions),
          ...(sourceNormals ? { normals: transformNormalArray(sourceNormals) } : {}),
          indices: new Uint32Array(sourceIndices),
          material: {
            name: component.name,
            baseColorFactor: materialColor,
            metallicFactor: component.metallic,
            roughnessFactor: component.roughness,
            doubleSided: false,
            alphaMode: materialColor[3] < 1 ? 'BLEND' : 'OPAQUE',
          },
        },
      ],
    });
    topologyComponents.push({
      id: component.id,
      name: component.name,
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

  const topology: TauCadTopologyPayload = { schemaVersion: 1, components: topologyComponents };
  const topologyData = new TextEncoder().encode(JSON.stringify(topology));
  return writeGlb({
    nodes,
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
 * @param bytes Confined artifact bytes read from the worker.
 * @param result Validated artifact descriptor returned by the worker.
 * @returns A canonical inline GLB with mesh-only Tau topology.
 */
export const picogkArtifactToGlb = (
  bytes: Uint8Array<ArrayBuffer>,
  result: PicogkMeshArtifact,
): Uint8Array<ArrayBuffer> => {
  assertArtifactIntegrity(bytes, result);
  return componentsToGlb(bytes, result.components);
};

/**
 * Split one dirty-component artifact batch into independently transferable immutable GLBs.
 * @param bytes Confined artifact bytes read from the worker.
 * @param result Validated artifact descriptor containing only dirty components.
 * @returns One GLB asset for each stable component id in worker order.
 */
export const picogkArtifactToComponentGlbs = (
  bytes: Uint8Array<ArrayBuffer>,
  result: PicogkMeshArtifact,
): readonly PicogkComponentGlb[] => {
  assertArtifactIntegrity(bytes, result);
  return result.components.map((component) => ({
    id: component.id,
    name: component.name,
    content: componentsToGlb(bytes, [component]),
  }));
};
