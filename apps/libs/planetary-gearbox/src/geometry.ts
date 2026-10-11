import * as THREE from 'three';
import { partPose } from '#kinematics.js';
import type { GearboxAssembly } from '#load.js';

/**
 * One authored part as a Three.js geometry with its authored finish.
 * @public
 */
export type PartGeometry = {
  readonly name: string;
  readonly color: string;
  readonly metalness: number;
  readonly roughness: number;
  /** Centred on the part's own axis; place it with {@link partPose}. */
  readonly geometry: THREE.BufferGeometry;
  /** Whether morph target 0 holds the `faceWidth` 18 offsets. */
  readonly hasVariant: boolean;
};

/**
 * Build one exclusively owned geometry per authored part. Geometry is authored in place, so each
 * part is moved onto its own axis (planets and bushings turn about theirs); morph target 0, when
 * present, is the relative `faceWidth` 14 → 18 offset. The caller owns and disposes the geometries.
 * @param assembly - Result of `loadAssembly`.
 * @returns The 34 parts in manifest order.
 * @public
 */
export const createPartGeometries = ({ manifest, binary, variant, offsets }: GearboxAssembly): PartGeometry[] =>
  manifest.meshes.map((part, index) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(binary, part.position.offset, part.position.length).slice(), 3),
    );
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array(binary, part.normal.offset, part.normal.length), 3),
    );
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(binary, part.index.offset, part.index.length), 1));
    const range = variant.meshes[index]?.dz;
    if (range) {
      const dz = new Float32Array(offsets, range.offset, range.length);
      const morph = new Float32Array(range.length * 3);
      for (const [vertex, value] of dz.entries()) {
        morph[vertex * 3 + 2] = value;
      }
      geometry.morphAttributes.position = [new THREE.BufferAttribute(morph, 3)];
      geometry.morphTargetsRelative = true;
    }
    const home = partPose(part.name, 0);
    geometry.translate(-home.x, -home.y, 0);
    return {
      name: part.name,
      color: part.color,
      metalness: part.metalness,
      roughness: part.roughness,
      geometry,
      hasVariant: Boolean(range),
    };
  });
