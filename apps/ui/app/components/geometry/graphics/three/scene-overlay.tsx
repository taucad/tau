import type { JSX, ReactNode, RefObject } from 'react';
import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createPortal, useFrame, useThree } from '@react-three/fiber';

type DepthRestore = () => void;
type DepthRestoreReference = RefObject<DepthRestore | undefined>;

const OverlayDepthContext = createContext<DepthRestoreReference | undefined>(undefined);
const overlayScenesByRoot = new WeakMap<THREE.Scene, Set<THREE.Scene>>();

/** Returns every scene rendered for a root canvas, including portal overlays. */
export const getSceneRenderRoots = (rootScene: THREE.Scene): readonly THREE.Scene[] => [
  rootScene,
  ...(overlayScenesByRoot.get(rootScene) ?? []),
];

/** Owns the one depth bridge shared by the priority-1 post owner and priority-2 overlays. */
export function OverlayDepthProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const restoreRef = useRef<DepthRestore | undefined>(undefined);
  return <OverlayDepthContext.Provider value={restoreRef}>{children}</OverlayDepthContext.Provider>;
}

/** Register the active post owner's direct-to-canvas depth restore. */
export const useOverlayDepthRestore = (restore: DepthRestore | undefined): void => {
  const restoreRef = useContext(OverlayDepthContext);
  useLayoutEffect(() => {
    if (!restoreRef) {
      return undefined;
    }
    restoreRef.current = restore;
    return () => {
      if (restoreRef.current === restore) {
        restoreRef.current = undefined;
      }
    };
  }, [restore, restoreRef]);
};

function SceneOverlayFrameLoop({
  shouldClearDepth,
  overlayScene,
  renderPriority,
}: {
  readonly shouldClearDepth: boolean;
  readonly overlayScene: THREE.Scene;
  readonly renderPriority: number;
}): ReactNode {
  const restoreRef = useContext(OverlayDepthContext);

  useFrame((state) => {
    const { gl, camera } = state;
    const previousAutoClear = gl.autoClear;
    gl.autoClear = false;
    try {
      if (shouldClearDepth) {
        gl.clearDepth();
      } else {
        // Post-processing renders colour through an offscreen target. Its owner restores
        // that frame's encoded depth directly; without post, the main pass already left
        // authoritative canvas depth and this is intentionally a no-op.
        restoreRef?.current?.();
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
