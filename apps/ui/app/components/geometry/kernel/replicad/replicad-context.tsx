/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO: fix typings
import { type Remote, wrap } from 'comlink';
import { createContext, useContext, useReducer, ReactNode, useEffect, useRef, useMemo, useCallback } from 'react';
import { BuilderWorkerInterface } from './replicad-builder.worker';
import BuilderWorker from './replicad-builder.worker?worker';
import { debounce } from '@/utils/functions';
import { useConsole } from '@/hooks/use-console';

// Preload the worker module as early as possible
let preloadedWorker: Worker | undefined;
let preloadingStarted = false;

// Function to preload the worker in the background
function preloadWorker() {
  if (preloadingStarted) return;
  preloadingStarted = true;

  console.log('Preloading Replicad worker in background');
  try {
    // Create worker but don't wrap it yet (avoid overhead)
    preloadedWorker = new BuilderWorker();

    // Call the ready method but don't await it - just let it initialize in background
    const readyPromise = wrap<BuilderWorkerInterface>(preloadedWorker).ready();
    readyPromise.catch((error) => {
      console.error('Background worker preload failed', error);
      // If preloading fails, clean up so we can try again
      if (preloadedWorker) {
        preloadedWorker.terminate();
        preloadedWorker = undefined;
      }
      preloadingStarted = false;
    });
  } catch (error) {
    console.error('Failed to preload worker', error);
    preloadingStarted = false;
  }
}

// Start preloading right away
if (typeof globalThis !== 'undefined') {
  // Use requestIdleCallback if available, or setTimeout as fallback
  if ('requestIdleCallback' in globalThis) {
    (globalThis as any).requestIdleCallback(() => preloadWorker(), { timeout: 1000 });
  } else {
    setTimeout(preloadWorker, 100);
  }
}

// Combine related state
interface ReplicadState {
  code: string;
  parameters: Record<string, any>;
  defaultParameters: Record<string, any> | undefined;
  error?: string;
  isComputing: boolean;
  isBuffering: boolean;
  mesh?: {
    edges: any;

    faces: any;
  };
}

type ReplicadAction =
  | { type: 'SET_CODE'; payload: string }
  | { type: 'SET_PARAMETERS'; payload: Record<string, any> }
  | { type: 'SET_DEFAULT_PARAMETERS'; payload: Record<string, any> }
  | { type: 'SET_STATUS'; payload: { error?: string; isComputing?: boolean; isBuffering?: boolean } }
  | { type: 'SET_MESH'; payload: ReplicadState['mesh'] };

const initialState: ReplicadState = {
  code: '',
  parameters: {},
  defaultParameters: undefined,
  isComputing: false,
  isBuffering: false,
  mesh: undefined,
};

const DEBOUNCE_TIME = 300;

