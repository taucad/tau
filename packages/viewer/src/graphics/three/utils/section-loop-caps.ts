import * as THREE from 'three';
import type { SectionHalfSpace } from '#graphics/section-cuts.js';
import { getSectionLoopClient } from '#graphics/three/utils/section-loop-client.js';
import type { SectionLoopClient, SectionLoopClientSlice } from '#graphics/three/utils/section-loop-client.js';
import type { SectionLoopParticipantInput, SectionLoopSourceInput } from '#graphics/three/utils/section-loop-slicer.js';
import {
  getSectionSourceWorldMatrix,
  isSectionMaterialVisible,
  isSectionObjectVisible,
} from '#graphics/three/utils/section-surface-topology.js';
import type { SectionSurfaceSource } from '#graphics/three/utils/section-surface-topology.js';

/** A cut face a per-loop source is sliced through: its cap slot and its plane, in render space. */
export type SectionLoopCapFace = Readonly<{ slot: number; plane: SectionHalfSpace }>;

/** One face's per-loop cap of one source, in the source frame. */
export type SectionLoopCapGeometry = Readonly<{
  /** Fans over the closed loops, counted even-odd into the stencil. */
  fill: THREE.BufferGeometry;
  /** The triangles whose cut lies on an open chain, outlined in the open-chain colour. */
  open: THREE.BufferGeometry;
  closedLoopCount: number;
  openChainCount: number;
}>;

/** A per-loop source as the caps draw it: the latest landed cap of each face, and where the source frame sits. */
export type SectionLoopCapSource = Readonly<{
  /** From the source frame to render space, now. */
  matrix: THREE.Matrix4;
  bySlot: ReadonlyMap<number, SectionLoopCapGeometry>;
}>;

/** What the per-loop caps of one source hold, for diagnostics. */
export type SectionLoopCapDiagnostics = Readonly<{
  sourceKey: string;
  closedLoopCount: number;
  openChainCount: number;
  /** Faces whose landed cap is for an earlier plane, or that have none yet. */
  pendingFaceCount: number;
  lastSlice:
    | Readonly<{
        candidateCount: number;
        broadphaseMilliseconds: number;
        sliceMilliseconds: number;
        roundTripMilliseconds: number;
        prepareMilliseconds: number | undefined;
      }>
    | undefined;
  failure: string | undefined;
}>;

type Landed = Readonly<{ key: string; geometry: SectionLoopCapGeometry }>;

type SlotState = {
  landed: Landed | undefined;
  inFlightKey: string | undefined;
  wanted: Readonly<{ key: string; plane: readonly [number, number, number, number] }> | undefined;
};

type SourceState = {
  signature: string;
  source: SectionSurfaceSource;
  slots: Map<number, SlotState>;
  lastSlice: SectionLoopCapDiagnostics['lastSlice'];
  failure: string | undefined;
};

export type SectionLoopCaps = Readonly<{
  /**
   * The per-loop caps of `source` on `faces`: what has landed for each face, the latest plane's or an earlier one's,
   * while a slice for the current plane runs off the main thread. `onLanded` is called when one lands.
   */
  resolve: (source: SectionSurfaceSource, faces: readonly SectionLoopCapFace[]) => SectionLoopCapSource;
  /** Lets go of every source not in `keys`. */
  retain: (keys: ReadonlySet<string>) => void;
  diagnostics: () => SectionLoopCapDiagnostics[];
  dispose: () => void;
}>;

/** The triangles of a participant that draw: inside its draw range and in a visible material's group. */
const shownTriangleIndex = (mesh: THREE.Mesh): Uint32Array => {
  const { geometry } = mesh;
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  const indexCount = index?.count ?? position.count;
  const start = Math.max(0, geometry.drawRange.start);
  const end = Math.min(
    indexCount,
    geometry.drawRange.count === Number.POSITIVE_INFINITY ? indexCount : start + geometry.drawRange.count,
  );
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const isShown = (offset: number): boolean => {
    if (materials.length === 1) {
      return isSectionMaterialVisible(materials[0]!);
    }
    const group = geometry.groups.find(
      (candidate) => offset >= candidate.start && offset < candidate.start + candidate.count,
    );
    const material = materials[group?.materialIndex ?? 0] ?? materials[0];
    return material ? isSectionMaterialVisible(material) : false;
  };
  const isWhole =
    start === 0 && end === indexCount && materials.every((material) => isSectionMaterialVisible(material));
  // Every triangle shows: one copy of the index, without a read per entry.
  if (isWhole && index && !(index instanceof THREE.InterleavedBufferAttribute) && !index.normalized) {
    return new Uint32Array(index.array);
  }
  const shown = new Uint32Array(Math.max(0, end - start) - (Math.max(0, end - start) % 3));
  let written = 0;
  for (let offset = start; offset + 2 < end; offset += 3) {
    if (!isShown(offset)) {
      continue;
    }
    shown[written++] = index ? index.getX(offset) : offset;
    shown[written++] = index ? index.getX(offset + 1) : offset + 1;
    shown[written++] = index ? index.getX(offset + 2) : offset + 2;
  }
  return written === shown.length ? shown : shown.slice(0, written);
};

