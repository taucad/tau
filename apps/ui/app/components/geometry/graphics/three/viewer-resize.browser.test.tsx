import '#styles/global.css';
import 'dockview-react/dist/styles/dockview.css';
import 'allotment/dist/style.css';
import { cleanup, render } from '@testing-library/react';
import { useFrame, useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { StrictMode, useLayoutEffect, useState } from 'react';
import { createActor, createAsyncLogic } from 'xstate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, commands, userEvent } from 'vitest/browser';
import { Allotment } from '#components/panes/allotment.js';
import { Dockview } from '#components/panes/dockview.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { flushSync } from 'react-dom';
import { GraphicsProvider, useCameraRig } from '#hooks/use-graphics.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { ThreeCanvasInstance } from '#components/geometry/graphics/three/three-canvas-instance.js';

vi.mock('#hooks/use-color.js', () => ({
  useColor: () => ({ serialized: { hex: '#16aaa4' } }),
}));
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => false }));
vi.mock('#hooks/use-theme.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Matches the production Theme constants.
  Theme: { DARK: 'dark', LIGHT: 'light' },
  useTheme: () => ({ theme: 'light' }),
}));

declare module 'vitest/internal/browser' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Augment Vitest's command interface.
  interface BrowserCommands {
    recordViewerResize(backend: string, evidence: string): Promise<void>;
  }
}

const frame = async (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
const actors: Array<{ stop: () => void }> = [];
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
});

