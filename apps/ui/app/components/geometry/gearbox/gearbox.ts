import * as THREE from 'three';
import { createPartGeometries, loadAssembly } from '@taucad/planetary-gearbox';
import manifestUrl from '@taucad/planetary-gearbox/assets/planetary.json?url';
import geometryUrl from '@taucad/planetary-gearbox/assets/planetary.bin.gz?url';
import variantUrl from '@taucad/planetary-gearbox/assets/planetary-face18.json?url';
import offsetsUrl from '@taucad/planetary-gearbox/assets/planetary-face18.bin.gz?url';

/** One authored part of the showcase gearbox, centred on its own axis; morph target 0 is `faceWidth` 18. */
export type GearboxPart = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

/** Line-art build volume for the print illustration: an illustration, not a machine. */
export type PrintVolume = {
  readonly group: THREE.Group;
  readonly nozzle: THREE.Mesh;
  readonly dispose: () => void;
};

// oxlint-disable tau-lint/no-hardcoded-color -- Three.js scene colours, shared with the homepage story.
export const gearboxColors = { teal: '#14b8a6', blue: '#5B8FD9', printer: '#758da0', bed: '#9fb8c2' } as const;
// oxlint-enable tau-lint/no-hardcoded-color

/** Build-volume edge in millimetres, matching the homepage print beat. */
export const printVolumeSize = 256;

export const disposeGearboxParts = (parts: readonly GearboxPart[]): void => {
  for (const part of parts) {
    part.geometry.dispose();
    part.material.dispose();
  }
};

/** Load the authored 34-part example into exclusively owned meshes, named after their parts. */
export const loadGearboxParts = async (signal: AbortSignal): Promise<GearboxPart[]> => {
  const assembly = await loadAssembly(
    { manifest: manifestUrl, geometry: geometryUrl, variant: variantUrl, offsets: offsetsUrl },
    signal,
  );
  return createPartGeometries(assembly).map(({ name, color, metalness, roughness, geometry, hasVariant }) => {
    // Softer metal than the homepage studio render: these scenes have no studio environment to reflect.
    const material = new THREE.MeshStandardMaterial({ color, metalness: metalness * 0.6, roughness: roughness + 0.1 });
    const part = new THREE.Mesh(geometry, material);
    part.name = name;
    part.morphTargetInfluences = hasVariant ? [0] : [];
    return part;
  });
};

/** The 256 mm build volume in model millimetres, z up: plate, frame and a nozzle the caller moves. */
export const createPrintVolume = (): PrintVolume => {
  const bedGeometry = new THREE.BoxGeometry(printVolumeSize, printVolumeSize, 3);
  const bedMaterial = new THREE.MeshStandardMaterial({ color: gearboxColors.bed, metalness: 0.15, roughness: 0.7 });
  const bed = new THREE.Mesh(bedGeometry, bedMaterial);
  bed.position.z = -2.5;
  const frameBox = new THREE.BoxGeometry(printVolumeSize, printVolumeSize, printVolumeSize);
  const frameGeometry = new THREE.EdgesGeometry(frameBox);
  frameBox.dispose();
  const frameMaterial = new THREE.LineBasicMaterial({
    color: gearboxColors.printer,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const frame = new THREE.LineSegments(frameGeometry, frameMaterial);
  frame.position.z = printVolumeSize / 2 - 1;
  const nozzleGeometry = new THREE.BoxGeometry(22, 22, 26);
  const nozzleMaterial = new THREE.MeshStandardMaterial({ color: gearboxColors.teal, metalness: 0.4, roughness: 0.3 });
  const nozzle = new THREE.Mesh(nozzleGeometry, nozzleMaterial);
  const group = new THREE.Group();
  group.add(bed, frame, nozzle);
  return {
    group,
    nozzle,
    dispose() {
      for (const resource of [bedGeometry, bedMaterial, frameGeometry, frameMaterial, nozzleGeometry, nozzleMaterial]) {
        resource.dispose();
      }
    },
  };
};
