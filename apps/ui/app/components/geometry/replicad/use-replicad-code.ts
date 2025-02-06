import { useEffect, useRef } from 'react';
import { wrap, type Remote } from 'comlink';
import { useReplicad } from './context';
import BuilderWorker from './builder.worker?worker';
import type { BuilderWorkerInterface } from './builder.worker';

export function useReplicadCode() {
  const { state, dispatch } = useReplicad();
  const workerReference = useRef<Remote<BuilderWorkerInterface> | undefined>(undefined);

  useEffect(() => {
    async function init() {
      const worker = new BuilderWorker();
      workerReference.current = wrap<BuilderWorkerInterface>(worker);
      await workerReference.current.ready();
    }
    init();
    return () => {
      if (workerReference.current) {
        const currentWorker = workerReference.current;
        if ('terminate' in currentWorker) {
          (currentWorker as unknown as Worker).terminate();
        }
        workerReference.current = undefined;
      }
    };
  }, []);

  useEffect(() => {
    const worker = workerReference.current;
    if (!worker || !state.code) return;

    const evaluateCode = async () => {
      try {
        dispatch({ type: 'SET_COMPUTING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: undefined });

        // Extract default parameters when code changes
        const defaultParameters = await worker.extractDefaultParametersFromCode(state.code);
        if (Object.keys(state.parameters).length === 0) {
          dispatch({ type: 'SET_PARAMETERS', payload: defaultParameters });
        }

        const result = await worker.buildShapesFromCode(state.code, state.parameters);
        if ('error' in result) {
          throw new Error(result.message);
        }

        // The result is an array of rendered shapes
        const firstShape = result[0];
        if (!firstShape || firstShape.error) {
          throw new Error(firstShape?.error || 'Failed to generate shape');
        }

        dispatch({
          type: 'SET_MESH',
          payload: {
            faces: firstShape.mesh,
            edges: firstShape.edges,
          },
        });
      } catch (error) {
        dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : String(error) });
      } finally {
        dispatch({ type: 'SET_COMPUTING', payload: false });
      }
    };

    evaluateCode();
  }, [state.code, state.parameters, dispatch]);

  useEffect(() => {
    const worker = workerReference.current;
    if (!worker || !state.code) return;

    const loadDefaultParameters = async () => {
      try {
        const defaultParameters = await worker.extractDefaultParametersFromCode(state.code);
        dispatch({ type: 'SET_PARAMETERS', payload: defaultParameters });
      } catch (error) {
        console.error('Failed to load default parameters:', error);
      }
    };

    loadDefaultParameters();
  }, [state.code, dispatch]);

  const downloadSTL = async () => {
    const worker = workerReference.current;
    if (!worker) return;
    const result = await worker.exportShape('stl');
    return result[0].blob;
  };

  return {
    isComputing: state.isComputing,
    error: state.error,
    mesh: state.mesh,
    downloadSTL,
  };
}
