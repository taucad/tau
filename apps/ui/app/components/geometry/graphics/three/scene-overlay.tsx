import type { JSX, ReactNode, RefObject } from 'react';
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { WebGLRenderTarget } from 'three';
import { createPortal, useFrame, useThree } from '@react-three/fiber';

/**
 * Write the frame's authoritative depth into `target`, or the canvas when it is omitted.
 *
 * The post owner holds that depth in its own offscreen attachment, so anything that needs to
 * depth-test against the finished frame — overlays on the canvas, the emphasis coverage mask in
 * its own target — asks the owner to stamp it rather than re-rasterising the scene.
 */
export type DepthRestore = (target?: WebGLRenderTarget) => void;
type DepthRestoreReference = RefObject<{ restore?: DepthRestore; canvasRestored: boolean }>;

const OverlayDepthContext = createContext<DepthRestoreReference | undefined>(undefined);
const overlayScenesByRoot = new WeakMap<THREE.Scene, Set<THREE.Scene>>();

/** Returns every scene rendered for a root canvas, including portal overlays. */
export const getSceneRenderRoots = (rootScene: THREE.Scene): readonly THREE.Scene[] => [
  rootScene,
  ...(overlayScenesByRoot.get(rootScene) ?? []),
];

/** Owns the one depth bridge shared by the priority-1 post owner and priority-2 overlays. */
export function OverlayDepthProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const restoreRef = useRef<{ restore?: DepthRestore; canvasRestored: boolean }>({ canvasRestored: false });
  useFrame(() => {
    restoreRef.current.canvasRestored = false;
  }, 0);
  return <OverlayDepthContext.Provider value={restoreRef}>{children}</OverlayDepthContext.Provider>;
}

/** Register the active post owner's depth restore. */
export const useOverlayDepthRestore = (restore: DepthRestore | undefined): void => {
  const restoreRef = useContext(OverlayDepthContext);
  useLayoutEffect(() => {
    if (!restoreRef) {
      return undefined;
    }
    restoreRef.current.restore = restore;
    restoreRef.current.canvasRestored = false;
    return () => {
      if (restoreRef.current.restore === restore) {
        restoreRef.current.restore = undefined;
        restoreRef.current.canvasRestored = false;
      }
    };
  }, [restore, restoreRef]);
};

/**
 * Stamp the frame's depth into a pass's own render target.
 *
 * Returns a stable no-op while no post owner is registered: the main pass then already left
 * authoritative canvas depth, and a pass with its own target keeps whatever it cleared to.
 */
export function useOverlayDepthRestorer(): DepthRestore {
  const restoreRef = useContext(OverlayDepthContext);
  return useCallback(
    (target?: WebGLRenderTarget): void => {
      const depth = restoreRef?.current;
      if (!depth?.restore || (!target && depth.canvasRestored)) {
        return;
      }
      depth.restore(target);
      if (!target && restoreRef) {
        restoreRef.current.canvasRestored = true;
      }
    },
    [restoreRef],
  );
}

function SceneOverlayFrameLoop({
  shouldClearDepth,
  overlayScene,
  renderPriority,
}: {
  readonly shouldClearDepth: boolean;
  readonly overlayScene: THREE.Scene;
  readonly renderPriority: number;
}): ReactNode {
  const restoreDepth = useOverlayDepthRestorer();
  const restoreRef = useContext(OverlayDepthContext);

  useFrame((state) => {
    const { gl, camera } = state;
    const previousAutoClear = gl.autoClear;
    gl.autoClear = false;
    try {
      if (shouldClearDepth) {
        gl.clearDepth();
        if (restoreRef) {
          restoreRef.current.canvasRestored = false;
        }
      } else {
        // Post-processing renders colour through an offscreen target. Its owner restores
        // that frame's encoded depth directly; without post, the main pass already left
        // authoritative canvas depth and this is intentionally a no-op.
        restoreDepth();
      }
      gl.render(overlayScene, camera);
    } finally {
      gl.autoClear = previousAutoClear;
    }
  }, renderPriority);

  return null;
}

type SceneOverlayProperties = Readonly<{
  children: ReactNode;
  /** Begin the overlay pass with empty depth so its contents occlude only each other. */
  shouldClearDepth?: boolean;
  /** Omit the positive-priority subscriber when no overlay geometry exists. */
  overlayActive: boolean;
  renderPriority?: number;
}>;

/** Render grid and axes once, after the main scene/post pass, against its authoritative depth. */
export function SceneOverlay({
  children,
  shouldClearDepth = false,
  overlayActive,
  renderPriority = 2,
}: SceneOverlayProperties): JSX.Element {
  const rootScene = useThree((state) => state.scene);
  const overlayScene = useMemo(() => new THREE.Scene(), []);
  useLayoutEffect(() => {
    const scenes = overlayScenesByRoot.get(rootScene) ?? new Set<THREE.Scene>();
    scenes.add(overlayScene);
    overlayScenesByRoot.set(rootScene, scenes);
    return () => {
      scenes.delete(overlayScene);
      if (scenes.size === 0) {
        overlayScenesByRoot.delete(rootScene);
      }
    };
  }, [overlayScene, rootScene]);

  return (
    <>
      {createPortal(children, overlayScene)}
      {overlayActive ? (
        <SceneOverlayFrameLoop
          shouldClearDepth={shouldClearDepth}
          overlayScene={overlayScene}
          renderPriority={renderPriority}
        />
      ) : null}
    </>
  );
}
