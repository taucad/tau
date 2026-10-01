/** Physical plate stand-ins and grain, shared by both printer families. @module */
import * as THREE from 'three';

/** A schematic pierced outline preserves model identity while the BRep asset loads. */
export const plateStandInOutline = (mini: boolean): THREE.Shape => {
  const outline = new THREE.Shape();
  const points = mini
    ? [
        [-2, -2],
        [49.35, -2],
        [56.48, -9.132],
        [180, -9.132],
        [182, -7.132],
        [182, 180],
        [180, 182],
        [148.1, 182],
        [142.101, 187.999],
        [119.099, 187.999],
        [113.1, 182],
        [66.9, 182],
        [60.901, 187.999],
        [37.899, 187.999],
        [31.9, 182],
        [-2, 182],
      ]
    : [
        [-0.5, 5.5],
        [5.5, -0.5],
        [70, -0.5],
        [82, -10.5],
        [250.5, -10.5],
        [256.5, -4.5],
        [256.5, 250.5],
        [250.5, 256.5],
        [162, 256.5],
        [154, 264.5],
        [102, 264.5],
        [94, 256.5],
        [5.5, 256.5],
        [-0.5, 250.5],
      ];
  outline.moveTo(points[0]![0]!, points[0]![1]!);
  for (const [x, y] of points.slice(1)) {
    outline.lineTo(x!, y!);
  }
  outline.closePath();
  const holes = mini
    ? [
        [
          [162.264, -2.814],
          [167.52, -2.814],
          [171.632, -6.932],
          [162.264, -6.932],
        ],
        [
          [170.432, -2.814],
          [179.8, -2.814],
          [179.8, -6.932],
          [174.55, -6.932],
        ],
      ]
    : [
        [
          [223.5, -1],
          [232.5, -1],
          [238.5, -7],
          [223.5, -7],
        ],
        [
          [236, -1],
          [249, -1],
          [249, -7],
          [242, -7],
        ],
        [
          [106.75, 257],
          [149.25, 257],
          [149.25, 258.4],
          [106.75, 258.4],
        ],
      ];
  for (const points of holes) {
    const hole = new THREE.Path();
    hole.moveTo(points[0]![0]!, points[0]![1]!);
    for (const [x, y] of points.slice(1)) {
      hole.lineTo(x!, y!);
    }
    hole.closePath();
    outline.holes.push(hole);
  }
  if (mini) {
    const hole = new THREE.Path();
    hole.absarc(57.958, -5.566, 1.5, 0, Math.PI * 2, false);
    outline.holes.push(hole);
  }
  return outline;
};

/** Instance-owned, deterministic PEI normal map: one 8 mm tile, independent of plate size. */
export const applyPlateGrain = (mesh: THREE.Mesh): THREE.DataTexture => {
  const resolution = 128;
  const pixels = new Uint8Array(resolution * resolution * 4);
  let seed = 613;
  for (let index = 0; index < pixels.length; index += 4) {
    seed = (seed * 16_807) % 2_147_483_647;
    pixels[index] = 128 + (Math.floor(seed / 16_777_216) % 65) - 32;
    seed = (seed * 16_807) % 2_147_483_647;
    pixels[index + 1] = 128 + (Math.floor(seed / 16_777_216) % 65) - 32;
    pixels[index + 2] = 255;
    pixels[index + 3] = 255;
  }
  const normal = new THREE.DataTexture(pixels, resolution, resolution);
  normal.wrapS = THREE.RepeatWrapping;
  normal.wrapT = THREE.RepeatWrapping;
  normal.magFilter = THREE.LinearFilter;
  normal.minFilter = THREE.LinearMipmapLinearFilter;
  normal.generateMipmaps = true;
  normal.needsUpdate = true;
  const positions = mesh.geometry.getAttribute('position');
  const uv = new Float32Array(positions.count * 2);
  // Called after the owning mesh's transform is composed, before scene mounting.
  mesh.updateWorldMatrix(true, false);
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
    uv[index * 2] = point.x / 8;
    uv[index * 2 + 1] = point.y / 8;
  }
  mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const material = mesh.material as THREE.MeshStandardMaterial;
  material.normalMap = normal;
  material.normalScale.set(0.18, 0.18);
  material.needsUpdate = true;
  return normal;
};
