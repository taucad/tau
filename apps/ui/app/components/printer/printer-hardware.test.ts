import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPrinterHardware, toolheadOpacity } from '#components/printer/printer-hardware.js';
import { derivePrinterGeometry } from '#components/printer/printer-geometry.js';
import { resolvePrinterManifest, x1cReferenceGeometry } from '#components/printer/printer-manifest.fixture.js';
import { a1MiniManifest } from '#components/print/testing/machines.fixture.js';
import { applyPlateGrain, plateStandInOutline } from '#components/printer/printer-plate-surface.js';

describe('physical printer assemblies', () => {
  it('keeps the bed and gantry independently movable, with Mini’s column right of the print', () => {
    for (const manifest of [x1cReferenceGeometry, resolvePrinterManifest(a1MiniManifest)]) {
      const geometry = derivePrinterGeometry(manifest);
      const hardware = createPrinterHardware(geometry);
      const resources = new Set<THREE.BufferGeometry | THREE.Material>();
      for (const group of Object.values(hardware)) {
        group.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            const mesh = object as THREE.Mesh;
            resources.add(mesh.geometry);
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
              resources.add(material);
            }
          }
        });
      }
      try {
        const stationary = new THREE.Box3().setFromObject(hardware.frame);
        hardware.bed.position.set(0, 27, -13);
        hardware.gantry.position.set(0, 90, 42);
        expect(new THREE.Box3().setFromObject(hardware.frame).equals(stationary)).toBe(true);
        const head = hardware.head.getObjectByName('toolhead-cover') as THREE.Mesh;
        const frameMaterials = new Set<THREE.Material>();
        hardware.frame.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            frameMaterials.add((object as THREE.Mesh).material as THREE.Material);
          }
        });
        expect(frameMaterials.has(head.material as THREE.Material)).toBe(false);
        if (manifest.identity.model === 'a1-mini') {
          expect(hardware.frame.getObjectByName('z-extrusion')!.position.x).toBeGreaterThan(
            manifest.geometry.buildVolume.x,
          );
          expect(hardware.housing.children).toHaveLength(0);
        } else {
          const inlet = hardware.head.getObjectByName('ptfe-inlet')!;
          expect(new THREE.Box3().setFromObject(inlet).max.z).toBeLessThan(
            geometry.enclosure.center[2] + geometry.enclosure.size[2] / 2,
          );
        }
      } finally {
        for (const resource of resources) {
          resource.dispose();
        }
      }
    }
  });

  it('restores opaque side and underside views and fades continuously from above', () => {
    expect(toolheadOpacity(-1, 1)).toBe(1);
    expect(toolheadOpacity(0, 1)).toBe(1);
    expect(toolheadOpacity(1, 1)).toBeLessThan(0.4);
    expect(toolheadOpacity(0.25, 1)).toBeGreaterThan(toolheadOpacity(0.35, 1));
    expect(toolheadOpacity(0, 0)).toBe(1);
  });

  it('preserves three pierced holes and uses the same physical grain scale on both stand-ins', () => {
    for (const mini of [false, true]) {
      const outline = plateStandInOutline(mini);
      expect(outline.holes).toHaveLength(3);
      const geometry = new THREE.PlaneGeometry(16, 16);
      const material = new THREE.MeshStandardMaterial();
      const grain = applyPlateGrain(new THREE.Mesh(geometry, material));
      expect(geometry.getAttribute('uv').getX(1) - geometry.getAttribute('uv').getX(0)).toBe(2);
      expect(grain.wrapS).toBe(THREE.RepeatWrapping);
      expect(material.normalMap).toBe(grain);
      grain.dispose();
      material.dispose();
      geometry.dispose();
    }
  });
});
