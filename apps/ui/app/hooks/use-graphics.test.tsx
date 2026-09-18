import { StrictMode, useLayoutEffect } from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { ThreeCameraRig } from '@taucad/three/camera';
import type { RenderFrame } from '@taucad/spatial';
import {
  GraphicsProvider,
  useCameraRig,
  useGraphicsCameraRigQuery,
  useRenderFrame,
  useRenderFrameRetarget,
  useSetRenderFrame,
  useViewCameraFraming,
} from '#hooks/use-graphics.js';
import {
  acquireViewCameraSession,
  getGraphicsCameraState,
  getViewCameraSession,
  hasGraphicsCameraRig,
  notifyViewCameraSession,
} from '#services/graphics-camera-registry.js';
import type { ViewCameraFraming, ViewCameraSession } from '#services/graphics-camera-registry.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

const actors: Array<ActorRefFrom<typeof graphicsMachine>> = [];

const compiledGraphics = await (async () => {
  const { transformSync } = await import('oxc-transform-react');
  const source = await readFile(new URL('use-graphics.tsx', pathToFileURL(import.meta.filename)), 'utf8');
  const compiled = transformSync('use-graphics.tsx', source, {
    lang: 'tsx',
    reactCompiler: { target: '19' },
  });
  if (compiled.fatal || compiled.errors.length > 0) {
    throw new Error(`React Compiler refused use-graphics: ${JSON.stringify(compiled.errors)}`);
  }
  const specifiers = [...compiled.code.matchAll(/^import {[^}]*} from "([^"]+)";$/gm)].map((match) => match[1]!);
  const modules = Object.fromEntries(
    await Promise.all(specifiers.map(async (specifier) => [specifier, await import(specifier)] as const)),
  );
  const linked = compiled.code
    .replaceAll(
      /^import {([^}]*)} from "([^"]+)";$/gm,
      (_match, names: string, specifier: string) =>
        `const { ${names.replaceAll(' as ', ': ')} } = __modules[${JSON.stringify(specifier)}];`,
    )
    .replaceAll(/^export /gm, '');
  // oxlint-disable-next-line no-new-func -- this pin executes the app's compiler output.
  const factory = new Function(
    '__modules',
    `${linked}\nreturn { useGraphicsCameraRigQuery, useViewCameraSession };`,
  ) as (dependencies: Record<string, unknown>) => {
    useGraphicsCameraRigQuery: () => (graphicsRef: ActorRefFrom<typeof graphicsMachine>) => boolean;
    useViewCameraSession: (graphicsRef: ActorRefFrom<typeof graphicsMachine>) => ViewCameraSession | undefined;
  };
  const compiledHooks = factory(modules);
  return {
    code: compiled.code,
    useGraphicsCameraRigQuery: compiledHooks.useGraphicsCameraRigQuery,
    useViewCameraSession: compiledHooks.useViewCameraSession,
  };
})();

const createGraphicsActor = () => {
  const actor = createActor(graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }), {
    input: {},
  });
  actor.start();
  actors.push(actor);
  return actor;
};

function RigProbe({ onRig }: { readonly onRig: (rig: ThreeCameraRig) => void }): undefined {
  const rig = useCameraRig();
  useLayoutEffect(() => {
    onRig(rig);
  }, [onRig, rig]);
  return undefined;
}

function FramingProbe({ onFraming }: { readonly onFraming: (framing: ViewCameraFraming) => void }): undefined {
  const framing = useViewCameraFraming();
  useLayoutEffect(() => {
    onFraming(framing);
  }, [framing, onFraming]);
  return undefined;
}

/** Subscribes to the camera registry store the way the chat and command surfaces do. */
function RigQueryProbe(): undefined {
  useGraphicsCameraRigQuery();
  return undefined;
}

function RenderFrameProbe({
  onFrame,
  onSet,
  onRetarget,
}: {
  readonly onFrame: (frame: RenderFrame) => void;
  readonly onSet: (set: (frame: RenderFrame) => void) => void;
  readonly onRetarget: (frame: RenderFrame) => void;
}): undefined {
  const frame = useRenderFrame();
  const set = useSetRenderFrame();
  useRenderFrameRetarget(onRetarget);
  useLayoutEffect(() => {
    onFrame(frame);
    onSet(set);
  }, [frame, onFrame, onSet, set]);
  return undefined;
}

