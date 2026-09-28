import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import * as ActualThree from 'three';
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { advance, createRoot, extend } from '@react-three/fiber';
import type { RootState, RootStore } from '@react-three/fiber';
import { mock } from 'vitest-mock-extended';
import { resolveSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import type { SectionPiece } from '#components/geometry/graphics/section-cuts.js';
import { getSectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import type { SectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import { SectionClippingGroup } from '#components/geometry/graphics/three/react/section-clipping-group.js';
import { ThreeGraphicsBackendProvider } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { sceneTag, sceneTagData } from '#components/geometry/graphics/three/utils/scene-tags.js';

const onePlane = resolveSectionPieces([{ id: 'plane', kind: 'plane', plane: 'xy', offset: 0, isFlipped: false }]);
const twoCutawaysAndPlane = resolveSectionPieces([
  { id: 'a', kind: 'revolution', axis: 'z', origin: [0, 0, 0], start: 0, sweep: 90 },
  { id: 'b', kind: 'revolution', axis: 'x', origin: [0, 0, 0], start: 180, sweep: 60 },
  { id: 'plane', kind: 'plane', plane: 'yz', offset: 0.2, isFlipped: true },
]);

type Harness = Readonly<{
  clip: () => SectionClip;
  state: () => RootState;
  store: () => RootStore;
  inner: ActualThree.Group;
  surfaces: readonly ActualThree.Material[];
  lines: readonly ActualThree.Material[];
  points: readonly ActualThree.Material[];
  helper: ActualThree.Material;
  render: (pieces: readonly SectionPiece[]) => Promise<void>;
  frame: () => void;
  unmount: () => void;
}>;

const mounted: Harness[] = [];

const mountClippingGroup = async (backend: 'webgl' | 'webgpu'): Promise<Harness> => {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const root = createRoot(canvas);
  const gl = mock<WebGLRenderer>();
  gl.domElement = canvas;
  gl.localClippingEnabled = false;
  await act(async () => {
    await root.configure({
      camera: new ActualThree.PerspectiveCamera(50, 800 / 600, 0.1, 100),
      frameloop: 'never',
      gl,
      size: { height: 600, left: 0, top: 0, width: 800 },
    });
  });

  const surfaces = [new ActualThree.MeshStandardMaterial(), new ActualThree.MeshMatcapMaterial()];
  const lines = [
    new ActualThree.LineBasicMaterial(),
    new ActualThree.MeshBasicMaterial(),
    new ActualThree.LineBasicMaterial(),
  ];
  const points = [new ActualThree.PointsMaterial()];
  const helper = new ActualThree.MeshBasicMaterial();
  const inner = new ActualThree.Group();
  const helperMesh = new ActualThree.Mesh(new ActualThree.BoxGeometry(), helper);
  helperMesh.userData = sceneTagData(sceneTag.sectionViewHelper);
  inner.add(
    new ActualThree.Mesh(new ActualThree.BoxGeometry(), surfaces),
    new ActualThree.LineSegments(new ActualThree.BufferGeometry(), lines[0]),
    Object.assign(new LineSegments2(), { material: lines[1] }),
    new ActualThree.Line(new ActualThree.BufferGeometry(), lines[2]),
    new ActualThree.Points(new ActualThree.BufferGeometry(), points[0]),
    helperMesh,
  );
  const innerRef = { current: inner };
  // The stage builds its model element once; a cut step re-renders only the section components.
  const model = <primitive object={inner} />;
  let store: RootStore | undefined;

  const render = async (pieces: readonly SectionPiece[]): Promise<void> => {
    await act(async () => {
      store = root.render(
        <ThreeGraphicsBackendProvider value={backend}>
          <SectionClippingGroup innerRef={innerRef} pieces={pieces}>
            {model}
          </SectionClippingGroup>
        </ThreeGraphicsBackendProvider>,
      );
    });
  };
  await render([]);

  const harness: Harness = {
    clip: () => getSectionClip(store!.getState().scene, backend),
    state: () => store!.getState(),
    store: () => store!,
    inner,
    surfaces,
    lines,
    points,
    helper,
    render,
    frame() {
      advance(performance.now());
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      canvas.remove();
    },
  };
  mounted.push(harness);
  return harness;
};

/** Whether `material` compiles in this very clip: its mask on WebGPU, its uniforms on WebGL. */
const carriesClip = (material: ActualThree.Material, clip: SectionClip): boolean => {
  if (clip.backend === 'webgpu') {
    return (material as { maskNode?: unknown }).maskNode === clip.mask;
  }
  const shader = {
    uniforms: {},
    vertexShader: '#include <clipping_planes_pars_vertex>\n#include <clipping_planes_vertex>',
    fragmentShader: '#include <clipping_planes_pars_fragment>\n#include <clipping_planes_fragment>',
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, mock<WebGLRenderer>());
  return shader.uniforms['tauSectionClip'] === clip.uniforms.tauSectionClip;
};

describe('SectionClippingGroup', () => {
  beforeAll(() => {
    extend(ActualThree as unknown as Parameters<typeof extend>[0]);
  });

  afterEach(() => {
    for (const harness of mounted.splice(0)) {
      harness.unmount();
    }
  });

  it.each(['webgl', 'webgpu'] as const)(
    'should compile the clip into every model surface, line and point on %s, and skip section helpers',
    async (backend) => {
      const harness = await mountClippingGroup(backend);
      const clip = harness.clip();

      for (const material of [...harness.surfaces, ...harness.lines, ...harness.points]) {
        expect(carriesClip(material, clip), material.type).toBe(true);
        // Built-in clipping is not used, so no renderer needs `localClippingEnabled`.
        expect(material.clippingPlanes).toBeNull();
      }
      expect(carriesClip(harness.helper, clip)).toBe(false);
      expect(harness.state().gl.localClippingEnabled).toBeFalsy();
    },
  );

  it.each(['webgl', 'webgpu'] as const)(
    'should write each cut list into the same arrays on the next frame without touching a material on %s',
    async (backend) => {
      const harness = await mountClippingGroup(backend);
      const clip = harness.clip();
      harness.frame();
      const versions = [...harness.surfaces, ...harness.lines, ...harness.points].map((material) => material.version);
      const vectors = [...clip.first, ...clip.second];

      const expectWritten = async (pieces: readonly SectionPiece[], count: number): Promise<void> => {
        await harness.render(pieces);
        harness.frame();

        expect(clip.settings.x).toBe(count);
        expect([...clip.first, ...clip.second].every((vector, index) => vector === vectors[index])).toBe(true);
        expect([...harness.surfaces, ...harness.lines, ...harness.points].map((material) => material.version)).toEqual(
          versions,
        );
      };
      await expectWritten(onePlane, 1);
      await expectWritten(twoCutawaysAndPlane, 3);
      await expectWritten([], 0);
    },
  );

  it('should return early on a frame whose pieces are unchanged', async () => {
    const harness = await mountClippingGroup('webgl');
    await harness.render(onePlane);
    harness.frame();
    const write = vi.spyOn(harness.clip().settings, 'set');

    harness.frame();
    harness.frame();
    expect(write).not.toHaveBeenCalled();

    await harness.render(twoCutawaysAndPlane);
    harness.frame();
    harness.frame();
    expect(write).toHaveBeenCalledOnce();
  });

  it('should request a frame when the pieces change', async () => {
    const harness = await mountClippingGroup('webgl');
    const invalidate = vi.fn();
    act(() => {
      harness.store().setState({ invalidate });
    });
    invalidate.mockClear();

    await harness.render(onePlane);

    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('should not re-traverse the model when only the pieces change', async () => {
    const harness = await mountClippingGroup('webgl');
    const traverse = vi.spyOn(harness.inner, 'traverse');

    await harness.render(onePlane);
    await harness.render(twoCutawaysAndPlane);

    expect(traverse).not.toHaveBeenCalled();
  });

  it('should keep each viewer to its own clip', async () => {
    const first = await mountClippingGroup('webgl');
    const second = await mountClippingGroup('webgl');

    await first.render(twoCutawaysAndPlane);
    first.frame();
    second.frame();

    expect(first.clip()).not.toBe(second.clip());
    expect(first.clip().settings.x).toBe(3);
    expect(second.clip().settings.x).toBe(0);
    expect(carriesClip(second.surfaces[0]!, first.clip())).toBe(false);
  });
});
