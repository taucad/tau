import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import type { JSX, ReactNode } from 'react';
import { createContext, useContext, useReducer, useEffect, useRef, useMemo, useCallback } from 'react';
import type { BuilderWorkerInterface } from './replicad/replicad-builder.worker';
import BuilderWorker from './replicad/replicad-builder.worker?worker';
import { debounce } from '@/utils/functions.js';
import { useConsole } from '@/hooks/use-console.js';

// Combine related state
type CadState = {
  code: string;
  parameters: Record<string, unknown>;
  defaultParameters: Record<string, unknown> | undefined;
  error?: string;
  isComputing: boolean;
  isBuffering: boolean;
  mesh?: {
    edges: unknown;
    faces: unknown;
    color?: string;
    opacity?: number;
  };
};

type ReplicadAction =
  | { type: 'SET_CODE'; payload: string }
  | { type: 'SET_PARAMETERS'; payload: Record<string, unknown> }
  | { type: 'SET_DEFAULT_PARAMETERS'; payload: Record<string, unknown> }
  | { type: 'SET_STATUS'; payload: { error?: string; isComputing?: boolean; isBuffering?: boolean } }
  | { type: 'SET_MESH'; payload: CadState['mesh'] };

const initialState: CadState = {
  code: '',
  parameters: {},
  defaultParameters: undefined,
  isComputing: false,
  isBuffering: false,
  mesh: undefined,
};

function useReplicadWorker() {
  const { log } = useConsole({ defaultOrigin: { component: 'Replicad' } });
  const wrappedWorkerReference = useRef<Remote<BuilderWorkerInterface> | undefined>(undefined);
  const workerReference = useRef<Worker | undefined>(undefined);
  const workerInitializationId = useRef<number>(0);

  const initWorker = useCallback(async (withExceptions = false) => {
    const initId = ++workerInitializationId.current;
    const startTime = performance.now();
    log.debug(`Initializing worker (id: ${initId})`);

    if (wrappedWorkerReference.current) {
      const endTime = performance.now();
      log.debug(`Using existing worker (id: ${initId}). Check took ${endTime - startTime}ms`);

      try {
        // Ensure the worker is still responsive with a ready check
        const readyResult = await wrappedWorkerReference.current.ready();

        if (readyResult) {
          // Worker is responsive and ready
          return wrappedWorkerReference.current;
        }

        // Worker ready check failed - terminate and recreate
        log.debug('Worker responded but not ready, recreating worker');
        terminateWorker();
      } catch (error) {
        // Worker is unresponsive or threw an error - terminate and recreate
        log.debug('Worker unresponsive during ready check, recreating worker', {
          data: error instanceof Error ? error.message : String(error),
        });
        terminateWorker();
      }
    }

    // Create a new worker
    log.debug('Creating new worker');
    workerReference.current = new BuilderWorker();
    wrappedWorkerReference.current = wrap<BuilderWorkerInterface>(workerReference.current);

    try {
      const readyStartTime = performance.now();

      // Initialize with the specified exceptions mode
      log.debug(`Initializing OpenCascade with ${withExceptions ? 'exceptions' : 'normal'} mode`);
      await wrappedWorkerReference.current.initialize(withExceptions);

      const endTime = performance.now();
      log.debug(
        `New worker ready (id: ${initId}). Initialization took ${endTime - startTime}ms, ready took ${endTime - readyStartTime}ms`,
      );
    } catch (error) {
      log.error(`Worker initialization failed (id: ${initId})`, {
        data: error instanceof Error ? error.message : String(error),
      });
      wrappedWorkerReference.current = undefined;
      throw error;
    }

    return wrappedWorkerReference.current;
  }, []);

  const terminateWorker = useCallback(() => {
    log.debug(`Terminating worker (id: ${workerInitializationId.current})`);

    if (workerReference.current) {
      try {
        workerReference.current.terminate();
        log.debug('Terminated worker');
      } catch (error) {
        log.error('Error terminating worker', {
          data: error instanceof Error ? error.message : String(error),
        });
      } finally {
        wrappedWorkerReference.current = undefined;
        workerReference.current = undefined;
      }
    }
  }, []);

  return { initWorker, terminateWorker };
}

function cadReducer(state: CadState, action: ReplicadAction): CadState {
  switch (action.type) {
    case 'SET_CODE': {
      return { ...state, code: action.payload };
    }

    case 'SET_PARAMETERS': {
      return { ...state, parameters: action.payload };
    }

    case 'SET_DEFAULT_PARAMETERS': {
      return { ...state, defaultParameters: action.payload };
    }

    case 'SET_STATUS': {
      return { ...state, ...action.payload };
    }

    case 'SET_MESH': {
      return { ...state, mesh: action.payload };
    }
  }
}

const CadContext = createContext<
  | {
      mesh: { edges: unknown; faces: unknown; color?: string } | undefined;
      status: {
        isComputing: boolean;
        isBuffering: boolean;
        error?: string;
      };
      downloadStl: () => Promise<Blob>;
      setCode: (code: string) => void;
      setParameters: (parameters: Record<string, unknown>) => void;
      defaultParameters: Record<string, unknown>;
    }
  | undefined
>(undefined);

/**
 * Provider component for CAD functionality
 * @param children - React children
 * @param withExceptions - Whether to initialize OpenCascade with exceptions mode (default: false)
 * @param evaluateDebounceTime - The debounce time for the evaluation function (default: 0)
 */
