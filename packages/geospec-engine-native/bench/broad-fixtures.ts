import { mkdir, open, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- #bench/lib resolves to this package's own benchmark library.
import { sha256 } from '#bench/lib';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- #bench/lib resolves to this package's own benchmark library.
import type { Artifact } from '#bench/lib';

/** Artifact with its checked byte length. @internal */
export type SizedArtifact = Artifact & { bytes: number };

/** Generated input descriptor consumed by the Lead-owned benchmark harness. @internal */
export type BroadFixtureDescriptor = {
  id: string;
  family: 'large-mesh' | 'many-occurrences' | 'boolean-void-heavy' | 'many-claims';
  format: 'gltf' | 'step' | 'request-construction-json';
  primary: SizedArtifact;
  resources: SizedArtifact[];
  analyticFacts: Record<string, unknown>;
  qualification: string;
};

/** Source-bound generated-input manifest. @internal */
export type BroadFixtureManifest = {
  schemaVersion: 1;
  source: string;
  generator: SizedArtifact;
  fixtures: BroadFixtureDescriptor[];
  totalGeneratedBytes: number;
  candidateEngineExecuted: false;
  timingRun: false;
};

const source = 'abda45d29347115685b226bffe26bbb3678a27e0';
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
/** Exclusive generated-input cache for this lane. @internal */
export const broadFixtureCache = resolve(
  workspaceRoot,
  'node_modules/.cache/geospec-engine-native/matcher-full-broad-fixtures-a1',
);

const limits = {
  maxSubjectBytes: 64 * 1024 * 1024,
  maxResourceBytes: 64 * 1024 * 1024,
  maxTotalBinaryBytes: 128 * 1024 * 1024,
  maxVertices: 2_000_000,
  maxTriangles: 4_000_000,
  maxOccurrences: 65_536,
  generatedFixtureDiskBytes: 256 * 1024 * 1024,
} as const;

const cubePositions = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1] as const;
const outwardCubeIndices = [
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
] as const;

const assertInteger = (value: number, name: string, maximum: number): void => {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(`${name} must be an integer in [1, ${maximum}], received ${value}.`);
  }
};

const largeMeshCounts = (side: number) => {
  assertInteger(side, 'large mesh side', 48);
  const cubeCount = side ** 3;
  const vertexCount = cubeCount * 8;
  const triangleCount = cubeCount * 12;
  const positionBytes = vertexCount * 3 * Float32Array.BYTES_PER_ELEMENT;
  const indexBytes = triangleCount * 3 * Uint32Array.BYTES_PER_ELEMENT;
  const binaryBytes = positionBytes + indexBytes;
  if (
    vertexCount > limits.maxVertices ||
    triangleCount > limits.maxTriangles ||
    binaryBytes > limits.maxResourceBytes
  ) {
    throw new RangeError('Large mesh recipe exceeds the frozen admission limits.');
  }
  return { cubeCount, vertexCount, triangleCount, positionBytes, indexBytes, binaryBytes };
};

const artifact = async (path: string): Promise<SizedArtifact> => {
  const bytes = await readFile(path);
  return { path, sha256: sha256(bytes), bytes: bytes.byteLength };
};

const writeJson = async (path: string, value: Record<string, unknown>): Promise<SizedArtifact> => {
  const bytes = Buffer.from(`${JSON.stringify(value, undefined, 2)}\n`);
  if (bytes.byteLength > limits.maxSubjectBytes) {
    throw new RangeError(`${basename(path)} exceeds the frozen primary-input byte limit.`);
  }
  await writeFile(path, bytes);
  return artifact(path);
};

const cubeBinary = (dimensions: readonly [number, number, number]): Uint8Array<ArrayBuffer> => {
  const bytes = Buffer.alloc(8 * 3 * Float32Array.BYTES_PER_ELEMENT + 12 * 3 * Uint32Array.BYTES_PER_ELEMENT);
  for (const [index, position] of cubePositions.entries()) {
    bytes.writeFloatLE(position * dimensions[index % 3]!, index * Float32Array.BYTES_PER_ELEMENT);
  }
  const indexOffset = cubePositions.length * Float32Array.BYTES_PER_ELEMENT;
  for (const [index, vertex] of outwardCubeIndices.entries()) {
    bytes.writeUInt32LE(vertex, indexOffset + index * Uint32Array.BYTES_PER_ELEMENT);
  }
  return bytes;
};