function useReplicadWorker() {
  const { log } = useConsole({ defaultOrigin: { component: 'Replicad' } });
  const workerReference = useRef<Remote<BuilderWorkerInterface> | undefined>(undefined);
  const workerInitializationId = useRef<number>(0);
  const lastActivityTime = useRef<number>(Date.now());
  const cleanupTimer = useRef<NodeJS.Timeout | undefined>(undefined);

  // Auto-cleanup idle workers
  const WORKER_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  const updateActivityTimestamp = useCallback(() => {
    lastActivityTime.current = Date.now();
  }, []);

  // Setup idle timer to clean up resources
  const setupIdleCleanup = useCallback(() => {
    if (cleanupTimer.current) {
      clearTimeout(cleanupTimer.current);
    }

    cleanupTimer.current = setTimeout(() => {
      const idleTime = Date.now() - lastActivityTime.current;

      if (idleTime >= WORKER_IDLE_TIMEOUT && workerReference.current) {
        log.debug('Worker idle timeout reached, terminating inactive worker');
        terminateWorker();
      } else if (workerReference.current) {
        // Reset timer if worker is still needed
        setupIdleCleanup();
      }
    }, WORKER_IDLE_TIMEOUT);
  }, []);

  const initWorker = useCallback(async () => {
    const initId = ++workerInitializationId.current;
    const startTime = performance.now();
    log.debug(`Initializing worker (id: ${initId})`);
    console.log(`Initializing worker (id: ${initId})`);

    updateActivityTimestamp();

    if (workerReference.current) {
      const endTime = performance.now();
      log.debug(`Using existing worker (id: ${initId}). Check took ${endTime - startTime}ms`);
      console.log(`Using existing worker (id: ${initId}). Check took ${endTime - startTime}ms`);

      try {
        // Ensure the worker is still responsive with a quick ready check
        const readyResult = await Promise.race([
          workerReference.current.ready(),
          new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('Worker ready check timeout')), 100)),
        ]);

        if (readyResult) {
          // Worker is responsive and ready
          return workerReference.current;
        } else {
          // Worker ready check failed but didn't timeout - terminate and recreate
          log.debug('Worker responded but not ready, recreating worker');
          terminateWorker();
        }
      } catch (error) {
        // Worker is unresponsive or threw an error - terminate and recreate
        log.debug('Worker unresponsive during ready check, recreating worker', {
          data: error instanceof Error ? error.message : String(error),
        });
        terminateWorker();
      }
    }

    // Use the preloaded worker if available
    if (preloadedWorker) {
      log.debug('Using preloaded worker');
      const worker = preloadedWorker;
      preloadedWorker = undefined;
      preloadingStarted = false;

      workerReference.current = wrap<BuilderWorkerInterface>(worker);

      try {
        const readyStartTime = performance.now();
        await workerReference.current.ready();
        const endTime = performance.now();
        log.debug(
          `Preloaded worker ready (id: ${initId}). Init took ${endTime - startTime}ms, ready took ${endTime - readyStartTime}ms`,
        );
        console.log(
          `Preloaded worker ready (id: ${initId}). Init took ${endTime - startTime}ms, ready took ${endTime - readyStartTime}ms`,
        );

        // Set up idle cleanup
        setupIdleCleanup();
        return workerReference.current;
      } catch (error) {
        log.error(`Preloaded worker initialization failed (id: ${initId})`, {
          data: error instanceof Error ? error.message : String(error),
        });
        console.error(`Preloaded worker initialization failed (id: ${initId})`, error);
        workerReference.current = undefined;
        // Fall through to create a new worker
      }
    }

    // Create a new worker if preloaded one isn't available or failed
    log.debug('Creating new worker (no preload available)');
    const worker = new BuilderWorker();
    workerReference.current = wrap<BuilderWorkerInterface>(worker);

    try {
      const readyStartTime = performance.now();
      await workerReference.current.ready();
      const endTime = performance.now();
      log.debug(
        `New worker ready (id: ${initId}). Initialization took ${endTime - startTime}ms, ready took ${endTime - readyStartTime}ms`,
      );
      console.log(
        `New worker ready (id: ${initId}). Initialization took ${endTime - startTime}ms, ready took ${endTime - readyStartTime}ms`,
      );

      // Set up idle cleanup when worker is successfully initialized
      setupIdleCleanup();

      // Start preloading the next worker
      preloadWorker();
    } catch (error) {
      log.error(`Worker initialization failed (id: ${initId})`, {
        data: error instanceof Error ? error.message : String(error),
      });
      console.error(`Worker initialization failed (id: ${initId})`, error);
      workerReference.current = undefined;
      throw error;
    }

    return workerReference.current;
  }, [setupIdleCleanup, updateActivityTimestamp]);

  const terminateWorker = useCallback(() => {
    log.debug(`Terminating worker (id: ${workerInitializationId.current})`);
    console.log(`Terminating worker (id: ${workerInitializationId.current})`);

    if (cleanupTimer.current) {
      clearTimeout(cleanupTimer.current);
    }

    if (workerReference.current && 'terminate' in workerReference.current) {
      (workerReference.current as unknown as Worker).terminate();
      workerReference.current = undefined;
    }
  }, []);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (cleanupTimer.current) {
        clearTimeout(cleanupTimer.current);
      }
    };
  }, []);

  return { initWorker, terminateWorker, updateActivityTimestamp };
}

function replicadReducer(state: ReplicadState, action: ReplicadAction): ReplicadState {
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
    default: {
      return state;
    }
  }
}

const ReplicadContext = createContext<
  | {
      mesh: { edges: any; faces: any } | undefined;
      status: {
        isComputing: boolean;
        isBuffering: boolean;
        error?: string;
      };
      downloadSTL: () => Promise<Blob>;
      setCode: (code: string) => void;
      setParameters: (parameters: Record<string, any>) => void;
      defaultParameters: Record<string, any>;
    }
  | undefined
>(undefined);

