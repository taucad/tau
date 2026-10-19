// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { resolveSectionPieces } from '#graphics/section-cuts.js';
import type { SectionCut, SectionHalfSpace, SectionPiece } from '#graphics/section-cuts.js';
import { getSectionCapDepthBias } from '#graphics/three/materials/section-cap-depth-state.js';
import { sectionStencilBits } from '#graphics/three/materials/section-stencil.material.js';
import { sectionCapOpenChainWidthScale } from '#graphics/three/overlay-colors.constants.js';
import {
  boxCrossesSectionRegion,
  createSectionStencilCaps,
  resolveSectionExitHalfSpaces,
  writeSectionPlanePolygon,
} from '#graphics/three/utils/section-stencil-caps.js';
import type {
  SectionStencilCapFrame,
  SectionStencilCapRenderer,
  SectionStencilCapSource,
} from '#graphics/three/utils/section-stencil-caps.js';

const plane = (normal: readonly [number, number, number], constant: number): SectionHalfSpace => ({
  normal,
  constant,
});

const unitBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));

/** The area of a convex polygon in 3D, from its fan. */
const polygonArea = (points: readonly THREE.Vector3[], count: number): number => {
  const total = new THREE.Vector3();
  for (let index = 1; index < count - 1; index++) {
    total.add(
      new THREE.Vector3()
        .subVectors(points[index]!, points[0]!)
        .cross(new THREE.Vector3().subVectors(points[index + 1]!, points[0]!)),
    );
  }
  return total.length() / 2;
};

describe('writeSectionPlanePolygon', () => {
  it('should cut a box into the polygon where the plane meets it, ordered around it', () => {
    const points: THREE.Vector3[] = [];
    const count = writeSectionPlanePolygon(plane([0, 0, 1], 0.5), unitBox, [], points);
    expect(count).toBe(4);
    expect(polygonArea(points, count)).toBeCloseTo(1);
    // A diagonal plane cuts a hexagon from the cube.
    const diagonal = writeSectionPlanePolygon(
      plane([1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)], Math.sqrt(3) / 2),
      unitBox,
      [],
      points,
    );
    expect(diagonal).toBe(6);
    expect(polygonArea(points, diagonal)).toBeCloseTo((3 * Math.sqrt(3)) / 4);
  });

  it('should keep only what a face bound holds, and nothing where the plane misses the box', () => {
    const points: THREE.Vector3[] = [];
    const count = writeSectionPlanePolygon(plane([0, 0, 1], 0.5), unitBox, [plane([1, 0, 0], 0.25)], points);
    expect(polygonArea(points, count)).toBeCloseTo(0.75);
    expect(writeSectionPlanePolygon(plane([0, 0, 1], 2), unitBox, [], points)).toBe(0);
    expect(writeSectionPlanePolygon(plane([0, 0, 1], 0.5), unitBox, [plane([1, 0, 0], 2)], points)).toBe(0);
  });
});

describe('boxCrossesSectionRegion', () => {
  it('should count a box only where it meets the removed region without lying wholly inside it', () => {
    expect(boxCrossesSectionRegion(unitBox, [plane([0, 0, 1], 0.5)])).toBe(true);
    // Wholly kept, wholly removed.
    expect(boxCrossesSectionRegion(unitBox, [plane([0, 0, 1], 2)])).toBe(false);
    expect(boxCrossesSectionRegion(unitBox, [plane([0, 0, 1], -1)])).toBe(false);
    // A wedge that holds part of the box, and one that misses it.
    expect(boxCrossesSectionRegion(unitBox, [plane([1, 0, 0], 0.5), plane([0, 1, 0], 0.5)])).toBe(true);
    expect(boxCrossesSectionRegion(unitBox, [plane([1, 0, 0], 2), plane([0, 1, 0], 0.5)])).toBe(false);
  });
});

describe('resolveSectionExitHalfSpaces', () => {
  const wedge: SectionPiece = {
    cutId: 'wedge',
    halfSpaces: [plane([1, 0, 0], 0), plane([0, 1, 0], 0)],
    faces: [],
  };

  it('should take the half-spaces whose removed side holds a perspective eye', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(5, -5, 5);
    camera.updateMatrixWorld();
    expect(resolveSectionExitHalfSpaces(camera, wedge)).toEqual([wedge.halfSpaces[0]]);
    camera.position.set(5, 5, 5);
    camera.updateMatrixWorld();
    expect(resolveSectionExitHalfSpaces(camera, wedge)).toEqual(wedge.halfSpaces);
  });

  it('should take the half-spaces an orthographic camera looks out of, wherever it stands', () => {
    const camera = new THREE.OrthographicCamera();
    camera.position.set(-50, -50, 0);
    camera.lookAt(-60, -40, 0);
    camera.updateMatrixWorld();
    expect(resolveSectionExitHalfSpaces(camera, wedge)).toEqual([wedge.halfSpaces[0]]);
  });
});

