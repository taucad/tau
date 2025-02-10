import { useEffect, useRef, useState, useCallback } from 'react';
import { wrap, type Remote } from 'comlink';
import { useReplicad } from './replicad-context';
import BuilderWorker from './replicad-builder.worker?worker';
import type { BuilderWorkerInterface } from './replicad-builder.worker';
import { debounce } from '@/utils/functions';

export function useReplicadCode() {
  const { state, dispatch } = useReplicad();
  const [isBuffering, setIsBuffering] = useState(false);
  const workerReference = useRef<Remote<BuilderWorkerInterface> | undefined>(undefined);

  useEffect(() => {
    async function init() {
      const worker = new BuilderWorker();
      workerReference.current = wrap<BuilderWorkerInterface>(worker);
      await workerReference.current.ready();
    }
    init();
    return () => {
      console.log('terminating worker');
      if (workerReference.current) {
        const currentWorker = workerReference.current;
        if ('terminate' in currentWorker) {
          (currentWorker as unknown as Worker).terminate();
        }
        workerReference.current = undefined;
      }
    };
  }, []);

  // Store the evaluation function in a ref with explicit parameters
  const evaluateCodeReference = useCallback(
    async (code: string, parameters: Record<string, string | number | boolean>) => {
      const worker = workerReference.current;
      if (!worker || !code) return;
      try {
        dispatch({ type: 'SET_COMPUTING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: undefined });

        const result = await worker.buildShapesFromCode(code, parameters);
        if ('error' in result) {
          throw new Error(result.message);
        }

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
    },
    [dispatch],
  );

  // Create a single debounced function instance that persists
  const debouncedEvaluateReference = useRef<ReturnType<typeof debounce>>(
    debounce((code: string, parameters: Record<string, string | number | boolean>) => {
      setIsBuffering(false);
      evaluateCodeReference(code, parameters);
    }, 300),
  );

  // Effect to handle code and parameter changes
  useEffect(() => {
    const worker = workerReference.current;
    if (!worker || !state.code) return;

    // Set buffering state to true when debounce starts
    setIsBuffering(true);
    // Call the debounced evaluation with current code and parameters
    debouncedEvaluateReference.current(state.code, state.parameters);
  }, [state.code, state.parameters]);

  // Separate effect just for loading default parameters on code change
  useEffect(() => {
    const worker = workerReference.current;
    if (!worker || !state.code) return;

    const loadDefaultParameters = async () => {
      try {
        const defaultParameters = await worker.extractDefaultParametersFromCode(state.code);
        console.log('default parameters', defaultParameters);
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

  const setCode = (code: string) => {
    dispatch({ type: 'SET_CODE', payload: code });
  };

  const setParameters = (key: string, value: string | number | boolean) => {
    dispatch({ type: 'UPDATE_PARAMETER', payload: { key, value } });
  };

  return {
    isComputing: state.isComputing,
    isBuffering,
    error: state.error,
    mesh: state.mesh,
    code: state.code,
    parameters: state.parameters,
    downloadSTL,
    setCode,
    setParameters,
  };
}
