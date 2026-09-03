import { createHash } from 'node:crypto';

import {
  formatComponentId,
  formatNamedComponentId,
  formatPrimitiveSelector,
  srgbHexToLinearTuple,
  transformNormalArray,
  transformVertexArray,
  writeGlb,
} from '@taucad/geometry-core';
import type { GlbNode, TauCadTopologyComponent, TauCadTopologyPayload } from '@taucad/geometry-core';
import { tauCadTopologyExtension } from '@taucad/runtime/types';

import type { PicogkBuild } from '#picogk.protocol.js';

const scalarBytes = 4;

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

const displayColor = (value: string): [number, number, number, number] => {
  const alpha = Number.parseInt(value.slice(7, 9), 16) / 255;
  return srgbHexToLinearTuple(value.slice(0, 7), alpha);
};

/**
 * Validate and adapt one worker mesh artifact into Tau's canonical GLB topology substrate.
 * @param bytes Confined artifact bytes read from the worker.
 * @param result Validated artifact descriptor returned by the worker.
 * @returns A canonical inline GLB with mesh-only Tau topology.
 */
export const picogkArtifactToGlb = (bytes: Uint8Array<ArrayBuffer>, result: PicogkBuild): Uint8Array<ArrayBuffer> => {
  if (bytes.byteLength !== result.byteLength) {
    throw new Error('PicoGK worker mesh byte length does not match its descriptor.');
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== result.sha256.toLowerCase()) {
    throw new Error('PicoGK worker mesh failed its SHA-256 integrity check.');
  }

  const nodes: GlbNode[] = [];
  const topologyComponents: TauCadTopologyComponent[] = [];
  const occupiedRanges: Array<readonly [number, number]> = [];
  for (const [nodeIndex, component] of result.components.entries()) {
    if (
      component.positionCount === 0 ||
      component.positionCount % 3 !== 0 ||
      component.normalCount !== component.positionCount ||
      component.indexCount === 0 ||
      component.indexCount % 3 !== 0
    ) {
      throw new Error(`PicoGK component "${component.name}" has an invalid mesh shape.`);
    }
    const ranges = [
      [component.positionOffset, component.positionOffset + component.positionCount * scalarBytes],
      [component.normalOffset, component.normalOffset + component.normalCount * scalarBytes],
      [component.indexOffset, component.indexOffset + component.indexCount * scalarBytes],
    ] as const;
    for (const range of ranges) {
      if (occupiedRanges.some(([start, end]) => range[0] < end && start < range[1])) {
        throw new Error(`PicoGK component "${component.name}" has overlapping artifact ranges.`);
      }
      occupiedRanges.push(range);
    }
    const sourcePositions = viewFloat32(bytes, component.positionOffset, component.positionCount);
    const sourceNormals = viewFloat32(bytes, component.normalOffset, component.normalCount);
    const sourceIndices = viewUint32(bytes, component.indexOffset, component.indexCount);
    if (
      sourcePositions.some((value) => !Number.isFinite(value)) ||
      sourceNormals.some((value) => !Number.isFinite(value)) ||
      sourceIndices.some((index) => index >= sourcePositions.length / 3)
    ) {
      throw new Error(`PicoGK component "${component.name}" contains invalid mesh values.`);
    }
    const color = displayColor(component.color);
    nodes.push({
      name: component.name,
      primitives: [
        {
          mode: 4,
          positions: transformVertexArray(sourcePositions),
          normals: transformNormalArray(sourceNormals),
          indices: new Uint32Array(sourceIndices),
          material: {
            name: component.name,
            baseColorFactor: color,
            metallicFactor: 0,
            roughnessFactor: 0.7,
            doubleSided: false,
            alphaMode: color[3] < 1 ? 'BLEND' : 'OPAQUE',
          },
        },
      ],
    });
    const id = formatNamedComponentId(component.name, nodeIndex) ?? formatComponentId(nodeIndex);
    topologyComponents.push({
      id,
      name: component.name,
      kind: 'mesh',
      selector: formatPrimitiveSelector(nodeIndex, 'surface'),
      color,
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