const boxGltf = ({
  id,
  resource,
  dimensions,
  nodes,
}: {
  id: string;
  resource: string;
  dimensions: readonly [number, number, number];
  nodes: Array<{ name: string; translation: [number, number, number] }>;
}): Record<string, unknown> => ({
  asset: { version: '2.0', generator: 'Tau GeoSpec broad fixture generator' },
  scene: 0,
  scenes: [{ name: id, nodes: nodes.map((_, index) => index) }],
  nodes: nodes.map(({ name, translation }, mesh) => ({ name, mesh, translation })),
  meshes: nodes.map(({ name }) => ({ name, primitives: [{ attributes: positionAttribute, indices: 1, mode: 4 }] })),
  buffers: [{ uri: basename(resource), byteLength: 240 }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 96, target: 34_962 },
    { buffer: 0, byteOffset: 96, byteLength: 144, target: 34_963 },
  ],
  accessors: [
    {
      bufferView: 0,
      byteOffset: 0,
      componentType: 5126,
      count: 8,
      type: 'VEC3',
      min: [0, 0, 0],
      max: dimensions,
    },
    { bufferView: 1, byteOffset: 0, componentType: 5125, count: 36, type: 'SCALAR', min: [0], max: [7] },
  ],
});

const writeBoxGltf = async ({
  outputDirectory,
  id,
  dimensions,
  nodes,
}: {
  outputDirectory: string;
  id: string;
  dimensions: readonly [number, number, number];
  nodes: Array<{ name: string; translation: [number, number, number] }>;
}) => {
  if (nodes.length > limits.maxOccurrences) {
    throw new RangeError(`${id} exceeds the frozen occurrence limit.`);
  }
  const resourcePath = resolve(outputDirectory, `${id}.bin`);
  const gltfPath = resolve(outputDirectory, `${id}.gltf`);
  const binary = cubeBinary(dimensions);
  await writeFile(resourcePath, binary);
  const primary = await writeJson(gltfPath, boxGltf({ id, resource: resourcePath, dimensions, nodes }));
  return { primary, resources: [await artifact(resourcePath)] };
};

