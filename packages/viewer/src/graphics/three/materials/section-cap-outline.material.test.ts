// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { resolveSectionFaces, resolveSectionPieces } from '#graphics/section-cuts.js';
import type { SectionCut } from '#graphics/section-cuts.js';
import { createSectionCapOutlineNodeMaterial } from '#graphics/three/materials/section-cap-outline.node.js';
import {
  createSectionCapOutlineFaces,
  createSectionCapOutlineMaterial,
  maxSectionCapOutlineFaces,
  resolveSectionCapOutlineColor,
  writeSectionCapOutlineCamera,
  writeSectionCapOutlineFaces,
} from '#graphics/three/materials/section-cap-outline.material.js';
import { gltfEdgeHoverColor } from '#graphics/three/overlay-colors.constants.js';
import { serialiseStrippedTslGraph } from '#graphics/three/utils/tsl-node-graph-snapshot.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));

const cutaway: SectionCut = { id: 'cutaway', kind: 'revolution', axis: 'z', origin: [1, 2, 3], start: 20, sweep: 90 };
const plane: SectionCut = { id: 'plane', kind: 'plane', plane: 'xy', offset: 0.5, isFlipped: false };

describe('section cap outline', () => {
  it('should write each face plane with its one bound, and a bound that holds everywhere for a plane cut', () => {
    const faces = createSectionCapOutlineFaces();
    const pieces = resolveSectionPieces([plane, cutaway]);
    writeSectionCapOutlineFaces(faces, resolveSectionFaces(pieces), 2);
    expect(faces.settings.toArray()).toEqual([3, 2]);
    expect(faces.planes[0]!.toArray()).toEqual([0, 0, 1, 0.5]);
    expect(faces.bounds[0]!.toArray()).toEqual([0, 0, 0, -1]);
    const [, start] = resolveSectionFaces(pieces);
    expect(faces.bounds[1]!.toArray()).toEqual([...start!.bounds[0]!.normal, start!.bounds[0]!.constant]);
    expect(() => {
      writeSectionCapOutlineFaces(
        faces,
        Array.from({ length: maxSectionCapOutlineFaces + 1 }, () => start!),
        1,
      );
    }).toThrow(RangeError);
  });

  it('should size a pixel from the projection for either camera', () => {
    const faces = createSectionCapOutlineFaces();
    const perspective = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
    perspective.position.set(1, 2, 3);
    perspective.updateMatrixWorld();
    writeSectionCapOutlineCamera(faces, perspective, 200);
    // The tangent of 45° is 1: a pixel is 2 / 200 world units per unit of depth.
    expect(faces.eye.toArray().map((value) => Number(value.toFixed(6)))).toEqual([1, 2, 3, 0.01]);
    expect(faces.forward.w).toBe(0);
    const orthographic = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
    orthographic.updateMatrixWorld();
    writeSectionCapOutlineCamera(faces, orthographic, 200);
    expect(faces.eye.w).toBeCloseTo(8 / 200);
    expect(faces.forward.toArray()).toEqual([-0, -0, -1, 1]);
  });

  it('should take the emphasis colour of the component that was cut', () => {
    expect(resolveSectionCapOutlineColor('none', 0x12_34_56)).toBe(0x12_34_56);
    expect(resolveSectionCapOutlineColor('hover', 0x12_34_56)).toBe(gltfEdgeHoverColor);
  });

  it('should compile the outline band after the clipping chunks and discard off the band', () => {
    const material = createSectionCapOutlineMaterial(createSectionCapOutlineFaces(), 0xff_00_00);
    expect(material.fragmentShader.split('#include <clipping_planes_fragment>')).toHaveLength(2);
    expect(material.vertexShader.split('#include <clipping_planes_vertex>')).toHaveLength(2);
    expect(material.fragmentShader).toContain('if ( tauCoverage <= 0.0 ) discard;');
    // The pixel's footprint inside the line width, in screen pixels at any wall angle.
    expect(material.fragmentShader).toContain(
      'clamp( min( tauPixels + 0.5, tauOutline.y ) - max( tauPixels - 0.5, 0.0 ), 0.0, 1.0 )',
    );
    // A wall seen from inside, through the cut, draws at the plane so the cap does not hide its line.
    expect(material.fragmentShader).toContain('if ( ! gl_FrontFacing && tauAlong < 0.0 )');
    expect(material.fragmentShader).toContain('gl_FragDepth = tauDepth;');
    expect([material.depthTest, material.depthWrite, material.side]).toEqual([true, false, THREE.DoubleSide]);
    // Blended at its coverage, yet drawn in the opaque pass after the caps.
    expect([material.transparent, material.blending]).toEqual([false, THREE.CustomBlending]);
  });

  it('matches stable stripped section cap outline node material JSON snapshot', async () => {
    const material = createSectionCapOutlineNodeMaterial(createSectionCapOutlineFaces(), 0xff_00_00);
    await expect(serialiseStrippedTslGraph(material.toJSON())).toMatchFileSnapshot(
      join(currentDirectory, '__shader-snapshots__', 'section-cap-outline-node-material.json'),
    );
  });
});
