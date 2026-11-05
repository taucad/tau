import { Primitive, WebIO } from '@gltf-transform/core';
import type { Document, Material } from '@gltf-transform/core';
import { registerTauGltfExtensions } from '#extensions/registry.js';
import { allExtensions } from '#gltf.extensions.js';
import { readGlbJson, writeGlbJson } from '#utils/gltf-geometry-name-normalizer.js';

/** Triangles of one primitive: flat XYZ positions and optional indices, sequential when omitted. @public */
export type TriangleMeshPart = {
  positions: ArrayLike<number>;
  indices?: ArrayLike<number> | undefined;
};

/* oxlint-disable no-bitwise -- open-addressed hash tables mask and mix bits. */
const float = new Float32Array(1);
const floatBits = new Uint32Array(float.buffer);
// `+ 0` folds -0 into 0, so the two weld; NaN never equals itself, so a non-finite mesh is never closed.
const bitsOf = (value: number): number => {
  float[0] = value + 0;
  return floatBits[0]!;
};

const tableSize = (count: number): number => 2 ** Math.ceil(Math.log2(count * 2 + 2));

/**
 * Weld every part's vertices by exact Float32 position, in an open-addressed table of distinct positions.
 *
 * @param parts - The triangle primitives.
 * @returns The distinct positions and, per part, each vertex's welded id.
 */
const weld = (parts: readonly TriangleMeshPart[]): { welded: Float32Array; ids: Uint32Array[] } => {
  const vertexCount = parts.reduce((count, { positions }) => count + positions.length / 3, 0);
  const welded = new Float32Array(vertexCount * 3);
  const mask = tableSize(vertexCount) - 1;
  const slots = new Int32Array(mask + 1).fill(-1);
  let weldedCount = 0;
  const ids = parts.map(({ positions }) => {
    const partIds = new Uint32Array(positions.length / 3);
    for (let vertex = 0; vertex < partIds.length; vertex++) {
      const x = Math.fround(positions[vertex * 3]!);
      const y = Math.fround(positions[vertex * 3 + 1]!);
      const z = Math.fround(positions[vertex * 3 + 2]!);
      let slot = (Math.imul(bitsOf(x), 0x9e_37_79_b1) ^ Math.imul(bitsOf(y), 0x85_eb_ca_77) ^ bitsOf(z)) & mask;
      let id = slots[slot]!;
      while (id !== -1 && (welded[id * 3] !== x || welded[id * 3 + 1] !== y || welded[id * 3 + 2] !== z)) {
        slot = (slot + 1) & mask;
        id = slots[slot]!;
      }
      if (id === -1) {
        id = weldedCount++;
        slots[slot] = id;
        welded[id * 3] = x;
        welded[id * 3 + 1] = y;
        welded[id * 3 + 2] = z;
      }
      partIds[vertex] = id;
    }
    return partIds;
  });
  return { welded, ids };
};

/**
 * A table of directed edges, open-addressed and keyed by (from, to).
 *
 * @param count - The most edges it will hold.
 * @returns `add`, false when the edge is already there, and `allPaired`, whether every edge's reverse is there.
 */
const createEdgeTable = (count: number): { add: (from: number, to: number) => boolean; allPaired: () => boolean } => {
  const mask = tableSize(count) - 1;
  const edgeFrom = new Int32Array(mask + 1).fill(-1);
  const edgeTo = new Int32Array(mask + 1);
  const find = (from: number, to: number): number => {
    let slot = (Math.imul(from, 0x9e_37_79_b1) ^ Math.imul(to, 0x85_eb_ca_77)) & mask;
    while (edgeFrom[slot] !== -1 && (edgeFrom[slot] !== from || edgeTo[slot] !== to)) {
      slot = (slot + 1) & mask;
    }
    return slot;
  };
  return {
    add(from, to) {
      const slot = find(from, to);
      if (edgeFrom[slot] !== -1) {
        return false;
      }
      edgeFrom[slot] = from;
      edgeTo[slot] = to;
      return true;
    },
    allPaired() {
      for (let slot = 0; slot <= mask; slot++) {
        const from = edgeFrom[slot]!;
        if (from !== -1 && edgeFrom[find(edgeTo[slot]!, from)] === -1) {
          return false;
        }
      }
      return true;
    },
  };
};

/**
 * Whether triangles bound a closed solid seen from outside: welded by exact Float32 position, every edge is shared by
 * exactly two triangles that traverse it in opposite directions, and the enclosed volume is positive, so every front
 * face points out. No back face of such a mesh is visible from outside it, so it can draw one side only.
 *
 * The test is linear in triangles. Parts are welded together, so a solid split into several primitives is tested as
 * one; degenerate triangles, whose welded corners repeat, are ignored.
 *
 * @param parts - The solid's triangle primitives.
 * @returns Whether the triangles are a closed, consistently outward-oriented surface.
 * @public
 */