describe('GraphicsProvider camera rig ownership', () => {
  afterEach(() => {
    for (const actor of actors.splice(0)) {
      actor.stop();
    }
  });

  it('retains both native endpoint identities through repeated zero crossings', () => {
    const graphicsActor = createGraphicsActor();
    let rig: ThreeCameraRig | undefined;
    render(
      <StrictMode>
        <GraphicsProvider graphicsRef={graphicsActor}>
          <RigProbe
            onRig={(value) => {
              rig = value;
            }}
          />
        </GraphicsProvider>
      </StrictMode>,
    );

    expect(rig).toBeDefined();
    const perspective = rig!.perspectiveCamera;
    const orthographic = rig!.orthographicCamera;
    act(() => {
      rig!.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
    });
    expect(rig!.activeCamera).toBe(orthographic);
    expect(getGraphicsCameraState(graphicsActor)?.projection.kind).toBe('orthographic');
    act(() => {
      rig!.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0.1 });
    });
    expect(rig!.activeCamera).toBe(perspective);
    act(() => {
      rig!.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
    });
    expect(rig!.activeCamera).toBe(orthographic);
    expect(hasGraphicsCameraRig(graphicsActor)).toBe(true);
  });

  it('should refresh the compiled camera-rig query when a session is created and released', async () => {
    expect(compiledGraphics.code).toContain('from "react/compiler-runtime"');
    expect(compiledGraphics.code).toMatch(/useGraphicsCameraRigQuery = \(\) => {\s*const \$ = _c\(/);
    const graphicsActor = createGraphicsActor();
    const { result } = renderHook(() => compiledGraphics.useGraphicsCameraRigQuery());
    const initialQuery = result.current;
    expect(initialQuery(graphicsActor)).toBe(false);

    act(() => {
      notifyViewCameraSession(acquireViewCameraSession(graphicsActor));
    });
    await waitFor(() => {
      expect(result.current(graphicsActor)).toBe(true);
    });
    expect(result.current).not.toBe(initialQuery);

    act(() => {
      graphicsActor.stop();
    });
    await waitFor(() => {
      expect(result.current(graphicsActor)).toBe(false);
    });
  });

  /* The React Compiler runs on this app in every real build and is off under vitest, so only the
   * compiled hook catches this one: a registry read memoised on `graphicsRef` alone hands a reader
   * that rendered before any canvas the `undefined` it saw then, for the life of the actor. The
   * write-side host is exactly that reader, and the view's camera keys were never written. */
  it('should give the compiled session hook the session that appeared after its first render', async () => {
    expect(compiledGraphics.code).toMatch(/useViewCameraSession = \(graphicsRef\) => {\s*const \$ = _c\(/);
    expect(compiledGraphics.code).toContain('useSyncExternalStore(subscribeGraphicsCameraRegistry, getSession');
    const graphicsActor = createGraphicsActor();
    const { result } = renderHook(() => compiledGraphics.useViewCameraSession(graphicsActor));
    expect(result.current).toBeUndefined();

    act(() => {
      notifyViewCameraSession(acquireViewCameraSession(graphicsActor));
    });

    await waitFor(() => {
      expect(result.current).toBe(getViewCameraSession(graphicsActor));
    });
    expect(result.current).toBeDefined();
  });

  /* Acquiring a session is a render-phase call, so publishing it to the registry's
   * `useSyncExternalStore` consumers has to wait for the commit phase; React rejects an update to a
   * component that is not the one rendering. */
  it('should publish a new session to registry consumers without updating them during render', () => {
    const graphicsActor = createGraphicsActor();
    const errors: string[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });

    try {
      const mounted = render(<RigQueryProbe />);

      mounted.rerender(
        <>
          <RigQueryProbe />
          <GraphicsProvider graphicsRef={graphicsActor}>
            <RigProbe onRig={() => undefined} />
          </GraphicsProvider>
        </>,
      );

      expect(errors.filter((message) => message.includes('Cannot update a component'))).toEqual([]);
      expect(hasGraphicsCameraRig(graphicsActor)).toBe(true);
    } finally {
      consoleError.mockRestore();
    }
  });

  /* Law 2: the graphics actor stores no copy of the field of view, so a rig built without a seed
   * reads the portable camera default rather than a value latched when the actor was spawned. */
  it('builds the rig at the portable default when the host supplies no seed', () => {
    const graphicsActor = createGraphicsActor();
    let rig: ThreeCameraRig | undefined;
    render(
      <GraphicsProvider graphicsRef={graphicsActor}>
        <RigProbe
          onRig={(value) => {
            rig = value;
          }}
        />
      </GraphicsProvider>,
    );

    expect(rig?.actorRef.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(60);
  });

  /* The prop is a seed, not a control. It follows the persisted setting, which the viewer rewrites
   * as soon as the person moves the slider -- rebuilding the rig there would drop the live camera. */
  it('keeps the committed rig when the requested field of view changes', () => {
    const graphicsActor = createGraphicsActor();
    const rigs: ThreeCameraRig[] = [];
    const onRig = (rig: ThreeCameraRig): void => {
      if (rigs.at(-1) !== rig) {
        rigs.push(rig);
      }
    };
    const mounted = render(
      <GraphicsProvider graphicsRef={graphicsActor} initialVerticalFieldOfView={45}>
        <RigProbe onRig={onRig} />
      </GraphicsProvider>,
    );

    mounted.rerender(
      <GraphicsProvider graphicsRef={graphicsActor} initialVerticalFieldOfView={20}>
        <RigProbe onRig={onRig} />
      </GraphicsProvider>,
    );

    expect(rigs).toHaveLength(1);
    expect(rigs[0]?.actorRef.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(45);
    // The rig synchronises its cameras on construction, so the seed reaches the THREE camera too.
    expect(rigs[0]?.perspectiveCamera.fov).toBe(45);
  });

  /* Law 3: the camera's owner is the graphics actor, not this mount. A StrictMode double invoke
   * acquires one session, and unmounting the provider must not take the person's camera with it. */
  it('should acquire one session in StrictMode and keep it past provider unmount', () => {
    const graphicsActor = createGraphicsActor();
    const rigs: ThreeCameraRig[] = [];
    const onRig = (rig: ThreeCameraRig): void => {
      if (rigs.at(-1) !== rig) {
        rigs.push(rig);
      }
    };
    const mounted = render(
      <StrictMode>
        <GraphicsProvider graphicsRef={graphicsActor}>
          <RigProbe onRig={onRig} />
        </GraphicsProvider>
      </StrictMode>,
    );
    expect(rigs).toHaveLength(1);
    const stop = vi.spyOn(rigs[0]!.actorRef, 'stop');

    mounted.unmount();

    expect(stop).not.toHaveBeenCalled();
    expect(hasGraphicsCameraRig(graphicsActor)).toBe(true);
    expect(getGraphicsCameraState(graphicsActor)).toBeDefined();

    act(() => {
      graphicsActor.stop();
    });

    expect(stop).toHaveBeenCalledOnce();
    expect(hasGraphicsCameraRig(graphicsActor)).toBe(false);
  });

  it('should acquire a second session when the graphics actor is replaced and release the first with its actor', () => {
    const firstActor = createGraphicsActor();
    const secondActor = createGraphicsActor();
    const rigs: ThreeCameraRig[] = [];
    const onRig = (rig: ThreeCameraRig): void => {
      if (rigs.at(-1) !== rig) {
        rigs.push(rig);
      }
    };
    const mounted = render(
      <GraphicsProvider graphicsRef={firstActor} seed={{ identity: 'file-a' }}>
        <RigProbe onRig={onRig} />
      </GraphicsProvider>,
    );
    const firstRig = rigs[0]!;
    const stop = vi.spyOn(firstRig.actorRef, 'stop');

    mounted.rerender(
      <GraphicsProvider graphicsRef={secondActor} seed={{ identity: 'file-a' }}>
        <RigProbe onRig={onRig} />
      </GraphicsProvider>,
    );

    expect(rigs).toHaveLength(2);
    expect(rigs[1]).not.toBe(firstRig);
    expect(hasGraphicsCameraRig(secondActor)).toBe(true);
    expect(stop).not.toHaveBeenCalled();
    expect(hasGraphicsCameraRig(firstActor)).toBe(true);

    act(() => {
      firstActor.stop();
    });

    expect(stop).toHaveBeenCalledOnce();
    expect(hasGraphicsCameraRig(firstActor)).toBe(false);
  });

  it('should keep one framing record per entry identity without recreating the rig', () => {
    const graphicsActor = createGraphicsActor();
    const cameraView = {
      frameId: 'tau:root',
      target: [3, 4, 5],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 12,
      perspectiveZoom: 1,
    } as const;
    let framing: ViewCameraFraming | undefined;
    let rig: ThreeCameraRig | undefined;
    const onFraming = (value: ViewCameraFraming): void => {
      framing = value;
    };
    const mounted = render(
      <GraphicsProvider graphicsRef={graphicsActor} seed={{ identity: 'file-a', camera: { cameraView } }}>
        <RigProbe
          onRig={(value) => {
            rig = value;
          }}
        />
        <FramingProbe onFraming={onFraming} />
      </GraphicsProvider>,
    );
    const firstRig = rig;

    expect(rig!.actorRef.getSnapshot().context.view).toMatchObject(cameraView);
    expect(framing).toEqual({ identity: 'file-a', pendingView: cameraView, initialized: false });

    // The canvas frames the first geometry and consumes the pose.
    framing!.initialized = true;

    mounted.rerender(
      <GraphicsProvider
        graphicsRef={graphicsActor}
        seed={{ identity: 'file-a', camera: { cameraView: { ...cameraView, verticalSpan: 99 } } }}
      >
        <RigProbe
          onRig={(value) => {
            rig = value;
          }}
        />
        <FramingProbe onFraming={onFraming} />
      </GraphicsProvider>,
    );
    expect(rig).toBe(firstRig);
    expect(framing).toEqual({ identity: 'file-a', pendingView: cameraView, initialized: true });

    mounted.rerender(
      <GraphicsProvider graphicsRef={graphicsActor} seed={{ identity: 'file-b' }}>
        <RigProbe
          onRig={(value) => {
            rig = value;
          }}
        />
        <FramingProbe onFraming={onFraming} />
      </GraphicsProvider>,
    );
    expect(rig).toBe(firstRig);
    expect(framing).toEqual({ identity: 'file-b', pendingView: undefined, initialized: false });
  });

  it('keeps sibling viewer camera views isolated', () => {
    const firstActor = createGraphicsActor();
    const secondActor = createGraphicsActor();
    const firstView = {
      frameId: 'tau:root',
      target: [3, 4, 5],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 12,
      perspectiveZoom: 1,
    } as const;
    const secondView = {
      frameId: 'tau:root',
      target: [-3, -4, -5],
      direction: [0, 1, 0],
      up: [0, 0, 1],
      verticalSpan: 24,
      perspectiveZoom: 1,
    } as const;
    const rigs = new Map<string, ThreeCameraRig>();
    const framings = new Map<string, ViewCameraFraming>();

    render(
      <>
        <GraphicsProvider graphicsRef={firstActor} seed={{ identity: 'first', camera: { cameraView: firstView } }}>
          <RigProbe onRig={(rig) => rigs.set('first', rig)} />
          <FramingProbe onFraming={(framing) => framings.set('first', framing)} />
        </GraphicsProvider>
        <GraphicsProvider graphicsRef={secondActor} seed={{ identity: 'second', camera: { cameraView: secondView } }}>
          <RigProbe onRig={(rig) => rigs.set('second', rig)} />
          <FramingProbe onFraming={(framing) => framings.set('second', framing)} />
        </GraphicsProvider>
      </>,
    );

    expect(rigs.get('first')).not.toBe(rigs.get('second'));
    expect(rigs.get('first')?.actorRef.getSnapshot().context.view).toMatchObject(firstView);
    expect(rigs.get('second')?.actorRef.getSnapshot().context.view).toMatchObject(secondView);
    expect(framings.get('first')?.pendingView).toEqual(firstView);
    expect(framings.get('second')?.pendingView).toEqual(secondView);
  });

  it('retargets one viewport scene and camera without changing its sibling', () => {
    const firstActor = createGraphicsActor();
    const secondActor = createGraphicsActor();
    const frames = new Map<string, RenderFrame>();
    const setters = new Map<string, (frame: RenderFrame) => void>();
    const retargeted: RenderFrame[] = [];
    render(
      <>
        {[
          ['first', firstActor],
          ['second', secondActor],
        ].map(([id, actor]) => (
          <GraphicsProvider key={id as string} graphicsRef={actor as ActorRefFrom<typeof graphicsMachine>}>
            <RenderFrameProbe
              onFrame={(frame) => frames.set(id as string, frame)}
              onSet={(set) => setters.set(id as string, set)}
              onRetarget={(frame) => retargeted.push(frame)}
            />
          </GraphicsProvider>
        ))}
      </>,
    );
    const next: RenderFrame = {
      anchorFrameId: 'tau:root',
      originMeters: [1e12, -2e12, 3e12],
      metersPerRenderUnit: 1e9,
    };
    act(() => setters.get('first')?.(next));

    expect(frames.get('first')).toEqual(next);
    expect(frames.get('second')).toEqual({
      anchorFrameId: 'tau:root',
      originMeters: [0, 0, 0],
      metersPerRenderUnit: 1,
    });
    expect(retargeted).toContainEqual(next);
  });
});
