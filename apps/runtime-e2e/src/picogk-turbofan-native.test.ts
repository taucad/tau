/** Compiled GeoSpec admission and sampled motion evidence for the recovered TF-2000. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePose, sampleAnimation } from '@taucad/kinematics';
import type { Mechanism } from '@taucad/kinematics';
import { createExampleRuntimeClient } from '@taucad/tau-examples/runtime';
import { createGeoSpecAssertionClient } from 'geospec/assertion-client';
import { createGeoSpecNativeModelLoader } from 'geospec/runner/native';
import { expect, it } from 'vitest';

const projectPath = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../libs/tau-examples/src/kernels/picogk/turbofan',
);
const assembly = JSON.parse(readFileSync(resolve(projectPath, 'assembly.json'), 'utf8')) as {
  parts: Array<{ id: string; count: number; motion?: string }>;
};

type Topology = {
  schemaVersion: 1;
  components: Array<{
    id: string;
    name: string;
    kind: string;
    meshIndex: number;
    nodeIndex: number;
    selector: string;
    primitiveRefs?: Array<{ nodeIndex: number; meshIndex: number; primitiveIndex: number }>;
  }>;
  mechanism?: Mechanism;
};

type Gltf = {
  nodes: Array<{ mesh?: number; matrix?: readonly number[] }>;
  scenes: Array<{ nodes: number[] }>;
  extensions: { TAU_cad_topology: { topologyBufferView: number } };
  bufferViews: Array<{ byteOffset?: number; byteLength: number; byteStride?: number }>;
  meshes: Array<{ primitives: Array<{ indices: number; attributes: { POSITION: number } }> }>;
  accessors: Array<{
    count: number;
    bufferView: number;
    byteOffset?: number;
    componentType: number;
    type: string;
    min?: number[];
    max?: number[];
  }>;
};

const rewriteGlb = (bytes: Uint8Array<ArrayBuffer>, gltf: Gltf, topology?: Topology): Uint8Array<ArrayBuffer> => {
  const original = readTopology(bytes);
  const topologyIndex = gltf.extensions.TAU_cad_topology.topologyBufferView;
  const topologyView = gltf.bufferViews[topologyIndex]!;
  const topologyBytes = topology ? new TextEncoder().encode(JSON.stringify(topology)) : undefined;
  if (topologyBytes) {
    expect(topologyBytes.byteLength).toBeLessThanOrEqual(topologyView.byteLength);
    topologyView.byteLength = topologyBytes.byteLength;
  }
  const encoded = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonLength = Math.ceil(encoded.byteLength / 4) * 4;
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const binaryLength = input.getUint32(original.binaryStart - 8, true);
  const output = new Uint8Array(12 + 8 + jsonLength + 8 + binaryLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, output.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  output.fill(0x20, 20, 20 + jsonLength);
  output.set(encoded, 20);
  view.setUint32(20 + jsonLength, binaryLength, true);
  view.setUint32(24 + jsonLength, 0x00_4e_49_42, true);
  output.set(bytes.subarray(original.binaryStart, original.binaryStart + binaryLength), 28 + jsonLength);
  if (topologyBytes) {
    output.set(topologyBytes, 28 + jsonLength + (topologyView.byteOffset ?? 0));
  }
  return output;
};

const poseGlb = (
  bytes: Uint8Array<ArrayBuffer>,
  transforms: ReadonlyMap<string, readonly number[]>,
): Uint8Array<ArrayBuffer> => {
  const { topology, gltf } = readTopology(bytes);
  for (const component of topology.components) {
    const matrix = transforms.get(component.name);
    if (matrix) {
      gltf.nodes[component.nodeIndex]!.matrix = matrix;
    }
  }
  return rewriteGlb(bytes, gltf);
};

const subsetGlb = (bytes: Uint8Array<ArrayBuffer>, names: ReadonlySet<string>): Uint8Array<ArrayBuffer> => {
  const { topology, gltf } = readTopology(bytes);
  const selected = topology.components.filter(({ name }) => names.has(name));
  expect(selected).toHaveLength(names.size);
  const originalNodes = gltf.nodes;
  gltf.nodes = selected.map(({ nodeIndex }) => originalNodes[nodeIndex]!);
  gltf.scenes = [{ nodes: selected.map((_, index) => index) }];
  const components = selected.map((component, nodeIndex) => ({
    ...component,
    nodeIndex,
    selector: `node/${nodeIndex}/surface`,
    primitiveRefs: component.primitiveRefs?.map((reference) => ({ ...reference, nodeIndex })),
  }));
  return rewriteGlb(bytes, gltf, { schemaVersion: topology.schemaVersion, components });
};

const readTopology = (
  bytes: Uint8Array<ArrayBuffer>,
): { topology: Topology; triangles: number; gltf: Gltf; binaryStart: number } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Gltf;
  const binaryStart = 20 + jsonLength + 8;
  const topologyView = gltf.bufferViews[gltf.extensions.TAU_cad_topology.topologyBufferView]!;
  const start = binaryStart + (topologyView.byteOffset ?? 0);
  const topology = JSON.parse(
    new TextDecoder().decode(bytes.subarray(start, start + topologyView.byteLength)),
  ) as Topology;
  return {
    topology,
    triangles: topology.components.reduce(
      (sum, component) =>
        sum +
        gltf.meshes[component.meshIndex]!.primitives.reduce(
          (count, primitive) => count + gltf.accessors[primitive.indices]!.count / 3,
          0,
        ),
      0,
    ),
    gltf,
    binaryStart,
  };
};

const radius = (matrix: readonly number[], point: readonly [number, number, number]): number => {
  const y = matrix[1]! * point[0] + matrix[5]! * point[1] + matrix[9]! * point[2] + matrix[13]!;
  const z = matrix[2]! * point[0] + matrix[6]! * point[1] + matrix[10]! * point[2] + matrix[14]!;
  return Math.hypot(y, z);
};

const meshVertices = ({
  bytes,
  gltf,
  binaryStart,
  meshIndex,
}: {
  bytes: Uint8Array<ArrayBuffer>;
  gltf: Gltf;
  binaryStart: number;
  meshIndex: number;
}): Array<readonly [number, number, number]> => {
  const accessor = gltf.accessors[gltf.meshes[meshIndex]!.primitives[0]!.attributes.POSITION]!;
  const bufferView = gltf.bufferViews[accessor.bufferView]!;
  expect(accessor.componentType).toBe(5126);
  expect(accessor.type).toBe('VEC3');
  const start = binaryStart + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = bufferView.byteStride ?? 12;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: accessor.count }, (_, index): readonly [number, number, number] => [
    view.getFloat32(start + index * stride, true),
    view.getFloat32(start + index * stride + 4, true),
    view.getFloat32(start + index * stride + 8, true),
  ]);
};

const componentAxialBounds = ({
  bytes,
  gltf,
  binaryStart,
  meshIndex,
  nodeIndex,
}: {
  bytes: Uint8Array<ArrayBuffer>;
  gltf: Gltf;
  binaryStart: number;
  meshIndex: number;
  nodeIndex: number;
}): readonly [number, number] => {
  let min = Infinity;
  let max = -Infinity;
  const matrix = gltf.nodes[nodeIndex]!.matrix ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const project = (x: number, y: number, z: number) => matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!;
  for (const primitive of gltf.meshes[meshIndex]!.primitives) {
    const accessor = gltf.accessors[primitive.attributes.POSITION]!;
    if (accessor.min && accessor.max) {
      for (let corner = 0; corner < 8; corner++) {
        const axial = project(
          accessor[corner % 2 ? 'max' : 'min']![0]!,
          accessor[Math.floor(corner / 2) % 2 ? 'max' : 'min']![1]!,
          accessor[Math.floor(corner / 4) % 2 ? 'max' : 'min']![2]!,
        );
        min = Math.min(min, axial);
        max = Math.max(max, axial);
      }
      continue;
    }
    const bufferView = gltf.bufferViews[accessor.bufferView]!;
    const start = binaryStart + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stride = bufferView.byteStride ?? 12;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < accessor.count; index++) {
      const x = project(
        view.getFloat32(start + index * stride, true),
        view.getFloat32(start + index * stride + 4, true),
        view.getFloat32(start + index * stride + 8, true),
      );
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
  }
  expect(Number.isFinite(min) && Number.isFinite(max)).toBe(true);
  return [min, max];
};

it.skipIf(process.env['GEOSPEC_TURBOFAN_NATIVE'] !== '1')(
  'admits actual TF-2000 GLB to compiled GeoSpec and checks named two-spool poses',
  { timeout: 3_600_000 },
  async () => {
    const started = performance.now();
    const runtime = await createExampleRuntimeClient(projectPath);
    const engineModule = await import('@taucad/geospec-engine-native/node');
    const engine = new engineModule.Engine();
    const loader = createGeoSpecNativeModelLoader({ engine });
    let document: ReturnType<typeof runtime.open> | undefined;
    try {
      await runtime.connect();
      const connected = performance.now();
      // eslint-disable-next-line @typescript-eslint/naming-convention -- C# parameter uses this exact case.
      document = runtime.open({ source: { path: 'main.cs' }, parameters: { Cutaway: false }, watch: false });
      const first = await document.export('glb');
      const cold = performance.now();
      expect(first.success).toBe(true);
      if (!first.success) {
        throw new Error(JSON.stringify(first.issues));
      }
      const glb = first.files[0].bytes;
      expect(glb.byteLength).toBeGreaterThan(0);
      const second = await document.export('glb');
      const warm = performance.now();
      expect(second.success).toBe(true);
      const updated = await document.update({ parameters: {} });
      expect(updated.superseded).toBe(false);
      if (updated.superseded || !updated.evaluation.success) {
        throw new Error('The default cutaway did not evaluate.');
      }
      const cutaway = await document.export('glb');
      expect(cutaway.success).toBe(true);
      if (!cutaway.success) {
        throw new Error(JSON.stringify(cutaway.issues));
      }
      const cutawayGlb = cutaway.files[0].bytes;
      expect(cutawayGlb.byteLength).toBeGreaterThan(0);
      const cutawayExported = performance.now();
      const { topology, triangles, gltf, binaryStart } = readTopology(glb);
      // oxlint-disable-next-line no-console -- Native admission limit diagnosis.
      console.log(
        JSON.stringify({ scope: 'full', components: topology.components.length, triangles, glbBytes: glb.byteLength }),
      );
      expect(topology.components).toHaveLength(2173);
      expect(topology.schemaVersion).toBe(1);
      expect(new Set(topology.components.map(({ id }) => id)).size).toBe(2173);
      expect(new Set(topology.components.map(({ name }) => name)).size).toBe(2173);
      expect(topology.components.every(({ kind }) => kind === 'mesh')).toBe(true);
      const expectedNames = assembly.parts.flatMap((part) =>
        Array.from({ length: part.count }, (_, index) => `${part.id} #${String(index + 1).padStart(3, '0')}`),
      );
      expect(topology.components.map(({ name }) => name).sort()).toEqual(expectedNames.sort());

      const { mechanism } = topology;
      expect(mechanism).toBeDefined();
      if (!mechanism) {
        throw new Error('The GLB has no resolved mechanism.');
      }
      expect(mechanism.units).toEqual({ length: 'm', angle: 'deg' });
      expect(Object.keys(mechanism.joints).sort()).toEqual(['highPressureSpin', 'lowPressureSpin']);
      const familyNames = (motion: string) =>
        new Set(assembly.parts.filter((part) => part.motion === motion).map((part) => part.id));
      const count = (motion: string) =>
        assembly.parts.filter((part) => part.motion === motion).reduce((sum, part) => sum + part.count, 0);
      expect(count('lp')).toBe(329);
      expect(count('hp')).toBe(370);
      expect(mechanism.links['lowPressure']?.components).toHaveLength(329);
      expect(mechanism.links['highPressure']?.components).toHaveLength(370);
      expect(mechanism.links['frame']?.components).toHaveLength(1474);
      const assigned = Object.values(mechanism.links).flatMap(({ components }) => components);
      expect(assigned).toHaveLength(2173);
      expect(new Set(assigned)).toEqual(new Set(topology.components.map(({ id }) => id)));
      for (const [link, motion] of [
        ['lowPressure', 'lp'],
        ['highPressure', 'hp'],
      ] as const) {
        const names = mechanism.links[link]!.components.map(
          (id) => topology.components.find((component) => component.id === id)?.name,
        );
        expect(new Set(names.map((name) => name?.split(' #')[0]))).toEqual(familyNames(motion));
        expect(new Set(names)).toEqual(
          new Set(
            assembly.parts
              .filter((part) => part.motion === motion)
              .flatMap((part) =>
                Array.from({ length: part.count }, (_, index) => `${part.id} #${String(index + 1).padStart(3, '0')}`),
              ),
          ),
        );
      }
      const lowPressureShaft = topology.components.find(({ name }) => name === 'shafts/lowPressure #001');
      const highPressureShaft = topology.components.find(({ name }) => name === 'shafts/highPressure #001');
      expect(lowPressureShaft).toBeDefined();
      expect(highPressureShaft).toBeDefined();
      const lpVertices = meshVertices({ bytes: glb, gltf, binaryStart, meshIndex: lowPressureShaft!.meshIndex });
      const hpVertices = meshVertices({ bytes: glb, gltf, binaryStart, meshIndex: highPressureShaft!.meshIndex });
      const clips = mechanism.animations ?? [];
      expect(clips).toHaveLength(1);
      const poses = [];
      for (const time of [0.137, 0.731, 1.619]) {
        const coordinates = sampleAnimation({ animation: clips[0]!, time });
        expect(coordinates['lowPressureSpin']).toBeGreaterThan(0);
        expect(coordinates['highPressureSpin']).toBeGreaterThan(0);
        const posed = evaluatePose({ mechanism, coordinates });
        expect(posed.status).toBe('posed');
        if (posed.status !== 'posed') {
          throw new Error(JSON.stringify(posed.issues));
        }
        const lp = posed.pose.linkTransforms['lowPressure']!;
        const hp = posed.pose.linkTransforms['highPressure']!;
        expect(lp).not.toEqual(hp);
        // The rest-pose axial partition is safe for every sampled rotor angle
        // only because these revolute links preserve world X without translation.
        for (const matrix of [lp, hp]) {
          expect(matrix[0]).toBeCloseTo(1, 12);
          for (const value of [matrix[4], matrix[8], matrix[12]]) {
            expect(value).toBeCloseTo(0, 12);
          }
        }
        expect(posed.pose.linkTransforms['frame']).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        // Measure the exported shaft mesh vertices after each sampled pose.
        // For these coaxial triangulated annuli, circumferential edges stay within
        // 96-sided inscribed circles; the 8 mm nominal gap remains above 7.9 mm.
        const lpOuter = Math.max(...lpVertices.map((point) => radius(lp, point)));
        const hpInner = Math.min(...hpVertices.map((point) => radius(hp, point)));
        expect(hpInner - lpOuter).toBeGreaterThan(0.0079);
        poses.push(posed.pose);
      }

      const admitted = await loader({ source: glb, format: 'glb' });
      const admission = performance.now();
      const assertions = createGeoSpecAssertionClient({ engine });
      await assertions.expectGeo(admitted).toHaveBoundingBox({
        min: { x: 0, y: -1000, z: -1000 },
        max: { x: 3600, y: 1000, z: 1000 },
        tolerance: 0.1,
      });
      await assertions.expectGeo(admitted).toHaveMeshIntegrity({
        finitePositions: true,
        degenerateTriangles: { maxCount: 0 },
        duplicateFaces: { maxCount: 0 },
      });
      await assertions.expectGeo(admitted).toBeWatertight();
      await assertions.expectGeo(admitted).toHaveVolume({ value: { greaterThan: 1e8, lessThan: 3e9 } });
      const cutawayTopology = readTopology(cutawayGlb);
      expect(cutawayTopology.topology.components).toHaveLength(2173);
      const cutawaySubject = await loader({ source: cutawayGlb, format: 'glb' });
      await assertions.expectGeo(cutawaySubject).toHaveMeshIntegrity({
        finitePositions: true,
        degenerateTriangles: { maxCount: 0 },
        duplicateFaces: { maxCount: 0 },
      });
      await assertions.expectGeo(cutawaySubject).toBeWatertight();
      const asserted = performance.now();
      await loader.releaseAll();

      const ownership = new Map(
        topology.components.flatMap(({ id, name }) =>
          Object.entries(mechanism.links)
            .filter(([, body]) => body.components.includes(id))
            .map(([body]) => [name, body] as const),
        ),
      );
      const axial = new Map(
        topology.components.map(
          ({ name, meshIndex, nodeIndex }) =>
            [name, componentAxialBounds({ bytes: glb, gltf, binaryStart, meshIndex, nodeIndex })] as const,
        ),
      );
      const sorted = [...topology.components].sort((left, right) => {
        const a = axial.get(left.name)!;
        const b = axial.get(right.name)!;
        return a[0] + a[1] - b[0] - b[1];
      });
      const batches = Array.from({ length: Math.ceil(sorted.length / 128) }, (_, index) =>
        sorted.slice(index * 128, (index + 1) * 128),
      );
      expect(
        batches
          .flat()
          .map(({ name }) => name)
          .sort(),
      ).toEqual(topology.components.map(({ name }) => name).sort());
      const range = (batch: typeof sorted): readonly [number, number] => [
        Math.min(...batch.map(({ name }) => axial.get(name)![0])),
        Math.max(...batch.map(({ name }) => axial.get(name)![1])),
      ];
      const batchRanges = batches.map((batch) => range(batch));
      const selectedBatches = batches.flatMap((left, leftIndex) =>
        batches.slice(leftIndex).flatMap((right, offset) => {
          const rightIndex = leftIndex + offset;
          const a = batchRanges[leftIndex]!;
          const b = batchRanges[rightIndex]!;
          return a[1] + 0.01 < b[0] || b[1] + 0.01 < a[0]
            ? []
            : [{ leftIndex, rightIndex, names: new Set([...left, ...right].map(({ name }) => name)) }];
        }),
      );
      expect(selectedBatches.every(({ names }) => names.size <= 256)).toBe(true);
      // Every pair is either in one tested union or safely separated by axial bounds.
      const candidatePairs = selectedBatches.reduce(
        (sum, { leftIndex, rightIndex }) =>
          sum +
          (leftIndex === rightIndex
            ? (batches[leftIndex]!.length * (batches[leftIndex]!.length - 1)) / 2
            : batches[leftIndex]!.length * batches[rightIndex]!.length),
        0,
      );
      const possiblePairs = (topology.components.length * (topology.components.length - 1)) / 2;
      // oxlint-disable-next-line no-console -- Native partition coverage and cost evidence.
      console.log(
        JSON.stringify({
          scope: 'native-overlap-plan',
          batches: batches.length,
          selectedBatches: selectedBatches.length,
          possiblePairs,
          candidatePairs,
          prunedPairs: possiblePairs - candidatePairs,
        }),
      );
      const triangleByName = new Map(
        topology.components.map(
          (component) =>
            [
              component.name,
              gltf.meshes[component.meshIndex]!.primitives.reduce(
                (sum, primitive) => sum + gltf.accessors[primitive.indices]!.count / 3,
                0,
              ),
            ] as const,
        ),
      );
      for (const [poseIndex, pose] of [undefined, ...poses].entries()) {
        const transformed = new Map<string, readonly number[]>(
          pose
            ? topology.components.map(({ name }) => [name, pose.linkTransforms[ownership.get(name) ?? 'frame']!])
            : [],
        );
        const transformedGlb = pose ? poseGlb(glb, transformed) : glb;
        for (const [batchIndex, { leftIndex, rightIndex, names }] of selectedBatches.entries()) {
          const batchStarted = performance.now();
          const posedGlb = subsetGlb(transformedGlb, names);
          const selected = readTopology(posedGlb);
          expect(new Set(selected.topology.components.map(({ name }) => name))).toEqual(names);
          expect(selected.triangles).toBe([...names].reduce((sum, name) => sum + triangleByName.get(name)!, 0));
          // eslint-disable-next-line no-await-in-loop -- Bound native subject lifetime per batch.
          const posedSubject = await loader({ source: posedGlb, format: 'glb' });
          // eslint-disable-next-line no-await-in-loop -- Query depends on admission.
          const overlap = await assertions.query({
            capability: 'analyzeMeshOverlap',
            subject: posedSubject,
            payload: { tolerance: 0.01 },
          });
          expect(overlap.status, JSON.stringify({ leftIndex, rightIndex, diagnostics: overlap.diagnostics })).toBe(
            'passed',
          );
          const result = overlap.result['evidence'];
          expect(result).toMatchObject({
            success: true,
            evidence: { componentCount: names.size, componentSource: 'named', overlaps: [] },
          });
          // eslint-disable-next-line no-await-in-loop -- Bound native retention before the next batch.
          await loader.releaseAll();
          // oxlint-disable-next-line no-console -- Bounded native coverage and progress evidence.
          console.log(
            JSON.stringify({
              scope: 'native-overlap-batch',
              poseIndex,
              batchIndex,
              batchCount: selectedBatches.length,
              leftIndex,
              rightIndex,
              componentCount: names.size,
              elapsedMillis: Math.round(performance.now() - batchStarted),
            }),
          );
        }
      }
      const posedAssertions = performance.now();
      // oxlint-disable-next-line no-console -- Native performance and size are acceptance evidence.
      console.log(
        JSON.stringify({
          backend: 'GeoSpec Rust Node N-API + PicoGK macOS native worker',
          components: topology.components.length,
          triangles,
          glbBytes: glb.byteLength,
          connectMillis: Math.round(connected - started),
          coldExportMillis: Math.round(cold - connected),
          warmExportMillis: Math.round(warm - cold),
          cutawayExportMillis: Math.round(cutawayExported - warm),
          nativeAdmissionMillis: Math.round(admission - cutawayExported),
          nativeAssertionsMillis: Math.round(asserted - admission),
          posedBatchAssertionsMillis: Math.round(posedAssertions - asserted),
        }),
      );
    } finally {
      document?.close();
      await loader.releaseAll();
      engine.close();
      runtime.terminate();
    }
  },
);
