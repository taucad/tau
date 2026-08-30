import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import { sceneTag, hasSceneTag, sceneTagData } from '#components/geometry/graphics/three/utils/scene-tags.js';

describe('scene-tags', () => {
  // ===================================================================
  // sceneTag registry
  // ===================================================================

  describe('sceneTag', () => {
    it('should expose all expected tag keys with stable string values', () => {
      expect(sceneTag.sectionViewHelper).toBe('isSectionViewHelper');
      expect(sceneTag.measurementUi).toBe('isMeasurementUi');
      expect(Object.keys(sceneTag)).toHaveLength(2);
    });
  });

  // ===================================================================
  // hasSceneTag
  // ===================================================================

  describe('hasSceneTag', () => {
    it('should return true when the tag is set on userData', () => {
      const object = new THREE.Object3D();
      object.userData[sceneTag.measurementUi] = true;

      expect(hasSceneTag(object, sceneTag.measurementUi)).toBe(true);
    });

    it('should return false when the tag is not set', () => {
      const object = new THREE.Object3D();

      expect(hasSceneTag(object, sceneTag.sectionViewHelper)).toBe(false);
    });

    it('should return false when userData is empty', () => {
      const object = new THREE.Object3D();

      for (const tag of Object.values(sceneTag)) {
        expect(hasSceneTag(object, tag)).toBe(false);
      }
    });

    it('should return false for falsy values (0, empty string, null)', () => {
      const object = new THREE.Object3D();
      object.userData[sceneTag.measurementUi] = 0;
      expect(hasSceneTag(object, sceneTag.measurementUi)).toBe(false);

      object.userData[sceneTag.measurementUi] = '';
      expect(hasSceneTag(object, sceneTag.measurementUi)).toBe(false);

      object.userData[sceneTag.measurementUi] = null;
      expect(hasSceneTag(object, sceneTag.measurementUi)).toBe(false);
    });
  });

  // ===================================================================
  // sceneTagData
  // ===================================================================

  describe('sceneTagData', () => {
    it('should return a userData object with the tag set to true', () => {
      expect(sceneTagData(sceneTag.sectionViewHelper)).toEqual({
        isSectionViewHelper: true,
      });
    });

    it('should produce an object compatible with hasSceneTag', () => {
      const object = new THREE.Object3D();
      Object.assign(object.userData, sceneTagData(sceneTag.measurementUi));

      expect(hasSceneTag(object, sceneTag.measurementUi)).toBe(true);
    });
  });

  // ===================================================================
  // Integration: producer-consumer contracts
  // ===================================================================

  describe('integration', () => {
    describe('raycast mesh filtering', () => {
      it('should exclude measurementUi tagged meshes from the mesh list', () => {
        const scene = new THREE.Scene();
        const measureMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
        measureMesh.userData = sceneTagData(sceneTag.measurementUi);

        const modelMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());

        scene.add(measureMesh, modelMesh);

        // Replicate the measure-tool's filtering logic
        const meshes: THREE.Object3D[] = [];
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh && object.visible && !hasSceneTag(object, sceneTag.measurementUi)) {
            meshes.push(object as THREE.Object3D);
          }
        });

        expect(meshes).toHaveLength(1);
        expect(meshes).toContain(modelMesh);
        expect(meshes).not.toContain(measureMesh);
      });

      it('should include untagged visible meshes', () => {
        const scene = new THREE.Scene();
        const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
        const mesh2 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
        scene.add(mesh1, mesh2);

        const meshes: THREE.Object3D[] = [];
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh && object.visible && !hasSceneTag(object, sceneTag.measurementUi)) {
            meshes.push(object as THREE.Object3D);
          }
        });

        expect(meshes).toHaveLength(2);
        expect(meshes).toContain(mesh1);
        expect(meshes).toContain(mesh2);
      });
    });
  });
});