const writeLargeMeshBinary = async (path: string, side: number): Promise<ReturnType<typeof largeMeshCounts>> => {
  const counts = largeMeshCounts(side);
  const handle = await open(path, 'w');
  const cubesPerChunk = 4096;
  try {
    for (let first = 0; first < counts.cubeCount; first += cubesPerChunk) {
      const chunkCubes = Math.min(cubesPerChunk, counts.cubeCount - first);
      const positions = Buffer.allocUnsafe(chunkCubes * 8 * 3 * Float32Array.BYTES_PER_ELEMENT);
      const indices = Buffer.allocUnsafe(chunkCubes * 12 * 3 * Uint32Array.BYTES_PER_ELEMENT);
      for (let localCube = 0; localCube < chunkCubes; localCube += 1) {
        const cube = first + localCube;
        const x = 2 * (cube % side);
        const y = 2 * (Math.floor(cube / side) % side);
        const z = 2 * Math.floor(cube / (side * side));
        const translation = [x, y, z] as const;
        for (let coordinate = 0; coordinate < cubePositions.length; coordinate += 1) {
          positions.writeFloatLE(
            cubePositions[coordinate]! + translation[coordinate % 3]!,
            (localCube * cubePositions.length + coordinate) * Float32Array.BYTES_PER_ELEMENT,
          );
        }
        for (let index = 0; index < outwardCubeIndices.length; index += 1) {
          indices.writeUInt32LE(
            cube * 8 + outwardCubeIndices[index]!,
            (localCube * outwardCubeIndices.length + index) * Uint32Array.BYTES_PER_ELEMENT,
          );
        }
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- Sequential bounded chunks keep peak allocation and file offsets deterministic.
      await handle.write(positions, 0, positions.byteLength, first * 8 * 3 * Float32Array.BYTES_PER_ELEMENT);
      // oxlint-disable-next-line eslint/no-await-in-loop -- Indices follow their matching position chunk without retaining pending buffers.
      await handle.write(
        indices,
        0,
        indices.byteLength,
        counts.positionBytes + first * 12 * 3 * Uint32Array.BYTES_PER_ELEMENT,
      );
    }
  } finally {
    await handle.close();
  }
  const generated = await stat(path);
  if (generated.size !== counts.binaryBytes) {
    throw new Error('Large mesh binary length does not match the frozen formula.');
  }
  return counts;
};

type LargeMeshGeneration = {
  counts: ReturnType<typeof largeMeshCounts>;
  primary: SizedArtifact;
  resources: SizedArtifact[];
};

// eslint-disable-next-line @typescript-eslint/naming-convention -- glTF requires the exact uppercase semantic key.
const positionAttribute = { POSITION: 0 };

/**
 * Generate one bounded large indexed mesh without materializing numeric JSON arrays.
 * @internal
 * @param outputDirectory - Exclusive generated-fixture directory.
 * @param side - Cube grid side, at most the frozen default of 48.
 * @returns Generated artifacts and exact count formulas.
 */
export const generateLargeMesh = async (outputDirectory: string, side = 48): Promise<LargeMeshGeneration> => {
  await mkdir(outputDirectory, { recursive: true });
  const resourcePath = resolve(outputDirectory, `large-mesh-${side}.bin`);
  const counts = await writeLargeMeshBinary(resourcePath, side);
  const gltfPath = resolve(outputDirectory, `large-mesh-${side}.gltf`);
  const maximum = side * 2 - 1;
  const primary = await writeJson(gltfPath, {
    asset: { version: '2.0', generator: 'Tau GeoSpec broad fixture generator' },
    scene: 0,
    scenes: [{ name: `large-mesh-${side}`, nodes: [0] }],
    nodes: [{ name: `large-mesh-${side}`, mesh: 0 }],
    meshes: [{ name: `large-mesh-${side}`, primitives: [{ attributes: positionAttribute, indices: 1, mode: 4 }] }],
    buffers: [{ uri: basename(resourcePath), byteLength: counts.binaryBytes }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: counts.positionBytes, target: 34_962 },
      { buffer: 0, byteOffset: counts.positionBytes, byteLength: counts.indexBytes, target: 34_963 },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: counts.vertexCount,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [maximum, maximum, maximum],
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5125,
        count: counts.triangleCount * 3,
        type: 'SCALAR',
        min: [0],
        max: [counts.vertexCount - 1],
      },
    ],
  });
  return { counts, primary, resources: [await artifact(resourcePath)] };
};

type ManyClaimsRequest = {
  schemaVersion: number;
  id: string;
  subject: string;
  claimCount: number;
  profileRequirements: {
    configuration: string;
    logicalBudget: string;
    workUnitBudget: string;
    canonicalEnvelope: string;
  };
  metadataObligations: { sourceGenerations: number; sourceIngestions: number; demandReuse: string; status: string };
  claims: Array<{
    claimId: string;
    subject: string;
    query: { kind: string; left?: string; right?: string };
  }>;
};

/**
 * Build stable request-construction data without assigning host matcher capability names.
 * @internal
 * @param count - Requested authored claim count, at most 4096.
 * @returns Stable claim IDs, query recipes, and profile placeholders.
 */
export const createManyClaims = (count: number): ManyClaimsRequest => {
  assertInteger(count, 'many-claims count', 4096);
  return {
    schemaVersion: 1,
    id: `many-claims-${count}`,
    subject: 'many-claims-subject',
    claimCount: count,
    profileRequirements: {
      configuration: 'W2.C-CONFIG-01',
      logicalBudget: 'W2.C-LOGICAL-BUDGET-02',
      workUnitBudget: 'LEAD_PROFILE_VALUE',
      canonicalEnvelope: 'LEAD_OWNED_PENDING_CORE_NORMALIZATION',
    },
    metadataObligations: {
      sourceGenerations: 1,
      sourceIngestions: 1,
      demandReuse: 'permitted',
      status: 'obligation-not-observation',
    },
    claims: Array.from({ length: count }, (_, ordinal) => ({
      claimId: `many-claims-${count}-${String(ordinal).padStart(4, '0')}`,
      subject: 'many-claims-subject',
      query:
        ordinal % 64 === 0
          ? { kind: 'selected-overlap-pair', left: 'claim-subject-a', right: 'claim-subject-b' }
          : { kind: ordinal % 2 === 0 ? 'bounds' : 'surface-area' },
    })),
  };
};

