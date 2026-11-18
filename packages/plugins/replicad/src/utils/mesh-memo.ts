/**
 * Replicad mesh memo (catalogue E7, N2): display meshes and bounding boxes per shape occurrence, kept across renders.
 *
 * A mesh is a function of the shape's `TShape`, its placement and orientation, the exact resolved tolerances, whether
 * edges were collected and the authored material (surface coordinates). The memo keys on exactly those, so a second
 * view or a revisit of an unchanged part hands back the triangles it delivered before instead of meshing again. The
 * memo owns an alias of every `TShape` it keys (the partner table's representative): the shape cannot be freed and its
 * address reused for another shape while an entry names it.
 *
 * Only the live tier's path uses it (compute reuse on): with reuse off the kernel builds no memo and meshes exactly as
 * before (I2). Retention: every partner records the render that last used it; a partner unused for `decayRenders`
 * renders is evicted, and the partner count and the bytes the memo keeps are capped. Evicting deletes the partner's
 * representative and its boxes, exactly once.
 *
 * @internal
 */
import type { Bnd_Box, OpenCascadeInstance, TopoDS_Shape } from 'replicad-opencascadejs';
import type { GeometryReplicad } from '#replicad.types.js';
import { createReplicadOccurrenceReader, createReplicadPartnerTable } from '#utils/tessellation-instancing.js';
import type {
  Meshable,
  ReplicadOccurrenceReader,
  ReplicadShapeOccurrenceInfo,
} from '#utils/tessellation-instancing.js';

/** The triangles (and edges, when they were collected) one occurrence delivered. @internal */
export type MemoMesh = {
  readonly faces: GeometryReplicad['faces'];
  readonly edges?: GeometryReplicad['edges'];
};

/** What one partner keeps: meshes of its occurrences, instanced groups led by it, and boxes per placement. */
type Partner = {
  lastUsed: number;
  bytes: number;
  readonly meshes: Map<string, MemoMesh | readonly MemoMesh[]>;
  readonly boxes: Map<string, Bnd_Box>;
};

/** Counters of the memo's current render and its size. @internal */
export type ReplicadMeshMemoStats = {
  hits: number;
  misses: number;
  boxHits: number;
  boxMisses: number;
  evicted: number;
  partners: number;
  bytes: number;
};

/** Bounds of a mesh memo. @internal */
export type ReplicadMeshMemoOptions = {
  readonly openCascade: OpenCascadeInstance;
  /** Renders a partner survives unused. */
  readonly decayRenders?: number;
  /** Partners kept at most; beyond it the least recently used goes first. */
  readonly partnerCap?: number;
  /** Bytes of mesh data kept at most; beyond it the least recently used partner goes first. */
  readonly byteCap?: number;
};

/** One kernel's mesh memo. @internal */
export type ReplicadMeshMemo = {
  /** Occurrence reader whose partner keys stay valid across renders. */
  readonly readOccurrence: ReplicadOccurrenceReader;
  /** The mesh kept for an occurrence under a key, if any. */
  lookup(info: ReplicadShapeOccurrenceInfo, key: string): MemoMesh | undefined;
  /** Keeps an occurrence's mesh under a key. */
  store(info: ReplicadShapeOccurrenceInfo, key: string, mesh: MemoMesh): void;
  /** The meshes kept for an instanced group led by a prototype occurrence, if any. */
  lookupGroup(prototype: ReplicadShapeOccurrenceInfo, key: string): readonly MemoMesh[] | undefined;
  /** Keeps an instanced group's meshes, one per instance in group order. */
  storeGroup(prototype: ReplicadShapeOccurrenceInfo, key: string, meshes: readonly MemoMesh[]): void;
  /**
   * Bounding-box diagonal of the shapes together, from one `BRepBndLib.Add` box per occurrence kept across renders.
   * Boxes merge by minimum, maximum and largest gap, so the result equals adding every shape into one box.
   */
  diagonal(shapes: readonly Meshable[]): number;
  /** Starts a render: the occurrence reads of the last render are dropped and the counters reset. */
  beginRender(): void;
  /** Ends a render: unused partners decay and the caps apply. */
  endRender(): void;
  stats(): ReplicadMeshMemoStats;
  /** Deletes everything the memo owns. */
  dispose(): void;
};

const freshStats = (): ReplicadMeshMemoStats => ({
  hits: 0,
  misses: 0,
  boxHits: 0,
  boxMisses: 0,
  evicted: 0,
  partners: 0,
  bytes: 0,
});

/**
 * Bytes a typed array or plain number array keeps.
 * @param values - The array, if any.
 * @returns Its size in bytes.
 */
const sizeOf = (values: ArrayLike<number> | undefined): number => {
  if (values === undefined) {
    return 0;
  }
  return ArrayBuffer.isView(values) ? values.byteLength : values.length * 8;
};

/**
 * Bytes a kept mesh holds, typed arrays and groups together.
 * @param mesh - The mesh.
 * @returns Its size in bytes.
 */
const meshBytes = (mesh: MemoMesh): number =>
  sizeOf(mesh.faces.vertices) +
  sizeOf(mesh.faces.normals) +
  sizeOf(mesh.faces.triangles) +
  sizeOf(mesh.faces.texCoords) +
  sizeOf(mesh.faces.tangents) +
  mesh.faces.faceGroups.length * 24 +
  sizeOf(mesh.edges?.lines) +
  (mesh.edges?.edgeGroups.length ?? 0) * 24;

/**
 * Placement key of an occurrence: its location matrix, which is all a box depends on.
 * @param info - The occurrence.
 * @returns The key.
 */