export const isClosedTriangleMesh = (parts: readonly TriangleMeshPart[]): boolean => {
  const triangleCount = parts.reduce(
    (count, { positions, indices }) => count + Math.floor((indices?.length ?? positions.length / 3) / 3),
    0,
  );
  if (triangleCount === 0) {
    return false;
  }
  const { welded: p, ids } = weld(parts);
  // A repeated directed edge is a non-manifold edge or two triangles wound against each other.
  const edges = createEdgeTable(triangleCount * 3);
  // Six times the enclosed volume: the signed tetrahedra the triangles span with the origin.
  const tetrahedron = (a: number, b: number, c: number): number =>
    p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) +
    p[a + 1]! * (p[b + 2]! * p[c]! - p[b]! * p[c + 2]!) +
    p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!);
  let volume = 0;
  for (const [part, { positions, indices }] of parts.entries()) {
    const partIds = ids[part]!;
    const count = Math.floor((indices?.length ?? positions.length / 3) / 3) * 3;
    for (let corner = 0; corner < count; corner += 3) {
      const a = partIds[indices ? indices[corner]! : corner];
      const b = partIds[indices ? indices[corner + 1]! : corner + 1];
      const c = partIds[indices ? indices[corner + 2]! : corner + 2];
      if (a === undefined || b === undefined || c === undefined) {
        return false;
      }
      if (a !== b && b !== c && c !== a) {
        if (!edges.add(a, b) || !edges.add(b, c) || !edges.add(c, a)) {
          return false;
        }
        volume += tetrahedron(a * 3, b * 3, c * 3);
      }
    }
  }
  return volume > 0 && edges.allPaired();
};
/* oxlint-enable no-bitwise */

const readPart = (primitive: Primitive): TriangleMeshPart | undefined => {
  const positions = primitive.getAttribute('POSITION')?.getArray();
  return positions ? { positions, indices: primitive.getIndices()?.getArray() ?? undefined } : undefined;
};

/**
 * Draw the opaque surfaces of every closed mesh in a glTF document on one side only. A mesh whose `TRIANGLES`
 * primitives together pass {@link isClosedTriangleMesh} has its double-sided opaque materials made one-sided: in
 * place when only closed surfaces use them, else as one copy the closed surfaces share. Open meshes, lines, and
 * blended or masked materials keep their materials.
 *
 * One-sided closed solids are faster to draw and keep the back faces of a solid's far side out of its silhouette
 * pixels, where the viewer's surface depth bias would otherwise let them through.
 *
 * @param document - The glTF document; edited in place.
 * @returns Whether any material changed.
 * @public
 */
export const markClosedMeshesSingleSided = (document: Document): boolean => {
  const closed = new Set<Primitive>();
  for (const mesh of document.getRoot().listMeshes()) {
    const triangles = mesh.listPrimitives().filter((primitive) => primitive.getMode() === Primitive.Mode['TRIANGLES']);
    const parts = triangles.map((primitive) => readPart(primitive));
    if (parts.length > 0 && !parts.includes(undefined) && isClosedTriangleMesh(parts as TriangleMeshPart[])) {
      for (const primitive of triangles) {
        closed.add(primitive);
      }
    }
  }
  const materials = new Set<Material>();
  for (const primitive of closed) {
    const material = primitive.getMaterial();
    if (material?.getDoubleSided() && material.getAlphaMode() === 'OPAQUE') {
      materials.add(material);
    }
  }
  for (const material of materials) {
    const users = material.listParents().filter((parent): parent is Primitive => parent instanceof Primitive);
    if (users.every((user) => closed.has(user))) {
      // Every user is closed: the material changes in place and keeps its index.
      material.setDoubleSided(false);
      continue;
    }
    // Shared with an open surface: the closed users take a one-sided copy.
    const copy = material.clone().setDoubleSided(false);
    for (const user of users) {
      if (closed.has(user)) {
        user.setMaterial(copy);
      }
    }
  }
  return materials.size > 0;
};

/**
 * {@link markClosedMeshesSingleSided} for a GLB a kernel's engine wrote, editing only the `doubleSided` flags of the
 * GLB's own JSON so every other byte stays as written. A material shared with an open surface stays double-sided
 * here, since a one-sided copy would need new indices. A GLB with no closed mesh comes back as given.
 *
 * @param glb - The GLB bytes.
 * @returns The GLB with its closed meshes' materials one-sided.
 * @public
 */
export const markClosedGlbMeshesSingleSided = async (
  glb: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const document = await registerTauGltfExtensions(new WebIO()).registerExtensions(allExtensions).readBinary(glb);
  if (!markClosedMeshesSingleSided(document)) {
    return glb;
  }
  const json = readGlbJson(glb);
  // In-place changes keep their index; copies are appended after the GLB's own materials and left out here.
  const materials = document.getRoot().listMaterials();
  let changed = false;
  for (const [index, material] of (json.materials ?? []).entries()) {
    if (material.doubleSided === true && materials[index]?.getDoubleSided() === false) {
      material.doubleSided = false;
      changed = true;
    }
  }
  return changed ? writeGlbJson(glb, json) : glb;
};
