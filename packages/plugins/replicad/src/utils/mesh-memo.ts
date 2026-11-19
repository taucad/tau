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
 * Exports (N14) read the memo but keep what they mesh apart, in a one-generation export slot: it holds only the
 * latest export's new meshes, the next export replaces it, and the end of the next render drops it. An export does not
 * advance or refresh the display decay clock, so an export at a tolerance no view uses never grows the display memo.
 *
 * @internal
 */
import type { Bnd_Box, OpenCascadeInstance, TopoDS_Shape } from 'replicad-opencascadejs';
import type { GeometryReplicad } from '#replicad.types.js';
import { createReplicadPackFacts } from '#utils/replicad-to-gltf.js';
import type { ReplicadPackFacts } from '#utils/replicad-to-gltf.js';
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
  /** Parts delivered from a kept mesh; an instanced group counts each instance. */
  hits: number;
  /** Parts meshed because no usable mesh was kept; an instanced group counts each instance. */
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
  /** Pack facts (glTF) of the kept meshes (N6), keyed by their `faces`: a fact is dropped with its mesh. */
  readonly packFacts: ReplicadPackFacts;
  /**
   * The mesh kept for an occurrence under a key, if one is kept and `usable` accepts it. Counts `parts` (default 1)
   * hits for a mesh it returns, and `parts` misses otherwise: a group's prototype counts its instances.
   */
  lookup(
    info: ReplicadShapeOccurrenceInfo,
    key: string,
    options?: Readonly<{ usable?: (mesh: MemoMesh) => boolean; parts?: number }>,
  ): MemoMesh | undefined;
  /** Keeps an occurrence's mesh under a key. */
  store(info: ReplicadShapeOccurrenceInfo, key: string, mesh: MemoMesh): void;
  /**
   * The meshes kept for an instanced group of `instances` led by a prototype occurrence, if every one is kept and
   * `usable` accepts them. Counts `instances` hits for meshes it returns; on a miss the prototype lookup that follows
   * counts the group's parts.
   */
  lookupGroup(
    prototype: ReplicadShapeOccurrenceInfo,
    key: string,
    group: Readonly<{ instances: number; usable?: (meshes: readonly MemoMesh[]) => boolean }>,
  ): readonly MemoMesh[] | undefined;
  /** Keeps an instanced group's meshes, one per instance in group order. */
  storeGroup(prototype: ReplicadShapeOccurrenceInfo, key: string, meshes: readonly MemoMesh[]): void;
  /**
   * Bounding-box diagonal of the shapes together, from one `BRepBndLib.Add` box per occurrence kept across renders.
   * Boxes merge by minimum, maximum and largest gap, so the result equals adding every shape into one box.
   */
  diagonal(shapes: readonly Meshable[]): number;
  /** Starts a render: the occurrence reads of the last render are dropped and the counters reset. */
  beginRender(): void;
  /** Ends a render: unused partners decay, the caps apply and the export slot is dropped. */
  endRender(): void;
  /** Starts an export: lookups also read the export slot, and stores go to a new one. */
  beginExport(): void;
  /** Ends an export: its new meshes replace the export slot. */
  endExport(): void;
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
  /** Meshes of the latest export, by partner and key; `pending` collects the running export's. */
  type ExportSlot = Map<string, { readonly partnerKey: string; readonly value: MemoMesh | readonly MemoMesh[] }>;
  let exportSlot: ExportSlot = new Map();
  let pending: ExportSlot | undefined;
  const slotKey = (partnerKey: string, key: string): string => `${partnerKey}\n${key}`;

  const partnerOf = (info: ReplicadShapeOccurrenceInfo): Partner | undefined => {
    if (info.partnerKey.length === 0) {
      return undefined;
    }
    let partner = partners.get(info.partnerKey);
    if (!partner) {
      partner = { lastUsed: render, bytes: 0, meshes: new Map(), boxes: new Map() };
      partners.set(info.partnerKey, partner);
    }
    // An export neither advances nor refreshes the display decay clock.
    if (pending === undefined) {
      partner.lastUsed = render;
    }
    return partner;
  };

  /**
   * A kept mesh or group that `usable` accepts: the display memo's first, then the running export's slot, then the
   * previous export's. An unusable display mesh (no edges when edges are requested) does not hide a usable slot one.
   * @param info - The occurrence.
   * @param key - The memo key.
   * @param usable - Whether a candidate can serve the caller.
   * @returns The first usable candidate, if any.
   */
  const kept = (
    info: ReplicadShapeOccurrenceInfo,
    key: string,
    usable: (value: MemoMesh | readonly MemoMesh[]) => boolean,
  ): MemoMesh | readonly MemoMesh[] | undefined => {
    const partner = partnerOf(info);
    if (!partner) {
      return undefined;
    }
    const shown = partner.meshes.get(key);
    if (shown !== undefined && usable(shown)) {
      return shown;
    }
    const id = slotKey(info.partnerKey, key);
    const running = pending?.get(id);
    if (running !== undefined && usable(running.value)) {
      return running.value;
    }
    const previous = exportSlot.get(id);
    if (previous === undefined || !usable(previous.value)) {
      return undefined;
    }
    // A running export carries what it reads from the slot into its own, so its successor keeps it.
    pending?.set(id, previous);
    return previous.value;
  };

  /** Keeps a mesh or group: in the display memo, or during an export in the export's own slot. */
  const keepFor = (info: ReplicadShapeOccurrenceInfo, key: string, value: MemoMesh | readonly MemoMesh[]): void => {
    const partner = partnerOf(info);
    if (!partner) {
      return;
    }
    if (pending) {
      pending.set(slotKey(info.partnerKey, key), { partnerKey: info.partnerKey, value });
    } else {
      keep(partner, key, value);
    }
  };

  /**
   * Drop an export slot: a partner it alone made (no display mesh, no box) and that the current slot no longer names
   * is evicted, so the slot's shapes are not kept alive.
   */
  const releaseSlot = (slot: ExportSlot): void => {
    const named = new Set([...exportSlot.values()].map(({ partnerKey }) => partnerKey));
    for (const { partnerKey } of slot.values()) {
      const partner = partners.get(partnerKey);
      if (partner?.meshes.size === 0 && partner.boxes.size === 0 && !named.has(partnerKey)) {
        evict(partnerKey);
      }
    }
  };

  /** Bytes the export slot keeps. */
  const slotBytes = (): number => {
    let total = 0;
    for (const { value } of exportSlot.values()) {
      total += Array.isArray(value)
        ? (value as readonly MemoMesh[]).reduce((sum, mesh) => sum + meshBytes(mesh), 0)
        : meshBytes(value as MemoMesh);
    }
    return total;
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
    packFacts: createReplicadPackFacts(),
    lookup(info, key, { usable, parts = 1 } = {}) {
      const mesh = kept(info, key, (value) => usable === undefined || usable(value as MemoMesh)) as
        | MemoMesh
        | undefined;
      if (mesh) {
        counters.hits += parts;
        return mesh;
      }
      counters.misses += parts;
      return undefined;
    },
    store(info, key, mesh) {
      keepFor(info, key, mesh);
    },
    lookupGroup(prototype, key, { instances, usable }) {
      const meshes = kept(prototype, key, (value) => {
        const group = value as readonly MemoMesh[];
        return group.length === instances && (usable === undefined || usable(group));
      }) as readonly MemoMesh[] | undefined;
      if (meshes) {
        counters.hits += instances;
        return meshes;
      }
      return undefined;
    },
    storeGroup(prototype, key, meshes) {
      keepFor(prototype, key, meshes);
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
    beginExport() {
      reads = new WeakMap();
      pending = new Map();
    },
    endExport() {
      const previous = exportSlot;
      exportSlot = pending ?? new Map();
      pending = undefined;
      releaseSlot(previous);
    },
    beginRender() {
      render++;
      reads = new WeakMap();
      counters = freshStats();
    },
    endRender() {
      const passed = exportSlot;
      exportSlot = new Map();
      releaseSlot(passed);
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
      return { ...counters, partners: partners.size, bytes: totalBytes + slotBytes() };
    },
    dispose() {
      exportSlot.clear();
      pending = undefined;
      for (const key of partners.keys()) {
        evict(key);
      }
      table.dispose();
      reads = new WeakMap();
    },
  };
}
/* oxlint-enable new-cap */