type RecordedFrame = Readonly<{ objects: THREE.Mesh[]; autoClear: boolean }>;

const createRecordingRenderer = (): SectionStencilCapRenderer & { frames: RecordedFrame[] } => {
  const frames: RecordedFrame[] = [];
  const renderer = {
    autoClear: true,
    frames,
    render: vi.fn((scene: THREE.Object3D) => {
      const objects: THREE.Mesh[] = [];
      scene.traverse((object) => {
        if ((object as Partial<THREE.Mesh>).isMesh === true && object.visible) {
          objects.push(object as THREE.Mesh);
        }
      });
      frames.push({ objects, autoClear: renderer.autoClear });
    }),
  };
  return renderer;
};

// oxlint-disable-next-line max-params -- A test source names its key, owner, geometry and offset.
const createSource = (
  key: string,
  ownerKey: string,
  geometry: THREE.BufferGeometry,
  x = 0,
): SectionStencilCapSource => {
  const mesh = new THREE.Mesh(geometry);
  mesh.position.set(x, 0, 0);
  mesh.updateMatrixWorld();
  return { key, ownerKey, meshes: [mesh], tintHex: 0x33_66_99, edgeHex: 0 };
};

const createCamera = (): THREE.Camera => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0.5, -2, 6);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
};

const planeCut: SectionCut = { id: 'plane', kind: 'plane', plane: 'xy', offset: 0.1, isFlipped: false };

const frameFor = (
  sources: readonly SectionStencilCapSource[],
  pieces = resolveSectionPieces([planeCut]),
): SectionStencilCapFrame => ({
  camera: createCamera(),
  pieces,
  sources,
  stripes: { stripeFrequency: 2, stripeWidth: 0.25 },
  outlineWidthPixels: 1,
  viewportHeightPixels: 600,
});

