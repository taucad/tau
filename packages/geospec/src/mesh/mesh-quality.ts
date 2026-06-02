import type { Document, Mesh } from '@gltf-transform/core';
import { buildMeshNodeNameMap } from '#mesh/connected-components.js';
import type { MeshQualityStats } from '#mesh/types.js';

type Vec3Mutable = [number, number, number];

const triangleAreaTolerance = 1e-12;
const duplicatePrecision = 1e9;

const subtract = (a: Vec3Mutable, b: Vec3Mutable): Vec3Mutable => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const cross = (a: Vec3Mutable, b: Vec3Mutable): Vec3Mutable => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const dot = (a: Vec3Mutable, b: Vec3Mutable): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const magnitude = (a: Vec3Mutable): number => Math.sqrt(dot(a, a));

const centerOfTriangle = (a: Vec3Mutable, b: Vec3Mutable, c: Vec3Mutable): Vec3Mutable => [
  (a[0] + b[0] + c[0]) / 3,
  (a[1] + b[1] + c[1]) / 3,
  (a[2] + b[2] + c[2]) / 3,
];

const tetrahedronCentroid = (a: Vec3Mutable, b: Vec3Mutable, c: Vec3Mutable): Vec3Mutable => [
  (a[0] + b[0] + c[0]) / 4,
  (a[1] + b[1] + c[1]) / 4,
  (a[2] + b[2] + c[2]) / 4,
];

const coordinateKey = (point: Vec3Mutable): string =>
  point.map((coordinate) => Math.round(coordinate * duplicatePrecision).toString()).join(',');

const triangleKey = (a: Vec3Mutable, b: Vec3Mutable, c: Vec3Mutable): string =>
  [coordinateKey(a), coordinateKey(b), coordinateKey(c)].sort().join('|');

const meshDisplayName = (mesh: Mesh, meshNodeNames: ReadonlyMap<Mesh, string>, ordinal: number): string => {
  const meshName = mesh.getName().trim();
  if (meshName) {
    return meshName;
  }
  const nodeName = meshNodeNames.get(mesh);
  return nodeName && nodeName.length > 0 ? nodeName : `Mesh_${ordinal}`;
};

/**
 * Analyze scalar mesh quality metrics from a parsed glTF document.
 *
 * @param document - Parsed glTF document.
 * @returns P0 quality metrics used by GeoSpec mesh matchers.
 * @public
 */
export const analyzeMeshQuality = (document: Document): MeshQualityStats => {
  const meshNodeNames = buildMeshNodeNameMap(document);
  const seenFaces = new Map<string, number>();
  const quality: MeshQualityStats = {
    triangleCount: 0,
    nonFiniteVertices: [],
    degenerateTriangles: [],
    duplicateFaces: [],
    triangles: [],
    surfaceArea: 0,
    signedVolume: 0,
  };
  const centerOfMassNumerator: Vec3Mutable = [0, 0, 0];

  let meshOrdinal = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    const displayName = meshDisplayName(mesh, meshNodeNames, meshOrdinal);
    meshOrdinal += 1;
    let primitiveOrdinal = 0;

    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        continue;
      }
      const positions = primitive.getAttribute('POSITION');
      if (!positions) {
        continue;
      }
      const indices = primitive.getIndices();
      const primitiveName = `${displayName}#${primitiveOrdinal}`;
      primitiveOrdinal += 1;

      const vertexAt = (index: number): Vec3Mutable => positions.getElement(index, [0, 0, 0]);
      const indexAt = (index: number): number => (indices ? indices.getScalar(index) : index);
      const indexCount = indices ? indices.getCount() : positions.getCount();

      for (let vertexIndex = 0; vertexIndex < positions.getCount(); vertexIndex++) {
        const position = vertexAt(vertexIndex);
        if (!position.every((coordinate) => Number.isFinite(coordinate))) {
          quality.nonFiniteVertices.push({ primitive: primitiveName, vertexIndex, position });
        }
      }

      for (let index = 0; index + 2 < indexCount; index += 3) {
        const triangleIndex = quality.triangleCount;
        const a = vertexAt(indexAt(index));
        const b = vertexAt(indexAt(index + 1));
        const c = vertexAt(indexAt(index + 2));
        quality.triangleCount += 1;

        const ab = subtract(b, a);
        const ac = subtract(c, a);
        const normal = cross(ab, ac);
        const area = magnitude(normal) / 2;
        const center = centerOfTriangle(a, b, c);
        const signedVolume = dot(a, cross(b, c)) / 6;
        quality.surfaceArea += area;
        quality.signedVolume += signedVolume;

        const centroid = tetrahedronCentroid(a, b, c);
        centerOfMassNumerator[0] += centroid[0] * signedVolume;
        centerOfMassNumerator[1] += centroid[1] * signedVolume;
        centerOfMassNumerator[2] += centroid[2] * signedVolume;

        quality.triangles.push({
          primitive: primitiveName,
          triangleIndex,
          a,
          b,
          c,
          center,
          area,
        });

        if (area <= triangleAreaTolerance) {
          quality.degenerateTriangles.push({
            primitive: primitiveName,
            triangleIndex,
            area,
            center,
          });
        }

        const key = triangleKey(a, b, c);
        const firstTriangleIndex = seenFaces.get(key);
        if (firstTriangleIndex === undefined) {
          seenFaces.set(key, triangleIndex);
        } else {
          quality.duplicateFaces.push({ primitive: primitiveName, triangleIndex, firstTriangleIndex });
        }
      }
    }
  }

  if (Math.abs(quality.signedVolume) > triangleAreaTolerance) {
    quality.centerOfMass = [
      centerOfMassNumerator[0] / quality.signedVolume,
      centerOfMassNumerator[1] / quality.signedVolume,
      centerOfMassNumerator[2] / quality.signedVolume,
    ];
  }

  return quality;
};