const readPositions = (mesh: THREE.Mesh): Float32Array => {
  const position = mesh.geometry.getAttribute('position');
  if (
    !(position instanceof THREE.InterleavedBufferAttribute) &&
    position.array instanceof Float32Array &&
    position.itemSize === 3 &&
    !position.normalized
  ) {
    return position.array.slice(0, position.count * 3);
  }
  const positions = new Float32Array(position.count * 3);
  for (let vertex = 0; vertex < position.count; vertex++) {
    positions[vertex * 3] = position.getX(vertex);
    positions[vertex * 3 + 1] = position.getY(vertex);
    positions[vertex * 3 + 2] = position.getZ(vertex);
  }
  return positions;
};

/** The participants a per-loop cap slices: those shown in the hierarchy, each with a material that draws. */
const shownParticipants = (source: SectionSurfaceSource): SectionSurfaceSource['participants'] =>
  source.participants.filter(({ mesh }) => isSectionObjectVisible(mesh));

/** Changes with the source's geometry and with which of its triangles are shown. */
const sourceSignature = (source: SectionSurfaceSource): string => {
  let signature = source.revision;
  for (const [order, { mesh }] of source.participants.entries()) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    signature += `|${order}:${isSectionObjectVisible(mesh) ? 1 : 0}:`;
    for (const material of materials) {
      signature += isSectionMaterialVisible(material) ? '1' : '0';
    }
  }
  return signature;
};

const readSourceInput = (source: SectionSurfaceSource, signature: string): SectionLoopSourceInput => ({
  sourceKey: source.key,
  signature,
  participants: shownParticipants(source).map(
    (participant): SectionLoopParticipantInput => ({
      positions: readPositions(participant.mesh),
      index: shownTriangleIndex(participant.mesh),
      localToSource: participant.localToSource.toArray(),
    }),
  ),
});

const toGeometry = (slice: SectionLoopClientSlice): SectionLoopCapGeometry => {
  const fill = new THREE.BufferGeometry();
  fill.setAttribute('position', new THREE.BufferAttribute(slice.slice.fill, 3));
  const open = new THREE.BufferGeometry();
  open.setAttribute('position', new THREE.BufferAttribute(slice.slice.openTriangles, 3));
  return {
    fill,
    open,
    closedLoopCount: slice.slice.closedLoops.length,
    openChainCount: slice.slice.openChains.length,
  };
};

const disposeLanded = (landed: Landed | undefined): void => {
  landed?.geometry.fill.dispose();
  landed?.geometry.open.dispose();
};

const worldPlane = new THREE.Plane();
const sourceToWorld = new THREE.Matrix4();
const worldToSource = new THREE.Matrix4();

/**
 * Per-loop caps for the sources the stencil cannot cap exactly: an open or non-manifold surface, or one shown only in
 * part. Each face is sliced off the main thread when its plane changes, and the latest landed slice stays drawn until
 * the next one lands, so a dragged cut never waits on a slice.
 * @internal
 */