export function ReplicadProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(replicadReducer, initialState);
  const { initWorker, terminateWorker, updateActivityTimestamp } = useReplicadWorker();
  const { log } = useConsole({ defaultOrigin: { component: 'CAD' } });
  const workerInitializationPromise = useRef<Promise<Remote<BuilderWorkerInterface> | undefined> | undefined>(
    undefined,
  );

  // Start preloading the worker immediately when the context is first created
  useEffect(() => {
    // Use a short timeout to let the app initialize first
    const preloadTimer = setTimeout(() => {
      log.debug('Preloading worker in background');
      getOrInitWorker().catch((error) => {
        log.error('Background worker preload failed', {
          data: error instanceof Error ? error.message : String(error),
        });
      });
    }, 100);

    return () => clearTimeout(preloadTimer);
  }, []);

  // Centralized worker initialization function to avoid multiple initializations
  const getOrInitWorker = useCallback(async () => {
    updateActivityTimestamp();

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
    const initPromise = initWorker();
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
  }, [initWorker, updateActivityTimestamp]);

  // Memoize the evaluation function
  const evaluateCode = useCallback(
    async (code: string, parameters: Record<string, any>) => {
      const evalStartTime = performance.now();
      const worker = await getOrInitWorker();
      const workerInitTime = performance.now();
      log.debug(`Worker initialization took ${workerInitTime - evalStartTime}ms`);

      if (!worker || !code) return;

      try {
        log.debug('Building shape');
        dispatch({ type: 'SET_STATUS', payload: { isComputing: true, error: undefined } });

        const buildStartTime = performance.now();
        const result = await worker.buildShapesFromCode(code, parameters);
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
          payload: { faces: firstShape.mesh, edges: firstShape.edges },
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

  // Create stable debounced evaluation function with better tracking
  const evaluationInProgress = useRef(false);
  const pendingEvaluation = useRef(false);

  const debouncedEvaluate = useMemo(
    () =>
      debounce((code: string, parameters: Record<string, any>, defaultParameters: Record<string, any>) => {
        performance.now(); // Track time but don't log it
        dispatch({ type: 'SET_STATUS', payload: { isBuffering: false } });

        if (evaluationInProgress.current) {
          pendingEvaluation.current = true;
          log.debug('Evaluation already in progress, marking for re-evaluation after completion');
          return;
        }

        log.debug('Evaluating code after debounce');
        evaluationInProgress.current = true;

        const mergedParameters = { ...defaultParameters, ...parameters };
        evaluateCode(code, mergedParameters).finally(() => {
          evaluationInProgress.current = false;

          if (pendingEvaluation.current) {
            pendingEvaluation.current = false;
            log.debug('Processing pending evaluation');
            debouncedEvaluate(code, parameters, defaultParameters);
          }
        });

        log.debug('Evaluation started');
      }, DEBOUNCE_TIME),
    [evaluateCode],
  );

  // Only run code evaluation once when user changes inputs
  const lastCodeReference = useRef<string>('');
  const lastParametersReference = useRef<string>('{}');

  // Effect to handle code/parameter changes
  useEffect(() => {
    if (!state.defaultParameters) return;

    updateActivityTimestamp();
    const parametersString = JSON.stringify(state.parameters);

    // Skip if nothing changed
    if (state.code === lastCodeReference.current && parametersString === lastParametersReference.current) {
      log.debug('Skipping evaluation - no changes detected');
      return;
    }

    // Update refs
    lastCodeReference.current = state.code;
    lastParametersReference.current = parametersString;

    const debounceStartTime = performance.now();
    log.debug(`Starting debounce at ${debounceStartTime}ms`);
    dispatch({ type: 'SET_STATUS', payload: { isBuffering: true } });
    debouncedEvaluate(state.code, state.parameters, state.defaultParameters);
  }, [state.code, state.parameters, state.defaultParameters, updateActivityTimestamp]);

  // Load default parameters when code changes
  useEffect(() => {
    if (!state.code) return;

    const loadDefaultParameters = async () => {
      try {
        const worker = await getOrInitWorker();
        if (!worker) return;

        const defaultParameters = await worker.extractDefaultParametersFromCode(state.code);
        dispatch({ type: 'SET_DEFAULT_PARAMETERS', payload: defaultParameters });
        log.debug('Loaded default parameters', { data: defaultParameters });
      } catch (error) {
        log.error('Failed to load default parameters', {
          data: error instanceof Error ? error.message : String(error),
        });
      }
    };

    loadDefaultParameters();
  }, [state.code, getOrInitWorker]);

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
      downloadSTL: async () => {
        const worker = await getOrInitWorker();
        if (!worker) throw new Error('Worker not found');
        const result = await worker.exportShape('stl');
        return result[0].blob;
      },
      setCode: (code: string) => dispatch({ type: 'SET_CODE', payload: code }),
      setParameters: (parameters: Record<string, any>) => dispatch({ type: 'SET_PARAMETERS', payload: parameters }),
      defaultParameters: state.defaultParameters ?? {},
    }),
    [state.mesh, state.isComputing, state.isBuffering, state.error, state.defaultParameters, getOrInitWorker],
  );

  return <ReplicadContext.Provider value={value}>{children}</ReplicadContext.Provider>;
}

export function useReplicad() {
  const context = useContext(ReplicadContext);
  if (!context) {
    throw new Error('useReplicad must be used within a ReplicadProvider');
  }
  return context;
}
