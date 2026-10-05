import { Matrix3, Matrix4, Vector3 } from 'three';
import { GLB_BUFFER, NodeIO } from '@gltf-transform/core';
import type { GLTF } from '@gltf-transform/core';

/** Inspect materials referenced by actual emitted triangle primitives; authored labels are not evidence. */
export async function emittedParitySurfaceMaterials(bytes: Uint8Array<ArrayBuffer>): Promise<
  Array<{
    sourceMaterialIndex: number;
    alphaMode: string;
    transmissionFactor: number;
    baseColorFactor: NonNullable<GLTF.IMaterial['pbrMetallicRoughness']>['baseColorFactor'];
  }>
> {
  const { json } = await new NodeIO().binaryToJSON(bytes);
  const indices = new Set<number>();
  const meshes: ReadonlyArray<Partial<GLTF.IMesh>> = json.meshes ?? [];
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives ?? []) {
      if ((primitive.mode ?? 4) === 4 && primitive.material !== undefined) {
        indices.add(primitive.material);
      }
    }
  }
  if (indices.size === 0) {
    throw new Error('Emitted parity source has no material-bound triangle primitive.');
  }
  return [...indices].map((index) => {
    const material = json.materials?.[index];
    if (!material) {
      throw new Error('Emitted surface material address is missing.');
    }
    const alphaMode: unknown = 'alphaMode' in material ? material.alphaMode : undefined;
    if (alphaMode !== undefined && alphaMode !== 'OPAQUE' && alphaMode !== 'BLEND' && alphaMode !== 'MASK') {
      throw new Error('Emitted surface alpha mode is invalid.');
    }
    const transmissionExtension: unknown = material.extensions?.['KHR_materials_transmission'];
    const transmissionValue: unknown =
      transmissionExtension !== null &&
      typeof transmissionExtension === 'object' &&
      'transmissionFactor' in transmissionExtension
        ? transmissionExtension.transmissionFactor
        : undefined;
    const transmission = transmissionValue ?? 0;
    if (typeof transmission !== 'number' || !Number.isFinite(transmission)) {
      throw new TypeError('Emitted transmission factor is not finite.');
    }
    return {
      sourceMaterialIndex: index,
      alphaMode: alphaMode ?? 'OPAQUE',
      transmissionFactor: transmission,
      baseColorFactor: material.pbrMetallicRoughness?.baseColorFactor,
    };
  });
}

/** Read the actual finite fixture's float normal accessors through the existing GLB parser. */
export async function emittedParitySurfaceNormals(bytes: Uint8Array<ArrayBuffer>): Promise<number[][]> {
  const { json, resources } = await new NodeIO().binaryToJSON(bytes);
  const bin = resources[GLB_BUFFER];
  if (!bin) {
    throw new Error('Actual parity GLB has no owned binary buffer.');
  }
  const indices = new Set(
    (json.meshes ?? []).flatMap((mesh: Partial<GLTF.IMesh>) =>
      (mesh.primitives ?? [])
        .filter((primitive) => (primitive.mode ?? 4) === 4)
        .map((primitive: Partial<GLTF.IMeshPrimitive>) => primitive.attributes?.['NORMAL']),
    ),
  );
  const normals: number[][] = [];
  for (const index of indices) {
    if (index === undefined) {
      throw new Error('Actual parity surface has no authored normal accessor.');
    }
    const accessor = json.accessors?.[index];
    const view = accessor?.bufferView === undefined ? undefined : json.bufferViews?.[accessor.bufferView];
    if (
      accessor?.componentType !== 5126 ||
      view?.buffer !== 0 ||
      accessor.type !== 'VEC3' ||
      accessor.sparse !== undefined ||
      accessor.normalized === true
    ) {
      throw new Error('Finite parity normal accessor does not match the actual float source owner.');
    }
    const stride = view.byteStride ?? 12;
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const end = start + (accessor.count - 1) * stride + 12;
    if (accessor.count <= 0 || stride < 12 || end > bin.byteLength || end > (view.byteOffset ?? 0) + view.byteLength) {
      throw new Error('Actual normal accessor exceeds its owned source buffer.');
    }
    const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    for (let vertex = 0; vertex < accessor.count; vertex++) {
      normals.push([
        data.getFloat32(start + vertex * stride, true),
        data.getFloat32(start + vertex * stride + 4, true),
        data.getFloat32(start + vertex * stride + 8, true),
      ]);
    }
  }
  if (normals.length === 0) {
    throw new Error('Actual emitted surface normal evidence is empty.');
  }
  return normals;
}

