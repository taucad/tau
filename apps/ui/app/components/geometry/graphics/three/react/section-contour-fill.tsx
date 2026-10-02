import * as React from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { createTintedStripedMaterial } from '#components/geometry/graphics/three/materials/striped-material-tinted.js';
import {
  createSegmentScratch,
  extractClosedContours,
} from '#components/geometry/graphics/three/utils/plane-mesh-contour.js';
import { mergeTriangulatedContours } from '#components/geometry/graphics/three/utils/earcut-contour.js';
import { getOrBuildBvh } from '#components/geometry/graphics/three/utils/bvh-cache.js';
import { hasSceneTag, sceneTag, sceneTagData } from '#components/geometry/graphics/three/utils/scene-tags.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';

const _inverseMeshWorld = /* @__PURE__ */ new THREE.Matrix4();
const _localPlane = /* @__PURE__ */ new THREE.Plane();
const _parentInverse = /* @__PURE__ */ new THREE.Matrix4();

type FillGeometryBuffers = Readonly<{
  positions: Float32Array;
  planeUv: Float32Array;
  indices: Uint32Array;
}>;

/** R8b: reused index/position/planeUv buffers with geometric grow + `setDrawRange`. */
function writePooledFillIndexedGeometry(fillMesh: THREE.Mesh, buffers: FillGeometryBuffers): void {
  const { positions, planeUv, indices } = buffers;

  const geometry = fillMesh.geometry instanceof THREE.BufferGeometry ? fillMesh.geometry : new THREE.BufferGeometry();
  if (fillMesh.geometry !== geometry) {
    fillMesh.geometry = geometry;
  }

  const vertexCount = positions.length / 3;
  const indexCount = indices.length;

  let positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!positionAttribute || positionAttribute.count < vertexCount) {
    const newCapacity = positionAttribute
      ? Math.max(positionAttribute.count * 2, vertexCount)
      : Math.max(64, vertexCount);
    const array = new Float32Array(newCapacity * 3);
    positionAttribute = new THREE.BufferAttribute(array, 3);
    geometry.setAttribute('position', positionAttribute);
  }

  (positionAttribute.array as Float32Array).set(positions.subarray(0, positions.length), 0);
  positionAttribute.needsUpdate = true;

  let planeAttribute = geometry.getAttribute('aPlaneUv') as THREE.BufferAttribute | undefined;
  if (!planeAttribute || planeAttribute.count < vertexCount) {
    const newCapacity = planeAttribute ? Math.max(planeAttribute.count * 2, vertexCount) : Math.max(64, vertexCount);
    const array = new Float32Array(newCapacity * 2);
    planeAttribute = new THREE.BufferAttribute(array, 2);
    geometry.setAttribute('aPlaneUv', planeAttribute);
  }

  (planeAttribute.array as Float32Array).set(planeUv.subarray(0, planeUv.length), 0);
  planeAttribute.needsUpdate = true;

  let indexAttribute = geometry.getIndex() ?? undefined;
  if (!indexAttribute || indexAttribute.count < indexCount) {
    const newCapacity = indexAttribute ? Math.max(indexAttribute.count * 2, indexCount) : Math.max(128, indexCount);
    const array = new Uint32Array(newCapacity);
    indexAttribute = new THREE.BufferAttribute(array, 1);
    geometry.setIndex(indexAttribute);
  }

  (indexAttribute.array as Uint32Array).set(indices.subarray(0, indexCount), 0);
  indexAttribute.needsUpdate = true;

  geometry.setDrawRange(0, indexCount);
  geometry.computeBoundingSphere();
}

/**
 * @remarks Multi-plane section view: each fill is built in mesh-local space from one world plane;
 * composing multiple planes is a future `ClippingGroup` nesting concern (see canonical reference F3).
 */
export type SectionContourFillsProperties = Readonly<{
  plane: THREE.Plane;
  enabled: boolean;
  stripeFrequency: number;
  stripeWidth: number;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  innerRef: React.RefObject<THREE.Group | null>;
}>;