describe('rendered viewer resize', () => {
  it.each(['webgl', 'webgpu'] as const)(
    'should present each resized %s canvas before the next frame',
    async (backend) => {
      await page.viewport(1280, 800);
      const actor = createActor(
        graphicsMachine.provide({
          actors: {
            probeWebGpu: createAsyncLogic({
              run: async () => backend === 'webgpu',
            }),
          },
        }),
        { input: {} },
      ).start();
      actors.push(actor);
      let state: RootState | undefined;
      let renderedWidth = 0;
      let renders = 0;
      let renderedAspect = 0;
      let rig: ReturnType<typeof useCameraRig> | undefined;
      const Probe = (): undefined => {
        const get = useThree((value) => value.get);
        const cameraRig = useCameraRig();
        useLayoutEffect(() => {
          state = get();
          rig = cameraRig;
        }, [get, cameraRig]);
        useFrame((value) => {
          renderedWidth = value.size.width;
          renderedAspect = value.camera.projectionMatrix.elements[5] / value.camera.projectionMatrix.elements[0];
          renders += 1;
        }, 4);
        return undefined;
      };
      const view = render(
        <div data-testid='viewer-frame' style={{ width: 900, height: 550 }}>
          <GraphicsProvider graphicsRef={actor}>
            <ThreeCanvasInstance graphicsBackend={backend} onRetry={() => undefined}>
              <mesh>
                <cylinderGeometry args={[1, 0.7, 2, 24]} />
                <meshStandardMaterial color='#16aaa4' />
              </mesh>
              <Probe />
            </ThreeCanvasInstance>
          </GraphicsProvider>
        </div>,
      );
      await vi.waitFor(
        () => {
          expect(renderedWidth).toBe(900);
        },
        { timeout: 45_000 },
      );
      await frame();
      await frame();
      const root = view.getByTestId('viewer-frame');
      const renderer = state!.gl;
      const sizeSpy = vi.spyOn(renderer, 'setSize');
      const cameraBefore = rig!.actorRef.getSnapshot().context.view;
      const samples: Array<{
        expected: number;
        aspect: number;
        rendered: number;
        buffer: number;
        sizeCalls: number;
        frames: number;
        milliseconds: number;
      }> = [];
      /* oxlint-disable eslint/no-await-in-loop -- Each sample observes a distinct displayed frame during one drag. */
      for (const width of [880, 840, 800, 760, 720, 680, 640, 600, 660, 720, 780, 840, 900]) {
        await frame();
        const start = performance.now();
        const beforeRenders = renders;
        const beforeSizes = sizeSpy.mock.calls.length;
        root.style.width = `${width}px`;
        await frame();
        samples.push({
          expected: width,
          aspect: renderedAspect,
          rendered: renderedWidth,
          buffer: renderer.domElement.width / renderer.getPixelRatio(),
          sizeCalls: sizeSpy.mock.calls.length - beforeSizes,
          frames: renders - beforeRenders,
          milliseconds: performance.now() - start,
        });
      }
      /* oxlint-enable eslint/no-await-in-loop */
      await commands.recordViewerResize(
        backend,
        JSON.stringify(
          {
            backend,
            userAgent: navigator.userAgent,
            dpr: renderer.getPixelRatio(),
            samples,
          },
          null,
          2,
        ),
      );
      expect(samples.filter((sample) => sample.rendered !== sample.expected)).toEqual([]);
      expect(samples.filter((sample) => sample.buffer !== sample.expected)).toEqual([]);
      expect(samples.every((sample) => sample.sizeCalls <= 1)).toBe(true);
      for (const sample of samples) {
        expect(sample.aspect).toBeCloseTo(sample.expected / 550, 6);
      }
      const cameraAfter = rig!.actorRef.getSnapshot().context.view;
      expect(cameraAfter.target).toEqual(cameraBefore.target);
      expect(cameraAfter.verticalSpan).toBe(cameraBefore.verticalSpan);
      root.style.display = 'none';
      await frame();
      await frame();
      root.style.width = '700px';
      root.style.display = '';
      await frame();
      await frame();
      expect(renderedWidth).toBe(700);
      expect(view.container.querySelector('canvas')).toBe(renderer.domElement);
      await page.screenshot({
        path: `../../../../../../../out/test-results/vitest-browser/viewer-resize/${backend}-resized.png`,
      });
      sizeSpy.mockRestore();
    },
  );
  it.each(['webgl', 'webgpu'] as const)(
    'should settle nested sidebar and workbench changes with a retained %s viewer',
    async (backend) => {
      await page.viewport(1280, 800);
      const actor = createActor(
        graphicsMachine.provide({
          actors: {
            probeWebGpu: createAsyncLogic({
              run: async () => backend === 'webgpu',
            }),
          },
        }),
        { input: {} },
      ).start();
      actors.push(actor);
      let renderedWidth = 0;
      let state: RootState | undefined;
      const Probe = (): undefined => {
        const get = useThree((value) => value.get);
        useLayoutEffect(() => {
          state = get();
        }, [get]);
        useFrame((value) => {
          renderedWidth = value.size.width;
        }, 4);
        return undefined;
      };
      const Viewer = (): React.JSX.Element => (
        <GraphicsProvider graphicsRef={actor}>
          <ThreeCanvasInstance graphicsBackend={backend} enableGizmo onRetry={() => undefined}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[1, 0.7, 2, 32]} />
              <meshStandardMaterial color='#16aaa4' />
            </mesh>
            <Probe />
          </ThreeCanvasInstance>
        </GraphicsProvider>
      );
      const components = { viewer: Viewer };
      const Fixture = (): React.JSX.Element => {
        const [workbench, setWorkbench] = useState(true);
        return (
          <TooltipProvider>
            <button
              type='button'
              onClick={() => {
                setWorkbench(!workbench);
              }}
            >
              Toggle workbench
            </button>
            <div data-testid='pane-frame' style={{ width: 1200, height: 650 }}>
              <Allotment paneLabels={['Sidebar', 'Viewer', 'Workbench']} proportionalLayout={false}>
                <Allotment.Pane preferredSize={200} minSize={120}>
                  <div className='p-4'>Projects</div>
                </Allotment.Pane>
                <Allotment.Pane minSize={250}>
                  <Dockview
                    components={components}
                    onReady={({ api }) => {
                      api.addPanel({
                        id: 'model',
                        component: 'viewer',
                        title: 'Resize regression model',
                      });
                    }}
                  />
                </Allotment.Pane>
                <Allotment.Pane preferredSize={300} minSize={180} visible={workbench}>
                  <div className='p-4'>Parameters</div>
                </Allotment.Pane>
              </Allotment>
            </div>
          </TooltipProvider>
        );
      };
      const view = render(
        <StrictMode>
          <Fixture />
        </StrictMode>,
      );
      await vi.waitFor(
        () => {
          expect(renderedWidth).toBeGreaterThan(0);
        },
        { timeout: 45_000 },
      );
      await frame();
      await frame();
      const root = view.getByTestId('pane-frame');
      const canvas = state!.gl.domElement;
      const check = (): void => {
        const expected = canvas.getBoundingClientRect().width;
        expect(renderedWidth).toBeCloseTo(expected, 0);
        expect(canvas.width / state!.gl.getPixelRatio()).toBeCloseTo(expected, 0);
        expect(root.querySelector('canvas')).toBe(canvas);
      };
      /* oxlint-disable eslint/no-await-in-loop -- Sample each prepaint resize before applying the next. */
      for (const width of [1100, 1000, 1150, 950, 1200]) {
        await frame();
        root.style.width = `${width}px`;
        await frame();
        check();
      }
      for (let index = 0; index < 2; index += 1) {
        await frame();
        flushSync(() => {
          view.getByRole('button', { name: 'Toggle workbench' }).click();
        });
        await frame();
        check();
      }
      for (const name of ['Resize Sidebar and Viewer panes', 'Resize Viewer and Workbench panes']) {
        const sash = await view.findByRole('separator', { name });
        const rectangle = sash.getBoundingClientRect();
        const before = renderedWidth;
        await userEvent.dragAndDrop(sash, root, {
          sourcePosition: { x: rectangle.width / 2, y: 120 },
          targetPosition: {
            x: rectangle.left - root.getBoundingClientRect().left - 60,
            y: 120,
          },
        });
        await frame();
        check();
        expect(renderedWidth).not.toBe(before);
      }
      /* oxlint-enable eslint/no-await-in-loop */
      await page.screenshot({
        path: `../../../../../../../out/test-results/vitest-browser/viewer-resize/${backend}-panes.png`,
      });
    },
  );
});
