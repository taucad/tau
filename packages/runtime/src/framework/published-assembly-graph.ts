import { admitPublishedPart } from '#framework/published-part-store.js';
import { assertRootedPath } from '@taucad/utils/path';
import type { SpatialMatrix } from '@taucad/spatial';
import { authoredPartsAssemblySchema } from '#types/runtime-assembly.schemas.js';
import type {
  AuthoredAssembly,
  AuthoredAssemblySource,
  AuthoredPartRecipe,
  PreparedPublishedPart,
  PublishedOccurrenceIdentity,
  PublishedPartOccurrence,
  PublishedPartRecord,
  PublishedPartReference,
} from '#types/runtime-assembly.types.js';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';

const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const encoder = new TextEncoder();

/** Injective ID from exact UTF-8 JSON tuple bytes; strings are not normalized. @internal */
export const occurrenceTupleId = (
  tag: 'occurrence' | 'component',
  ancestry: readonly string[],
  sourceLocalId?: string,
): string => {
  const tuple = sourceLocalId === undefined ? [tag, ...ancestry] : [tag, ...ancestry, sourceLocalId];
  return `occ:${Array.from(encoder.encode(JSON.stringify(tuple)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

/** Column-major child-to-parent matrix composition, retaining world metres. @internal */
export const composeOccurrenceTransform = (parent: readonly number[], local: readonly number[]): number[] => {
  const result = Array.from({ length: 16 }, () => 0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let value = 0;
      for (let shared = 0; shared < 4; shared++) {
        value += parent[shared * 4 + row]! * local[column * 4 + shared]!;
      }
      if (!Number.isFinite(value)) {
        throw new TypeError('Occurrence world transform is not finite.');
      }
      result[column * 4 + row] = value;
    }
  }
  return result;
};

/** Normalize a finite proper-rigid placement acting on native as-built geometry; intrinsic source transforms are excluded. @internal */
export const normalizeExactComponentPlacement = (matrix: readonly number[]): SpatialMatrix => {
  const nearly = (value: number, expected: number): boolean => Math.abs(value - expected) <= 1e-7;
  if (
    matrix.length !== 16 ||
    matrix.some((value) => !Number.isFinite(value)) ||
    matrix[3] !== 0 ||
    matrix[7] !== 0 ||
    matrix[11] !== 0 ||
    matrix[15] !== 1
  ) {
    throw new TypeError('Exact component placement must be a finite affine matrix.');
  }
  const x = [matrix[0]!, matrix[1]!, matrix[2]!] as const;
  const y = [matrix[4]!, matrix[5]!, matrix[6]!] as const;
  const z = [matrix[8]!, matrix[9]!, matrix[10]!] as const;
  const dot = (left: readonly number[], right: readonly number[]): number =>
    left[0]! * right[0]! + left[1]! * right[1]! + left[2]! * right[2]!;
  const cross = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  if (
    ![x, y, z].every((axis) => nearly(dot(axis, axis), 1)) ||
    !nearly(dot(x, y), 0) ||
    !nearly(dot(x, z), 0) ||
    !nearly(dot(y, z), 0) ||
    !nearly(dot(cross, z), 1)
  ) {
    throw new TypeError('Exact component placement must be rigid and orientation-preserving.');
  }
  const zero = (value: number): number => (Object.is(value, -0) ? 0 : value);
  return [
    zero(matrix[0]!),
    zero(matrix[1]!),
    zero(matrix[2]!),
    zero(matrix[3]),
    zero(matrix[4]!),
    zero(matrix[5]!),
    zero(matrix[6]!),
    zero(matrix[7]),
    zero(matrix[8]!),
    zero(matrix[9]!),
    zero(matrix[10]!),
    zero(matrix[11]),
    zero(matrix[12]!),
    zero(matrix[13]!),
    zero(matrix[14]!),
    zero(matrix[15]),
  ];
};

/** GLB node matrices must be affine local TRS; composed world shear remains valid. @internal */
export const assertLocalTrsTransform = (matrix: readonly number[]): void => {
  if (
    matrix.length !== 16 ||
    matrix.some((value) => !Number.isFinite(value)) ||
    matrix[3] !== 0 ||
    matrix[7] !== 0 ||
    matrix[11] !== 0 ||
    matrix[15] !== 1
  ) {
    throw new TypeError('Occurrence local transform must be a finite affine TRS matrix.');
  }
  const columns = [
    [matrix[0]!, matrix[1]!, matrix[2]!],
    [matrix[4]!, matrix[5]!, matrix[6]!],
    [matrix[8]!, matrix[9]!, matrix[10]!],
  ];
  const normalized = columns.map((column) => {
    const largest = Math.max(...column.map((value) => Math.abs(value)));
    if (largest === 0) {
      return [0, 0, 0];
    }
    const scaled = column.map((value) => value / largest);
    const magnitude = Math.hypot(...scaled);
    return scaled.map((value) => value / magnitude);
  });
  for (let first = 0; first < 3; first++) {
    for (let second = first + 1; second < 3; second++) {
      const left = normalized[first]!;
      const right = normalized[second]!;
      const dot = left[0]! * right[0]! + left[1]! * right[1]! + left[2]! * right[2]!;
      if (Math.abs(dot) > 1e-10) {
        throw new TypeError('Occurrence local transform contains shear and cannot be projected losslessly.');
      }
    }
  }
};

/** Transform all eight AABB corners; a placed world bound cannot use a local box unchanged. @internal */
export const placedOccurrenceBounds = (
  bounds: Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>,
  world: readonly number[],
): Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }> => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const w = world[3]! * x + world[7]! * y + world[11]! * z + world[15]!;
        if (!Number.isFinite(w) || w === 0) {
          throw new Error('Occurrence bounds have an invalid homogeneous transform.');
        }
        for (let axis = 0; axis < 3; axis++) {
          const value = (world[axis]! * x + world[4 + axis]! * y + world[8 + axis]! * z + world[12 + axis]!) / w;
          if (!Number.isFinite(value)) {
            throw new TypeError('Occurrence bounds are not finite.');
          }
          min[axis] = Math.min(min[axis]!, value);
          max[axis] = Math.max(max[axis]!, value);
        }
      }
    }
  }
  return { min, max };
};

/** Admit pinned records and resolve their occurrence graph without running any producer. @internal */
export const resolvePinnedAssembly = async (
  filesystem: KernelFileSystem,
  authored: AuthoredAssembly,
): Promise<
  Readonly<{
    parts: Readonly<Record<string, PublishedPartReference>>;
    records: Readonly<Record<string, PublishedPartRecord>>;
    occurrences: readonly PublishedPartOccurrence[];
    identities: Readonly<Record<string, PublishedOccurrenceIdentity>>;
  }>
> => {
  const parsed = authoredPartsAssemblySchema.parse(authored);
  const parts = new Map<string, PublishedPartReference>();
  const records = new Map<string, PublishedPartRecord>();
  for (const [name, recipe] of Object.entries(parsed.parts)) {
    if (!recipe.publishedPart) {
      throw new Error(`Authored source part ${name} requires a producer before pinned-only admission.`);
    }
    const reference = recipe.publishedPart;
    parts.set(name, reference);
    // Admission stays ordered so the first failed authored part is reported.
    // oxlint-disable-next-line no-await-in-loop -- Preserve authored failure order during pinned admission.
    records.set(name, await admitPublishedPart(filesystem, reference));
  }
  const identities = new Map<string, PublishedOccurrenceIdentity>();
  const visit = (
    nodes: AuthoredAssembly['occurrences'],
    context: Readonly<{
      ancestry: readonly string[];
      parent: string | undefined;
      world: readonly number[];
    }>,
  ): PublishedPartOccurrence[] => {
    const siblings = new Set<string>();
    return nodes.map((node) => {
      if (siblings.has(node.id)) {
        throw new Error(`Duplicate sibling occurrence ID: ${node.id}`);
      }
      siblings.add(node.id);
      const path = [...context.ancestry, node.id];
      const id = occurrenceTupleId('occurrence', path);
      assertLocalTrsTransform(node.transform);
      const worldTransform = composeOccurrenceTransform(context.world, node.transform);
      if (node.children) {
        identities.set(id, { id, path, parent: context.parent, part: undefined, variant: undefined, worldTransform });
        return {
          id: node.id,
          transform: node.transform,
          children: visit(node.children, {
            ancestry: path,
            parent: id,
            world: worldTransform,
          }),
        };
      }
      const record = records.get(node.part);
      if (!record) {
        throw new Error(`Occurrence references unknown part: ${node.part}`);
      }
      const variant = node.variant ?? 'default';
      if (!Object.hasOwn(record.variants, variant)) {
        throw new Error(`Occurrence references unknown variant: ${node.part}/${variant}`);
      }
      identities.set(id, { id, path, parent: context.parent, part: node.part, variant, worldTransform });
      return { id: node.id, transform: node.transform, part: node.part, variant };
    });
  };
  const occurrences = visit(parsed.occurrences, { ancestry: [], parent: undefined, world: identityMatrix });
  return {
    parts: Object.fromEntries(parts),
    records: Object.fromEntries(records),
    occurrences,
    identities: Object.fromEntries(identities),
  };
};

/** Read a versioned authored graph only through the caller's rooted project authority. @internal */
export const readAuthoredAssembly = async (
  filesystem: KernelFileSystem,
  authoredPath: string,
  onRead?: (authored: AuthoredAssembly, bytes: Uint8Array<ArrayBuffer>) => void,
): Promise<AuthoredAssembly> => {
  const path = assertRootedPath(authoredPath);
  if (path.length === 0) {
    throw new TypeError('Authored assembly path must name a file.');
  }
  const bytes = await filesystem.readFile(path);
  const authored = authoredPartsAssemblySchema.parse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
  onRead?.(authored, bytes);
  return authored;
};

/** Resolve source recipes through a host producer and re-admit its pins; pinned arms skip production. @internal */
export const resolveAuthoredAssembly = async (
  filesystem: KernelFileSystem,
  authored: AuthoredAssembly,
  options: {
    produce: (sources: Readonly<Record<string, AuthoredAssemblySource>>) => Promise<PreparedPublishedPart>;
    reusePart?: (name: string, recipe: AuthoredPartRecipe) => Promise<PublishedPartReference | undefined>;
  },
): ReturnType<typeof resolvePinnedAssembly> => {
  const { produce, reusePart } = options;
  const parsed = authoredPartsAssemblySchema.parse(authored);
  const pinned = new Map<string, { publishedPart: PublishedPartReference }>();
  for (const [name, recipe] of Object.entries(parsed.parts)) {
    if (recipe.publishedPart) {
      pinned.set(name, { publishedPart: recipe.publishedPart });
      continue;
    }
    // A live host may reuse a prior admitted result after proving the same recipe and source closure.
    // oxlint-disable-next-line no-await-in-loop -- Preserve authored order and one producer lane.
    const reusable = await reusePart?.(name, recipe);
    if (reusable) {
      pinned.set(name, { publishedPart: reusable });
      continue;
    }
    if (recipe.variants && Object.hasOwn(recipe.variants, 'default')) {
      throw new Error(`Part ${name} declares the default variant twice.`);
    }
    const sourceMap = new Map<string, AuthoredAssemblySource>([['default', recipe.source]]);
    for (const [variant, value] of Object.entries(recipe.variants ?? {})) {
      sourceMap.set(variant, value.source);
    }
    const sources = Object.fromEntries(sourceMap);
    // The producer owns one kernel lane and evaluates recipes in authored order.
    // oxlint-disable-next-line no-await-in-loop -- Source recipes stage shared kernel state in authored order.
    const prepared = await produce(sources);
    // oxlint-disable-next-line no-await-in-loop -- Verify each producer receipt before staging the next recipe.
    const record = await admitPublishedPart(filesystem, prepared.reference);
    for (const [variant, source] of Object.entries(sources)) {
      const entry = source.path ?? source.entry ?? Object.keys(source.files)[0];
      if (!Object.hasOwn(record.variants, variant) || record.variants[variant]?.source.entry !== entry) {
        throw new Error(`Producer receipt does not match authored source: ${name}/${variant}`);
      }
    }
    if (Object.keys(record.variants).length !== Object.keys(sources).length) {
      throw new Error(`Producer receipt has unexpected variants: ${name}`);
    }
    pinned.set(name, { publishedPart: prepared.reference });
  }
  return resolvePinnedAssembly(filesystem, { ...parsed, parts: Object.fromEntries(pinned) });
};
