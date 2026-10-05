import type { AuthoredAssembly } from '@taucad/runtime/types';

const encoder = new TextEncoder();
const workloads = {
  'scale-123': { definitions: 123, occurrences: 123, columns: 11 },
  'scale-10k': { definitions: 100, occurrences: 10_000, columns: 100 },
  'scale-100k': { definitions: 1000, occurrences: 100_000, columns: 100 },
  // Separate finite approximation calibration, never a substitute for the complete box corpus.
  'scale-detail-calibration': { definitions: 2, occurrences: 2, columns: 2 },
  'scale-detail-edge-calibration': { definitions: 1, occurrences: 1, columns: 1 },
  'scale-detail-hybrid-calibration': { definitions: 1, occurrences: 1, columns: 1 },
} as const;

type ScaleFixtureName = keyof typeof workloads;

/** Finite debug corpus selection; arbitrary counts cannot expand this seed. */
export const isScaleFixtureName = (name: string | undefined): name is ScaleFixtureName =>
  name !== undefined && Object.hasOwn(workloads, name);

/** Real source recipes only: the existing host publication owner produces every record and GLB. */
export const createScaleFixture = (
  name: ScaleFixtureName,
): {
  entryPath: string;
  files: Record<string, { content: Uint8Array<ArrayBuffer> }>;
  denominator: {
    definitions: number;
    occurrences: number;
    sourceBytes: number;
    authoredBytes: number;
    expectedDefinitionTriangles: number | undefined;
    expectedExpandedTriangles: number | undefined;
  };
} => {
  const workload = workloads[name];
  const parts: Record<string, { source: { path: string } }> = {};
  const occurrences: Array<AuthoredAssembly['occurrences'][number]> = [];
  const files: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
  let sourceBytes = 0;
  for (let index = 0; index < workload.definitions; index += 1) {
    const part = `p${String(index).padStart(4, '0')}`;
    const path = `scale/parts/${part}.js`;
    const size = [20 + (index % 10), 16 + (Math.floor(index / 10) % 10), 12 + (Math.floor(index / 100) % 10)];
    const denseRecipe =
      index === 0
        ? 'primitives.sphere({radius:100,segments:128})'
        : 'primitives.torus({innerRadius:30,outerRadius:70,innerSegments:64,outerSegments:128})';
    const recipe =
      name === 'scale-detail-hybrid-calibration'
        ? '[primitives.sphere({radius:100,segments:128}), transforms.translate([130,0,0], primitives.cuboid({size:[20,16,12],center:[0,0,0]}))]'
        : name === 'scale-detail-edge-calibration'
          ? 'primitives.cylinder({radius:100,height:120,segments:128})'
          : name === 'scale-detail-calibration'
            ? denseRecipe
            : `primitives.cuboid({size:[${size.join(',')}],center:[0,0,0]})`;
    const imports = name === 'scale-detail-hybrid-calibration' ? 'primitives, transforms' : 'primitives';
    const content = encoder.encode(
      `import { ${imports} } from '@jscad/modeling';\nexport default function main() { return ${recipe}; }\n`,
    );
    sourceBytes += content.byteLength;
    files[path] = { content };
    parts[part] = { source: { path } };
  }
  for (let index = 0; index < workload.occurrences; index += 1) {
    const zone = name === 'scale-100k' ? Math.floor(index / 10_000) : 0;
    const local = name === 'scale-100k' ? index % 10_000 : index;
    const definition = name === 'scale-100k' ? zone * 100 + (local % 100) : index % workload.definitions;
    // Source recipes use millimeters; authored occurrence matrices use world meters.
    const x =
      name === 'scale-detail-calibration' ? index * 0.3 : (zone * 6000 + (local % workload.columns) * 40) / 1000;
    const y = (Math.floor(local / workload.columns) * 40) / 1000;
    occurrences.push({
      id: `o${String(index).padStart(6, '0')}`,
      part: `p${String(definition).padStart(4, '0')}`,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, 0, 1],
    });
  }
  const authored: AuthoredAssembly = { schemaVersion: 1, parts, occurrences };
  const entryPath = 'scale/assembly.json';
  const content = encoder.encode(JSON.stringify(authored));
  files[entryPath] = { content };
  return {
    entryPath,
    files,
    denominator: {
      definitions: workload.definitions,
      occurrences: workload.occurrences,
      sourceBytes,
      authoredBytes: content.byteLength,
      // Expected cuboid surfaces; actual GLB accessors must establish this before corpus qualification.
      // Dense source counts must come from actual emitted GLB and mandatory authored edges.
      expectedDefinitionTriangles:
        name === 'scale-detail-calibration' ||
        name === 'scale-detail-edge-calibration' ||
        name === 'scale-detail-hybrid-calibration'
          ? undefined
          : workload.definitions * 12,
      expectedExpandedTriangles:
        name === 'scale-detail-calibration' ||
        name === 'scale-detail-edge-calibration' ||
        name === 'scale-detail-hybrid-calibration'
          ? undefined
          : workload.occurrences * 12,
    },
  };
};
