import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import type { BufferAttribute, InterleavedBufferAttribute } from 'three';

/**
 * Triangle stream with geometric (not smoothed shading) normals.
 * Created once for a source revision; transforms and camera changes reuse it.
 * @internal
 * @param source - Caller-owned triangle geometry.
 * @returns Owned nonindexed positions and constant geometric normals.
 */
export const createSectionOutlineGeometry = (source: BufferGeometry): BufferGeometry => {
  const position = source.getAttribute('position');
  const index = source.getIndex() ?? undefined;
  const count = index?.count ?? position.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let offset = 0; offset + 2 < count; offset += 3) {
    a.fromBufferAttribute(position, index?.getX(offset) ?? offset);
    b.fromBufferAttribute(position, index?.getX(offset + 1) ?? offset + 1);
    c.fromBufferAttribute(position, index?.getX(offset + 2) ?? offset + 2);
    a.toArray(positions, offset * 3);
    b.toArray(positions, (offset + 1) * 3);
    c.toArray(positions, (offset + 2) * 3);
    b.sub(a).cross(c.sub(a)).normalize();
    for (let corner = 0; corner < 3; corner++) {
      b.toArray(normals, (offset + corner) * 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
  geometry.boundingBox = source.boundingBox?.clone() ?? null;
  geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  return geometry;
};

const version = (attribute: BufferAttribute | InterleavedBufferAttribute): number =>
  'data' in attribute ? attribute.data.version : attribute.version;

/**
 * One cap owner's derived buffers; revisions invalidate and unused sources retire after each frame.
 * @internal
 * @returns Owner-local geometry acquisition, retirement and disposal operations.
 */
export const createSectionOutlineGeometryCache = (): {
  get: (source: BufferGeometry) => BufferGeometry;
  retireUnused: () => void;
  dispose: () => void;
} => {
  const entries = new Map<
    BufferGeometry,
    {
      position: BufferAttribute | InterleavedBufferAttribute;
      positionVersion: number;
      index: BufferAttribute | undefined;
      indexVersion: number;
      geometry: BufferGeometry;
      used: boolean;
    }
  >();
  return {
    get(source: BufferGeometry): BufferGeometry {
      const position = source.getAttribute('position');
      const index = source.getIndex() ?? undefined;
      let entry = entries.get(source);
      if (
        !entry ||
        entry.position !== position ||
        entry.positionVersion !== version(position) ||
        entry.index !== index ||
        entry.indexVersion !== (index?.version ?? 0)
      ) {
        entry?.geometry.dispose();
        entry = {
          position,
          positionVersion: version(position),
          index,
          indexVersion: index?.version ?? 0,
          geometry: createSectionOutlineGeometry(source),
          used: true,
        };
        entries.set(source, entry);
      }
      entry.used = true;
      entry.geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
      return entry.geometry;
    },
    retireUnused(): void {
      for (const [source, entry] of entries) {
        if (entry.used) {
          entry.used = false;
        } else {
          entry.geometry.dispose();
          entries.delete(source);
        }
      }
    },
    dispose(): void {
      for (const entry of entries.values()) {
        entry.geometry.dispose();
      }
      entries.clear();
    },
  };
};