function isDrawableSectionSourceMesh(object: THREE.Object3D): object is THREE.Mesh {
  return object instanceof THREE.Mesh && Boolean(object.geometry) && Boolean(object.material);
}

function collectMeshesUnder(root: THREE.Group): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (hasSceneTag(child, sceneTag.sectionViewHelper)) {
      return;
    }

    if (!isDrawableSectionSourceMesh(child)) {
      return;
    }

    result.push(child);
  });
  return result;
}

function extractTintHex(mesh: THREE.Mesh): number {
  const materials: THREE.Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const mat = materials[0];
  if (mat && 'color' in mat && mat.color instanceof THREE.Color) {
    return mat.color.getHex();
  }

  return 0xdd_dd_dd;
}

export function SectionContourFills({
  plane,
  enabled,
  innerRef,
  stripeFrequency,
  stripeWidth,
}: SectionContourFillsProperties): React.JSX.Element {
  const backend = useThreeGraphicsBackend();
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  const rootRef = React.useRef<THREE.Group | null>(null);
  const fillBySourceUuid = React.useRef(new Map<string, THREE.Mesh>());
  const segmentScratchRef = React.useRef(createSegmentScratch());

  useFrame(() => {
    const root = rootRef.current;
    const inner = innerRef.current;

    if (!root) {
      return;
    }

    if (!enabled || !inner) {
      root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.visible = false;
        }
      });
      return;
    }

    const sourceMeshes = collectMeshesUnder(inner);
    const seen = new Set<string>();
    const scratch = segmentScratchRef.current;

    for (const mesh of sourceMeshes) {
      seen.add(mesh.uuid);
      mesh.updateMatrixWorld();

      let fillMesh = fillBySourceUuid.current.get(mesh.uuid);
      if (!fillMesh) {
        fillMesh = new THREE.Mesh();
        fillMesh.frustumCulled = false;
        fillMesh.userData = { ...sceneTagData(sceneTag.sectionViewHelper) };
        root.add(fillMesh);
        fillBySourceUuid.current.set(mesh.uuid, fillMesh);
      }

      const bvh = getOrBuildBvh(mesh.geometry);
      const contours = extractClosedContours({
        geometry: mesh.geometry,
        bvh,
        worldPlane: plane,
        meshWorldMatrix: mesh.matrixWorld,
        segmentScratch: scratch,
      });

      if (contours.length === 0) {
        fillMesh.visible = false;
        continue;
      }

      _inverseMeshWorld.copy(mesh.matrixWorld).invert();
      _localPlane.copy(plane).applyMatrix4(_inverseMeshWorld);
      const { positions, planeUv, indices } = mergeTriangulatedContours(contours, _localPlane.normal);

      if (positions.length === 0 || indices.length === 0) {
        fillMesh.visible = false;
        continue;
      }

      fillMesh.visible = true;
      writePooledFillIndexedGeometry(fillMesh, { positions, planeUv, indices });

      const tintHex = extractTintHex(mesh);
      fillMesh.material = createTintedStripedMaterial(backend, {
        tintColor: tintHex,
        stripeFrequency,
        stripeWidth,
      });

      fillMesh.matrixAutoUpdate = false;
      const parentObject = fillMesh.parent;
      if (parentObject) {
        _parentInverse.copy(parentObject.matrixWorld).invert();
        fillMesh.matrix.multiplyMatrices(_parentInverse, mesh.matrixWorld);
      } else {
        fillMesh.matrix.copy(mesh.matrixWorld);
      }

      fillMesh.updateMatrixWorld(true);
    }

    for (const [uuid, fillMesh] of fillBySourceUuid.current) {
      if (!seen.has(uuid)) {
        root.remove(fillMesh);
        fillMesh.geometry.dispose();
        fillBySourceUuid.current.delete(uuid);
      }
    }
  });

  return (
    <group
      ref={rootRef}
      data-testid='tau-section-contour-fills-root'
      userData={sceneTagData(sceneTag.sectionViewHelper)}
    />
  );
}