const placementKey = (info: ReplicadShapeOccurrenceInfo): string => info.locationMatrix.join(',');

/* oxlint-disable new-cap -- OCCT exposes callable C++ PascalCase methods. */
/**
 * Creates a mesh memo over one OpenCascade instance.
 *
 * @param options - The instance and the retention bounds.
 * @returns The memo.
 * @internal
 */
export function createReplicadMeshMemo({
  openCascade,
  decayRenders = 16,
  partnerCap = 4096,
  byteCap = 256 * 1024 * 1024,
}: ReplicadMeshMemoOptions): ReplicadMeshMemo {
  const table = createReplicadPartnerTable(openCascade, { owned: true });
  const tableReader = createReplicadOccurrenceReader(openCascade, table);
  const partners = new Map<string, Partner>();
  let render = 0;
  let totalBytes = 0;
  let reads = new WeakMap<Meshable, ReplicadShapeOccurrenceInfo>();
  let counters = freshStats();

  const partnerOf = (info: ReplicadShapeOccurrenceInfo): Partner | undefined => {
    if (info.partnerKey.length === 0) {
      return undefined;
    }
    let partner = partners.get(info.partnerKey);
    if (!partner) {
      partner = { lastUsed: render, bytes: 0, meshes: new Map(), boxes: new Map() };
      partners.set(info.partnerKey, partner);
    }
    partner.lastUsed = render;
    return partner;
  };

  const keep = (partner: Partner, key: string, value: MemoMesh | readonly MemoMesh[]): void => {
    const bytesOf = (entry: MemoMesh | readonly MemoMesh[] | undefined): number => {
      if (entry === undefined) {
        return 0;
      }
      return Array.isArray(entry)
        ? (entry as readonly MemoMesh[]).reduce((total, mesh) => total + meshBytes(mesh), 0)
        : meshBytes(entry as MemoMesh);
    };
    const delta = bytesOf(value) - bytesOf(partner.meshes.get(key));
    partner.meshes.set(key, value);
    partner.bytes += delta;
    totalBytes += delta;
  };

  const evict = (key: string): void => {
    const partner = partners.get(key);
    if (!partner) {
      return;
    }
    partners.delete(key);
    totalBytes -= partner.bytes;
    for (const box of partner.boxes.values()) {
      box.delete();
    }
    partner.boxes.clear();
    partner.meshes.clear();
    table.forget(key);
    counters.evicted++;
  };

  const readOccurrence: ReplicadOccurrenceReader = (shape) => {
    const known = reads.get(shape);
    if (known) {
      return known;
    }
    const info = tableReader(shape);
    reads.set(shape, info);
    partnerOf(info);
    return info;
  };

  const boxOf = (shape: Meshable): Bnd_Box | undefined => {
    const handle = shape.wrapped as TopoDS_Shape;
    const info = readOccurrence(shape);
    const partner = partnerOf(info);
    if (!partner) {
      return undefined;
    }
    const key = placementKey(info);
    const kept = partner.boxes.get(key);
    if (kept) {
      counters.boxHits++;
      return kept;
    }
    counters.boxMisses++;
    const box = new openCascade.Bnd_Box();
    try {
      openCascade.BRepBndLib.Add(handle, box, false);
    } catch (error) {
      box.delete();
      throw error;
    }
    partner.boxes.set(key, box);
    return box;
  };

  return {
    readOccurrence,
    lookup(info, key) {
      const mesh = partnerOf(info)?.meshes.get(key) as MemoMesh | undefined;
      if (mesh) {
        counters.hits++;
      } else {
        counters.misses++;
      }
      return mesh;
    },
    store(info, key, mesh) {
      const partner = partnerOf(info);
      if (partner) {
        keep(partner, key, mesh);
      }
    },
    lookupGroup(prototype, key) {
      const meshes = partnerOf(prototype)?.meshes.get(key) as readonly MemoMesh[] | undefined;
      if (meshes) {
        counters.hits += meshes.length;
      } else {
        counters.misses++;
      }
      return meshes;
    },
    storeGroup(prototype, key, meshes) {
      const partner = partnerOf(prototype);
      if (partner) {
        keep(partner, key, meshes);
      }
    },
    diagonal(shapes) {
      const total = new openCascade.Bnd_Box();
      try {
        for (const shape of shapes) {
          const box = boxOf(shape);
          if (box) {
            total.Add(box);
          }
        }
        if (total.IsVoid()) {
          return Number.NaN;
        }
        const low = total.CornerMin();
        const high = total.CornerMax();
        const diagonal = Math.hypot(high.X() - low.X(), high.Y() - low.Y(), high.Z() - low.Z());
        low.delete();
        high.delete();
        return diagonal;
      } finally {
        total.delete();
      }
    },
    beginRender() {
      render++;
      reads = new WeakMap();
      counters = freshStats();
    },
    endRender() {
      for (const [key, partner] of partners) {
        if (render - partner.lastUsed >= decayRenders) {
          evict(key);
        }
      }
      if (partners.size > partnerCap || totalBytes > byteCap) {
        // Map order is insertion order, not use order: sort by last use, oldest first.
        const byAge = [...partners].sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
        for (const [key, partner] of byAge) {
          if ((partners.size <= partnerCap && totalBytes <= byteCap) || partner.lastUsed === render) {
            break;
          }
          evict(key);
        }
      }
    },
    stats() {
      return { ...counters, partners: partners.size, bytes: totalBytes };
    },
    dispose() {
      for (const key of partners.keys()) {
        evict(key);
      }
      table.dispose();
      reads = new WeakMap();
    },
  };
}
/* oxlint-enable new-cap */