/** Compare the actual installed O*S normal frame with Three's stock orthogonal instance correction. */
export function parityDrawFrameEvidence(
  elements: readonly number[],
  normals: ReadonlyArray<readonly number[]>,
): {
  determinant: number;
  normalizedDot: number;
  sourceNormalCount: number;
  normalCorrectionDistance: number;
  corrections: Array<{ distance: number; inverseTransposeNormal: number[]; stockInstanceNormal: number[] }>;
} {
  if (elements.length !== 16 || !elements.every((value) => Number.isFinite(value))) {
    throw new Error('Draw frame is not finite.');
  }
  const world = new Matrix4().fromArray(elements);
  const basis = [
    new Vector3().setFromMatrixColumn(world, 0),
    new Vector3().setFromMatrixColumn(world, 1),
    new Vector3().setFromMatrixColumn(world, 2),
  ];
  const [x, y, z] = basis;
  if (!x || !y || !z || basis.some((column) => column.lengthSq() === 0)) {
    throw new Error('Draw basis is degenerate.');
  }
  const normalizedDot = Math.max(
    Math.abs(x.dot(y) / (x.length() * y.length())),
    Math.abs(x.dot(z) / (x.length() * z.length())),
    Math.abs(y.dot(z) / (y.length() * z.length())),
  );
  if (normals.length === 0) {
    throw new Error('Draw normal proof requires actual emitted normals.');
  }
  const inverseTranspose = new Matrix3().getNormalMatrix(world);
  const linear = new Matrix3().setFromMatrix4(world);
  const corrections = normals.map((normal) => {
    const [nx, ny, nz] = normal;
    if (nx === undefined || ny === undefined || nz === undefined || !normal.every((value) => Number.isFinite(value))) {
      throw new Error('Actual source normal is not finite.');
    }
    const local = new Vector3(nx, ny, nz);
    if (local.lengthSq() === 0) {
      throw new Error('Actual source normal is degenerate.');
    }
    local.normalize();
    const correct = local.clone().applyMatrix3(inverseTranspose).normalize();
    const stock = new Vector3(local.x / x.lengthSq(), local.y / y.lengthSq(), local.z / z.lengthSq())
      .applyMatrix3(linear)
      .normalize();
    return {
      distance: correct.distanceTo(stock),
      inverseTransposeNormal: correct.toArray(),
      stockInstanceNormal: stock.toArray(),
    };
  });
  return {
    determinant: world.determinant(),
    normalizedDot,
    sourceNormalCount: normals.length,
    normalCorrectionDistance: Math.max(...corrections.map(({ distance }) => distance)),
    corrections,
  };
}

/** Ordinary admission has no reusable-reader authority; only its actual committed diagnostic key qualifies a capture. */
export function assertOrdinaryParityDiagnostics(
  value: Readonly<{
    projectId?: string;
    sourceEntryPath?: string;
    sourceGeometryHash?: string;
    requestedKey?: string;
    presentedKey?: string;
    requestedRevision: number;
    presentedRevision: number;
    outcome?: string;
    requestedRenderId?: number;
    settledRenderId?: number;
  }>,
  entryPath: string,
): string {
  if (
    !value.projectId ||
    typeof value.requestedRenderId !== 'number' ||
    typeof value.settledRenderId !== 'number' ||
    value.sourceEntryPath !== entryPath ||
    !value.sourceGeometryHash ||
    value.sourceGeometryHash !== value.requestedKey ||
    value.sourceGeometryHash !== value.presentedKey ||
    value.requestedRevision !== value.presentedRevision ||
    value.outcome !== 'success' ||
    value.requestedRenderId !== value.settledRenderId
  ) {
    throw new Error('Ordinary parity viewer is not coherently committed to its actual imported bytes.');
  }
  return value.sourceGeometryHash;
}