describe('createSectionStencilCaps', () => {
  it('should count, cap and outline each crossing source with draws that do not depend on its triangles', () => {
    for (const backend of ['webgl', 'webgpu'] as const) {
      const statsBySegments = [8, 256].map((segments) => {
        const caps = createSectionStencilCaps(backend);
        const renderer = createRecordingRenderer();
        const stats = caps.render(
          renderer,
          frameFor([
            createSource('a', 'owner-a', new THREE.SphereGeometry(1, segments, segments / 2)),
            createSource('b', 'owner-b', new THREE.SphereGeometry(1, segments, segments / 2), 1.5),
          ]),
        );
        caps.dispose();
        return { ...stats, submitMilliseconds: 0 };
      });
      expect(statsBySegments[0]).toEqual(statsBySegments[1]);
      expect(statsBySegments[0]).toMatchObject({
        pieceCount: 1,
        drawnPieceCount: 1,
        crossingSourceCount: 2,
        // The later owner's bounds meet the earlier one's.
        overlapCandidateSourceCount: 1,
        outlineSourceCount: 2,
        // Back and front counts per source, then one outline draw each.
        meshDrawCount: 6,
      });
    }
  });

  it('should draw each pass after the one before it, in one render without clearing the frame', () => {
    const caps = createSectionStencilCaps('webgl');
    const renderer = createRecordingRenderer();
    caps.render(renderer, frameFor([createSource('a', 'owner-a', new THREE.BoxGeometry())]));
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.frames[0]!.autoClear).toBe(false);
    expect(renderer.autoClear).toBe(true);
    const passes = renderer.frames[0]!.objects.toSorted((left, right) => left.renderOrder - right.renderOrder).map(
      ({ material }) => (material as THREE.Material).name,
    );
    expect(passes).toEqual([
      'TauSectionStencil:clear-all',
      'TauSectionStencil:count-back',
      'TauSectionStencil:count-front',
      'TauSectionCap',
      'TauSectionStencil:clear-count',
      'TauSectionCapOutline',
    ]);
    caps.dispose();
  });

  it('should reuse its pooled draws frame after frame, and let go of a source that left', () => {
    const caps = createSectionStencilCaps('webgl');
    const renderer = createRecordingRenderer();
    const first = createSource('a', 'owner-a', new THREE.BoxGeometry());
    const second = createSource('b', 'owner-b', new THREE.BoxGeometry(), 0.5);
    caps.render(renderer, frameFor([first, second]));
    const objectCount = caps.scene.children.length;
    const materials = new Set(caps.scene.children.map((child) => (child as THREE.Mesh).material));
    for (let index = 0; index < 3; index++) {
      caps.render(renderer, frameFor([first, second]));
    }
    expect(caps.scene.children.length).toBe(objectCount);
    expect(new Set(caps.scene.children.map((child) => (child as THREE.Mesh).material))).toEqual(materials);
    caps.render(renderer, frameFor([first]));
    const held = caps.scene.children.map((child) => (child as THREE.Mesh).geometry);
    expect(held).not.toContain(second.meshes[0]!.geometry);
    const disposed = [...materials].map((material) => vi.spyOn(material as THREE.Material, 'dispose'));
    caps.dispose();
    expect(disposed.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(caps.scene.children).toHaveLength(0);
  });

  it('should draw nothing for a cut seen from its kept side, or one that misses every source', () => {
    const caps = createSectionStencilCaps('webgl');
    const renderer = createRecordingRenderer();
    const source = createSource('a', 'owner-a', new THREE.BoxGeometry());
    const flipped = resolveSectionPieces([{ ...planeCut, isFlipped: true }]);
    expect(caps.render(renderer, frameFor([source], flipped))).toMatchObject({ drawnPieceCount: 0 });
    const missing = resolveSectionPieces([{ ...planeCut, offset: 5 }]);
    expect(caps.render(renderer, frameFor([source], missing))).toMatchObject({ drawnPieceCount: 0, meshDrawCount: 0 });
    caps.dispose();
  });

  it('should cap with the shared surface depth bias and the cap stencil test', () => {
    const caps = createSectionStencilCaps('webgl');
    const renderer = createRecordingRenderer();
    caps.render(renderer, frameFor([createSource('a', 'owner-a', new THREE.BoxGeometry())]));
    const cap = renderer.frames[0]!.objects.find(
      ({ material }) => (material as THREE.Material).name === 'TauSectionCap',
    )!.material as THREE.ShaderMaterial;
    const shader = {
      vertexShader: cap.vertexShader,
      fragmentShader: cap.fragmentShader,
      uniforms: { ...cap.uniforms },
    };
    cap.onBeforeCompile(shader as unknown as WebGLProgramParametersWithUniforms, {} as unknown as WebGLRenderer);
    expect(shader.fragmentShader).toContain('gl_FragDepth + tauSurfaceDepthOffset');
    expect(shader.fragmentShader).toContain('tauSectionRemoved( vTauSectionWorld )');
    expect(cap.polygonOffsetFactor).toBe(getSectionCapDepthBias('webgl').polygonOffsetFactor);
    expect([cap.depthTest, cap.depthWrite, cap.stencilWrite, cap.stencilFunc, cap.stencilFuncMask]).toEqual([
      true,
      true,
      true,
      THREE.NotEqualStencilFunc,
      sectionStencilBits.count,
    ]);
    caps.dispose();
  });

  it('should outline open chains at the open-chain scale of the ordinary outline width', () => {
    const caps = createSectionStencilCaps('webgl');
    const renderer = createRecordingRenderer();
    const open = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    );
    const source: SectionStencilCapSource = {
      ...createSource('a', 'owner-a', new THREE.BoxGeometry()),
      loops: {
        matrix: new THREE.Matrix4(),
        bySlot: new Map([[0, { fill: new THREE.BufferGeometry(), open, closedLoopCount: 0, openChainCount: 1 }]]),
      },
    };
    caps.render(renderer, { ...frameFor([source]), outlineWidthPixels: 1.5 });
    const outlineWidth = (mesh: THREE.Mesh | undefined): number =>
      ((mesh!.material as THREE.ShaderMaterial).uniforms['tauOutline']!.value as THREE.Vector2).y;
    const { objects } = renderer.frames[0]!;
    const outlines = objects.filter(({ material }) => (material as THREE.Material).name === 'TauSectionCapOutline');
    expect(outlineWidth(outlines.find(({ geometry }) => geometry !== open))).toBe(1.5);
    expect(outlineWidth(outlines.find(({ geometry }) => geometry === open))).toBe(1.5 * sectionCapOpenChainWidthScale);
    expect(sectionCapOpenChainWidthScale).toBe(2);
    caps.dispose();
  });
});
