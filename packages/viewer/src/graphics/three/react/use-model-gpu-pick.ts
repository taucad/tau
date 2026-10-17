import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { Mesh, Raycaster } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import type { SectionClip } from '#graphics/three/materials/section-clip.js';
import { createModelGpuPicker } from '#graphics/three/utils/model-gpu-pick.js';
import type { ModelGpuPicker, ModelPickResult } from '#graphics/three/utils/model-gpu-pick.js';
import { createRafCoalescer } from '#graphics/three/utils/raf-coalescer.js';

/** After the main scene pass (priority 1), so the meshes' world matrices are the ones just drawn. */
const modelPickFramePriority = 1.5;

export type ModelGpuPick = Readonly<{
  /** Answers a model ray from the GPU pick; `unavailable` asks the caller to use the trees. */
  pick: (raycaster: Raycaster) => ModelPickResult;
  /**
   * Resolves the last pointer event again, through R3F's own `events.update()`, once per frame however many callers
   * ask: a pending answer becomes a live event, with every suppression and occlusion check it would have had.
   */
  replay: () => void;
}>;

/**
 * The viewer's GPU model pick: one picker per renderer and section clip, fed after every drawn frame, which answers
 * the model's rays synchronously from its last read-back pass and replays the pointer once a pending answer lands.
 */
export function useModelGpuPick({
  getMeshes,
  sectionClip,
}: Readonly<{
  getMeshes: () => readonly Mesh[];
  sectionClip: SectionClip | undefined;
}>): ModelGpuPick {
  const state = useThree();
  const { gl } = state;
  const getStateRef = useRef<(() => RootState) | undefined>(state.get);
  const pickerRef = useRef<ModelGpuPicker | undefined>(undefined);
  const getMeshesRef = useRef(getMeshes);
  useLayoutEffect(() => {
    getStateRef.current = state.get;
    getMeshesRef.current = getMeshes;
  }, [getMeshes, state.get]);
  const replayCoalescer = useMemo(
    () =>
      createRafCoalescer<true>(() => {
        getStateRef.current?.().events.update?.();
      }),
    [],
  );

  useEffect(() => {
    const picker = createModelGpuPicker({
      renderer: gl,
      sectionClip,
      onLanded: () => {
        replayCoalescer.schedule(true);
      },
    });
    pickerRef.current = picker;
    return () => {
      picker.dispose();
      if (pickerRef.current === picker) {
        pickerRef.current = undefined;
      }
    };
  }, [gl, replayCoalescer, sectionClip]);

  useEffect(
    () => () => {
      replayCoalescer.cancel();
    },
    [replayCoalescer],
  );

  useFrame((frame) => {
    pickerRef.current?.frame({
      camera: frame.camera,
      width: frame.size.width,
      height: frame.size.height,
      meshes: getMeshesRef.current(),
    });
  }, modelPickFramePriority);

  const pick = useCallback(
    (raycaster: Raycaster): ModelPickResult => pickerRef.current?.pick(raycaster) ?? { status: 'unavailable' },
    [],
  );
  const replay = useCallback(() => {
    replayCoalescer.schedule(true);
  }, [replayCoalescer]);
  return useMemo(() => ({ pick, replay }), [pick, replay]);
}