const existingStepDescriptors = async (outputDirectory: string): Promise<BroadFixtureDescriptor[]> => {
  const observationsPath = resolve(outputDirectory, 'step-observations.json');
  try {
    const observations = JSON.parse(await readFile(observationsPath, 'utf8')) as {
      manyOccurrences: Record<string, unknown>;
      voidHeavy: Record<string, unknown>;
    };
    return [
      {
        id: 'many-occurrences-step',
        family: 'many-occurrences',
        format: 'step',
        primary: await artifact(resolve(outputDirectory, 'many-occurrences.step')),
        resources: [await artifact(observationsPath)],
        analyticFacts: observations.manyOccurrences,
        qualification: 'AP242 source/profile input; report numerics remain separately gated',
      },
      {
        id: 'void-heavy-step',
        family: 'boolean-void-heavy',
        format: 'step',
        primary: await artifact(resolve(outputDirectory, 'void-heavy.step')),
        resources: [await artifact(observationsPath)],
        analyticFacts: observations.voidHeavy,
        qualification: 'nominal regular-solid input only; no path, insertion, or section proof',
      },
    ];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

/**
 * Generate the bounded default glTF and claim inputs and their source-bound manifest.
 * @internal
 * @param outputDirectory - Exclusive cache directory, defaulting to this lane's stable cache.
 * @returns Source-bound fixture descriptors for the existing harness.
 */
export const generateBroadFixtures = async (outputDirectory = broadFixtureCache): Promise<BroadFixtureManifest> => {
  await mkdir(outputDirectory, { recursive: true });
  const large = await generateLargeMesh(outputDirectory);
  const occurrenceNodes = Array.from({ length: 4096 }, (_, ordinal) => ({
    name: `part-${String(ordinal).padStart(4, '0')}`,
    translation: [2 * (ordinal % 64), 2 * Math.floor(ordinal / 64), 0] as [number, number, number],
  }));
  const occurrences = await writeBoxGltf({
    outputDirectory,
    id: 'many-occurrences',
    dimensions: [1, 1, 1],
    nodes: occurrenceNodes,
  });
  const booleanNodes = Array.from(
    { length: 64 },
    (_, pair) =>
      [
        { name: `pair-${String(pair).padStart(2, '0')}-a`, translation: [3 * pair, 0, 0] },
        { name: `pair-${String(pair).padStart(2, '0')}-b`, translation: [3 * pair + 0.5, 0, 0] },
      ] as const,
  ).flat() as Array<{ name: string; translation: [number, number, number] }>;
  const booleanPairs = await writeBoxGltf({
    outputDirectory,
    id: 'boolean-pairs',
    dimensions: [1, 1, 1],
    nodes: booleanNodes,
  });
  const claimSubject = await writeBoxGltf({
    outputDirectory,
    id: 'many-claims-subject',
    dimensions: [1, 2, 4],
    nodes: [
      { name: 'claim-subject-a', translation: [0, 0, 0] },
      { name: 'claim-subject-b', translation: [0.5, 0.5, 0.5] },
    ],
  });
  const claims1001 = await writeJson(resolve(outputDirectory, 'many-claims-1001.json'), createManyClaims(1001));
  const claims4096 = await writeJson(resolve(outputDirectory, 'many-claims-4096.json'), createManyClaims(4096));
  const fixtures: BroadFixtureDescriptor[] = [
    {
      id: 'large-mesh-48',
      family: 'large-mesh',
      format: 'gltf',
      primary: large.primary,
      resources: large.resources,
      analyticFacts: {
        meshCount: 1,
        primitiveCount: 1,
        occurrenceCount: 1,
        cubeCount: 110_592,
        vertexCount: 884_736,
        triangleCount: 1_327_104,
        aabb: { min: [0, 0, 0], max: [95, 95, 95] },
        volume: [110_592, 1],
        surfaceArea: [663_552, 1],
        centroid: [
          [95, 2],
          [95, 2],
          [95, 2],
        ],
        meshAnalysisWorkUnits: 4_866_048,
      },
      qualification: 'input only; no engine correctness, timing, or RSS qualification',
    },
    {
      id: 'many-occurrences-gltf',
      family: 'many-occurrences',
      format: 'gltf',
      ...occurrences,
      analyticFacts: {
        occurrenceCount: 4096,
        meshCount: 4096,
        labels: ['part-0000', 'part-4095'],
        aabb: { min: [0, 0, 0], max: [127, 127, 1] },
        volume: [4096, 1],
        surfaceArea: [24_576, 1],
        centroid: [
          [127, 2],
          [127, 2],
          [1, 2],
        ],
      },
      qualification: 'input identity only; no occurrence matcher result certification',
    },
    {
      id: 'boolean-pairs-gltf',
      family: 'boolean-void-heavy',
      format: 'gltf',
      ...booleanPairs,
      analyticFacts: {
        pairCount: 64,
        occurrenceCount: 128,
        overlapVolumePerPair: [1, 2],
        unionVolumePerPair: [3, 2],
        materialUnionVolume: [96, 1],
        aabb: { min: [0, 0, 0], max: [[381, 2], 1, 1] },
      },
      qualification: 'ordinary nominal geometry input; no proof result or timing',
    },
    {
      id: 'many-claims-subject',
      family: 'many-claims',
      format: 'gltf',
      ...claimSubject,
      analyticFacts: {
        componentCount: 2,
        componentDimensions: [1, 2, 4],
        componentVolume: [8, 1],
        componentSurfaceArea: [28, 1],
        aabb: {
          min: [0, 0, 0],
          max: [
            [3, 2],
            [5, 2],
            [9, 2],
          ],
        },
        overlapVolume: [21, 8],
      },
      qualification: 'one frozen subject for request construction; metadata counters are obligations',
    },
    ...(
      [
        [claims1001, 1001],
        [claims4096, 4096],
      ] as const
    ).map(
      ([primary, count]): BroadFixtureDescriptor => ({
        id: `many-claims-${count}`,
        family: 'many-claims',
        format: 'request-construction-json',
        primary,
        resources: claimSubject.resources,
        analyticFacts: { claimCount: count, subject: 'many-claims-subject' },
        qualification: 'request construction only; Lead maps query kinds to approved canonical capabilities',
      }),
    ),
    ...(await existingStepDescriptors(outputDirectory)),
  ];
  const uniquePaths = new Set(
    fixtures.flatMap(({ primary, resources }) => [primary.path, ...resources.map(({ path }) => path)]),
  );
  let totalGeneratedBytes = 0;
  for (const path of uniquePaths) {
    const descriptor = fixtures
      .flatMap(({ primary, resources }) => [primary, ...resources])
      .find((candidate) => candidate.path === path)!;
    totalGeneratedBytes += descriptor.bytes;
  }
  if (totalGeneratedBytes > limits.generatedFixtureDiskBytes) {
    throw new RangeError('Generated fixture set exceeds the frozen 256 MiB disk budget.');
  }
  const manifest: BroadFixtureManifest = {
    schemaVersion: 1,
    source,
    generator: await artifact(fileURLToPath(import.meta.url)),
    fixtures,
    totalGeneratedBytes,
    candidateEngineExecuted: false,
    timingRun: false,
  };
  await writeJson(resolve(outputDirectory, 'manifest.json'), manifest);
  return manifest;
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifest = await generateBroadFixtures(
    process.argv[2] === undefined ? broadFixtureCache : resolve(process.argv[2]),
  );
  process.stdout.write(
    `${JSON.stringify({ output: resolve(process.argv[2] ?? broadFixtureCache, 'manifest.json'), fixtures: manifest.fixtures.length, totalGeneratedBytes: manifest.totalGeneratedBytes })}\n`,
  );
}
