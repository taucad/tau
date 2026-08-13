import type { Document } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';

/** Three-dimensional point or direction used by coordinate test evidence. */
type Point3 = [number, number, number];

export type CoordinatePrimitiveEvidence = {
  baseColorFactor: [number, number, number, number] | undefined;
  materialName: string;
  meshName: string;
  nodeName: string;
  centroid: Point3;
  normals: Point3[];
  positions: Point3[];
  winding: number[];
};

const round = (value: number): number => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const normalize = ([x, y, z]: Point3): Point3 => {
  const length = Math.hypot(x, y, z);
  return length === 0 ? [0, 0, 0] : [round(x / length), round(y / length), round(z / length)];
};

const comparePoints = (left: Point3, right: Point3): number =>
  left[0] - right[0] || left[1] - right[1] || left[2] - right[2];

const transformPoint = (point: Point3, matrix: readonly number[]): Point3 => [
  round(matrix[0]! * point[0] + matrix[4]! * point[1] + matrix[8]! * point[2] + matrix[12]!),
  round(matrix[1]! * point[0] + matrix[5]! * point[1] + matrix[9]! * point[2] + matrix[13]!),
  round(matrix[2]! * point[0] + matrix[6]! * point[1] + matrix[10]! * point[2] + matrix[14]!),
];

const transformNormal = (normal: Point3, matrix: readonly number[]): Point3 =>
  normalize([
    matrix[0]! * normal[0] + matrix[4]! * normal[1] + matrix[8]! * normal[2],
    matrix[1]! * normal[0] + matrix[5]! * normal[1] + matrix[9]! * normal[2],
    matrix[2]! * normal[0] + matrix[6]! * normal[1] + matrix[10]! * normal[2],
  ]);

const readDocument = async (bytes: Uint8Array<ArrayBuffer>, format: 'glb' | 'gltf'): Promise<Document> => {
  const io = new NodeIO().registerExtensions([KHRMaterialsUnlit]);
  if (format === 'glb') {
    return io.readBinary(bytes);
  }
  return io.readJSON({
    json: JSON.parse(new TextDecoder().decode(bytes)) as Parameters<NodeIO['readJSON']>[0]['json'],
    resources: {},
  });
};

export const readCoordinateEvidence = async ({
  bytes,
  format = 'glb',
}: {
  bytes: Uint8Array<ArrayBuffer>;
  format?: 'glb' | 'gltf';
}): Promise<CoordinatePrimitiveEvidence[]> => {
  const document = await readDocument(bytes, format);
  const evidence: CoordinatePrimitiveEvidence[] = [];

  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) {
      continue;
    }
    const matrix = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        continue;
      }
      const positionAccessor = primitive.getAttribute('POSITION');
      if (!positionAccessor) {
        continue;
      }
      const normalAccessor = primitive.getAttribute('NORMAL');
      const positions: Point3[] = [];
      const normals: Point3[] = [];
      for (let index = 0; index < positionAccessor.getCount(); index++) {
        positions.push(transformPoint(positionAccessor.getElement(index, [0, 0, 0]) as Point3, matrix));
        if (normalAccessor) {
          normals.push(transformNormal(normalAccessor.getElement(index, [0, 0, 0]) as Point3, matrix));
        }
      }

      const indices = primitive.getIndices()?.getArray();
      const indexCount = indices?.length ?? positions.length;
      const winding: number[] = [];
      for (let index = 0; index < indexCount; index += 3) {
        const i0 = indices ? Number(indices[index]) : index;
        const i1 = indices ? Number(indices[index + 1]) : index + 1;
        const i2 = indices ? Number(indices[index + 2]) : index + 2;
        const p0 = positions[i0]!;
        const p1 = positions[i1]!;
        const p2 = positions[i2]!;
        const edge1: Point3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const edge2: Point3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        const cross: Point3 = [
          edge1[1] * edge2[2] - edge1[2] * edge2[1],
          edge1[2] * edge2[0] - edge1[0] * edge2[2],
          edge1[0] * edge2[1] - edge1[1] * edge2[0],
        ];
        const normal = normals[i0];
        winding.push(normal ? Math.sign(cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2]) : 0);
      }

      const centroid: Point3 = [0, 0, 0];
      for (const point of positions) {
        centroid[0] += point[0];
        centroid[1] += point[1];
        centroid[2] += point[2];
      }
      evidence.push({
        baseColorFactor: primitive.getMaterial()?.getBaseColorFactor() as [number, number, number, number] | undefined,
        materialName: primitive.getMaterial()?.getName() ?? '',
        meshName: mesh.getName(),
        nodeName: node.getName(),
        centroid: centroid.map((value) => round(value / positions.length)) as Point3,
        normals: normals.sort(comparePoints),
        positions: positions.sort(comparePoints),
        winding: winding.sort((left, right) => left - right),
      });
    }
  }

  return evidence.sort((left, right) =>
    `${left.nodeName}\0${left.meshName}\0${left.materialName}`.localeCompare(
      `${right.nodeName}\0${right.meshName}\0${right.materialName}`,
    ),
  );
};

const mapPointToYupMeters = ([x, y, z]: Point3): Point3 => [round(x / 1000), round(z / 1000), round(-y / 1000)];
const mapNormalToYup = ([x, y, z]: Point3): Point3 => [x, z, round(-y)];

export const mapZupMillimetersToYupMeters = (evidence: CoordinatePrimitiveEvidence[]): CoordinatePrimitiveEvidence[] =>
  evidence.map((primitive) => ({
    ...primitive,
    centroid: mapPointToYupMeters(primitive.centroid),
    normals: primitive.normals.map((normal) => mapNormalToYup(normal)).sort(comparePoints),
    positions: primitive.positions.map((position) => mapPointToYupMeters(position)).sort(comparePoints),
  }));