export const createSectionLoopCaps = (options: {
  onLanded: () => void;
  client?: SectionLoopClient;
}): SectionLoopCaps => {
  const client = options.client ?? getSectionLoopClient();
  const sources = new Map<string, SourceState>();
  let isDisposed = false;

  const issue = (state: SourceState, slot: number, slotState: SlotState): void => {
    const { wanted } = slotState;
    if (!wanted || slotState.inFlightKey !== undefined || slotState.landed?.key === wanted.key) {
      return;
    }
    slotState.inFlightKey = wanted.key;
    const startedAt = performance.now();
    const { source, signature } = state;
    // async-iife: bootstrap -- A frame cannot await a slice running in the worker; `onLanded` asks for the frame it lands in.
    void (async () => {
      try {
        const result = await client.slice({ sourceKey: source.key, signature, plane: wanted.plane }, () =>
          readSourceInput(source, signature),
        );
        if (isDisposed || sources.get(source.key) !== state || state.slots.get(slot) !== slotState) {
          return;
        }
        disposeLanded(slotState.landed);
        slotState.landed = { key: wanted.key, geometry: toGeometry(result) };
        state.failure = undefined;
        state.lastSlice = {
          candidateCount: result.candidateCount,
          broadphaseMilliseconds: result.broadphaseMilliseconds,
          sliceMilliseconds: result.slice.sliceMilliseconds,
          roundTripMilliseconds: performance.now() - startedAt,
          prepareMilliseconds: result.prepareMilliseconds,
        };
        options.onLanded();
      } catch (error) {
        state.failure = error instanceof Error ? error.message : String(error);
      } finally {
        slotState.inFlightKey = undefined;
        // The plane moved while this slice ran: slice the latest one next. A failed slice is not retried here; the next
        // plane change asks again.
        if (
          !isDisposed &&
          sources.get(source.key) === state &&
          state.slots.get(slot) === slotState &&
          state.failure === undefined
        ) {
          issue(state, slot, slotState);
        }
      }
    })();
  };

  const releaseState = (state: SourceState): void => {
    for (const slotState of state.slots.values()) {
      disposeLanded(slotState.landed);
    }
    state.slots.clear();
  };

  return {
    resolve(source, faces) {
      const signature = sourceSignature(source);
      let state = sources.get(source.key);
      if (state?.signature !== signature) {
        if (state) {
          releaseState(state);
        }
        state = { signature, source, slots: new Map(), lastSlice: undefined, failure: undefined };
        sources.set(source.key, state);
      }
      state.source = source;
      getSectionSourceWorldMatrix(source, sourceToWorld);
      worldToSource.copy(sourceToWorld).invert();
      const bySlot = new Map<number, SectionLoopCapGeometry>();
      const liveSlots = new Set<number>();
      for (const { slot, plane } of faces) {
        liveSlots.add(slot);
        worldPlane.normal.set(plane.normal[0], plane.normal[1], plane.normal[2]);
        worldPlane.constant = -plane.constant;
        worldPlane.applyMatrix4(worldToSource);
        const sourcePlane = [
          worldPlane.normal.x,
          worldPlane.normal.y,
          worldPlane.normal.z,
          -worldPlane.constant,
        ] as const;
        const key = sourcePlane.join(',');
        let slotState = state.slots.get(slot);
        if (!slotState) {
          slotState = { landed: undefined, inFlightKey: undefined, wanted: undefined };
          state.slots.set(slot, slotState);
        }
        if (slotState.wanted?.key !== key) {
          slotState.wanted = { key, plane: sourcePlane };
          if (state.failure !== undefined && slotState.inFlightKey === undefined) {
            state.failure = undefined;
          }
          issue(state, slot, slotState);
        }
        if (slotState.landed) {
          bySlot.set(slot, slotState.landed.geometry);
        }
      }
      for (const [slot, slotState] of state.slots) {
        if (!liveSlots.has(slot)) {
          disposeLanded(slotState.landed);
          state.slots.delete(slot);
        }
      }
      return { matrix: sourceToWorld.clone(), bySlot };
    },
    retain(keys) {
      for (const [key, state] of sources) {
        if (!keys.has(key)) {
          releaseState(state);
          sources.delete(key);
          client.release(key);
        }
      }
    },
    diagnostics() {
      return [...sources.values()].map((state) => {
        let closedLoopCount = 0;
        let openChainCount = 0;
        let pendingFaceCount = 0;
        for (const slotState of state.slots.values()) {
          closedLoopCount += slotState.landed?.geometry.closedLoopCount ?? 0;
          openChainCount += slotState.landed?.geometry.openChainCount ?? 0;
          if (slotState.landed?.key !== slotState.wanted?.key) {
            pendingFaceCount++;
          }
        }
        return {
          sourceKey: state.source.key,
          closedLoopCount,
          openChainCount,
          pendingFaceCount,
          lastSlice: state.lastSlice,
          failure: state.failure,
        };
      });
    },
    dispose() {
      isDisposed = true;
      for (const state of sources.values()) {
        releaseState(state);
        client.release(state.source.key);
      }
      sources.clear();
    },
  };
};