export function CadProvider({
  children,
  withExceptions = false,
  evaluateDebounceTime = 0,
}: {
  readonly children: ReactNode;
  readonly withExceptions?: boolean;
  readonly evaluateDebounceTime?: number;
}): JSX.Element {
  const [state, dispatch] = useReducer(cadReducer, initialState);
  const { initWorker, terminateWorker } = useReplicadWorker();
  const { log } = useConsole({ defaultOrigin: { component: 'CAD' } });
  const workerInitializationPromise = useRef<Promise<Remote<BuilderWorkerInterface> | undefined> | undefined>(
    undefined,
  );

  // Centralized worker initialization function to avoid multiple initializations
  const getOrInitWorker = useCallback(async () => {
    if (workerInitializationPromise.current) {
      log.debug('Reusing existing worker initialization promise');

      try {
        return await workerInitializationPromise.current;
      } catch (error) {
        // Only reset if this exact promise failed
        log.error('Existing worker initialization failed, creating new one', {
          data: error instanceof Error ? error.message : String(error),
        });
        workerInitializationPromise.current = undefined;
      }
    }

    log.debug('Creating new worker initialization promise');
    const initPromise = initWorker(withExceptions);
    workerInitializationPromise.current = initPromise;

    try {
      return await initPromise;
    } catch (error) {
      // Only reset if this exact promise failed
      if (workerInitializationPromise.current === initPromise) {
        workerInitializationPromise.current = undefined;
      }

      throw error;
    }
  }, [initWorker, withExceptions]);

  // Memoize the evaluation function
  const evaluateCode = useCallback(
    async (code: string, parameters: Record<string, unknown>) => {
      const evalStartTime = performance.now();
      const worker = await getOrInitWorker();
      const workerInitTime = performance.now();
      log.debug(`Worker initialization took ${workerInitTime - evalStartTime}ms`);

      if (!worker || !code) return;

      const loadDefaultParameters = async (code: string) => {
        try {
          const defaultParameters = await worker.extractDefaultParametersFromCode(code);
          dispatch({ type: 'SET_DEFAULT_PARAMETERS', payload: defaultParameters });
          log.debug('Loaded default parameters', { data: defaultParameters });

          return defaultParameters;
        } catch (error) {
          log.error('Failed to load default parameters', {
            data: error instanceof Error ? error.message : String(error),
          });
        }
      };

      try {
        dispatch({ type: 'SET_STATUS', payload: { isComputing: true, error: undefined } });
        const defaultParameters = await loadDefaultParameters(code);
        const mergedParameters = { ...defaultParameters, ...parameters };
        log.debug('Building shape');

        const buildStartTime = performance.now();
        const result = await worker.buildShapesFromCode(code, mergedParameters);
        const buildEndTime = performance.now();
        log.debug(`Shape building took ${buildEndTime - buildStartTime}ms`);

        if ('error' in result) {
          throw new Error(result.message);
        }

        const firstShape = result[0];
        if (!firstShape || firstShape.error) {
          log.error('Failed to build shape', { data: firstShape?.error });
          throw new Error(firstShape?.error || 'Failed to generate shape');
        }

        const processingStartTime = performance.now();
        log.debug('Built shape');
        dispatch({
          type: 'SET_MESH',
          payload: {
            faces: firstShape.mesh,
            edges: firstShape.edges,
            color: firstShape.color,
            opacity: firstShape.opacity,
          },
        });
        const processingEndTime = performance.now();
        log.debug(`Mesh processing and dispatch took ${processingEndTime - processingStartTime}ms`);
        log.debug(`Total evaluation time: ${processingEndTime - evalStartTime}ms`);
      } catch (error) {
        log.error('Failed to build shape', { data: error instanceof Error ? error.message : String(error) });
        dispatch({
          type: 'SET_STATUS',
          payload: { error: error instanceof Error ? error.message : String(error) },
        });
      } finally {
        dispatch({ type: 'SET_STATUS', payload: { isComputing: false, isBuffering: false } });
      }
    },
    [getOrInitWorker],
  );

  // Create stable debounced evaluation function
  const debouncedEvaluate = useMemo(
    () =>
      debounce((code: string, parameters: Record<string, unknown>) => {
        dispatch({ type: 'SET_STATUS', payload: { isBuffering: false } });

        log.debug('Evaluating code after debounce');

        void evaluateCode(code, parameters);
      }, evaluateDebounceTime),
    [evaluateCode],
  );

  // Effect to handle code/parameter changes
  useEffect(() => {
    const debounceStartTime = performance.now();
    log.debug(`Starting debounce at ${debounceStartTime}ms`);
    dispatch({ type: 'SET_STATUS', payload: { isBuffering: true } });
    void debouncedEvaluate(state.code, state.parameters);
  }, [state.code, state.parameters, debouncedEvaluate]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      log.debug('Unmounting ReplicadProvider, terminating worker');
      workerInitializationPromise.current = undefined;
      terminateWorker();
    };
  }, [terminateWorker]);

  const value = useMemo(
    () => ({
      mesh: state.mesh,
      status: {
        isComputing: state.isComputing,
        isBuffering: state.isBuffering,
        error: state.error,
      },
      async downloadStl() {
        const worker = await getOrInitWorker();
        if (!worker) throw new Error('Worker not found');
        const result = await worker.exportShape('stl');
        return result[0].blob;
      },
      setCode(code: string) {
        dispatch({ type: 'SET_CODE', payload: code });
      },
      setParameters(parameters: Record<string, unknown>) {
        dispatch({ type: 'SET_PARAMETERS', payload: parameters });
      },
      defaultParameters: state.defaultParameters ?? {},
    }),
    [state.mesh, state.isComputing, state.isBuffering, state.error, state.defaultParameters, getOrInitWorker],
  );

  return <CadContext.Provider value={value}>{children}</CadContext.Provider>;
}

export function useReplicad() {
  const context = useContext(CadContext);
  if (!context) {
    throw new Error('useReplicad must be used within a ReplicadProvider');
  }

  return context;
}
