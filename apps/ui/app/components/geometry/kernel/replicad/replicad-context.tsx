/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO: fix typings
import { type Remote, wrap } from 'comlink';
import { createContext, useContext, useReducer, ReactNode, useEffect, useRef, useMemo, useCallback } from 'react';
import { BuilderWorkerInterface } from './replicad-builder.worker';
import BuilderWorker from './replicad-builder.worker?worker';
import { debounce } from '@/utils/functions';

// Combine related state
interface ReplicadState {
  code: string;
  parameters: Record<string, any>;

  defaultParameters: Record<string, any>;
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
  defaultParameters: {},
  isComputing: false,
  isBuffering: false,
  mesh: undefined,
};

const DEBOUNCE_TIME = 300;

function useReplicadWorker() {
  const workerReference = useRef<Remote<BuilderWorkerInterface> | undefined>(undefined);

  const initWorker = useCallback(async () => {
    if (!workerReference.current) {
      const worker = new BuilderWorker();
      workerReference.current = wrap<BuilderWorkerInterface>(worker);
      await workerReference.current.ready();
    }
    return workerReference.current;
  }, []);

  const terminateWorker = useCallback(() => {
    if (workerReference.current && 'terminate' in workerReference.current) {
      (workerReference.current as unknown as Worker).terminate();
      workerReference.current = undefined;
    }
  }, []);

  return { initWorker, terminateWorker };
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
  const { initWorker, terminateWorker } = useReplicadWorker();

  // Memoize the evaluation function
  const evaluateCode = useCallback(
    async (code: string, parameters: Record<string, any>) => {
      const worker = await initWorker();
      if (!worker || !code) return;

      try {
        dispatch({ type: 'SET_STATUS', payload: { isComputing: true, error: undefined } });

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
          payload: { faces: firstShape.mesh, edges: firstShape.edges },
        });
      } catch (error) {
        dispatch({
          type: 'SET_STATUS',
          payload: { error: error instanceof Error ? error.message : String(error) },
        });
      } finally {
        dispatch({ type: 'SET_STATUS', payload: { isComputing: false, isBuffering: false } });
      }
    },
    [initWorker],
  );

  // Create stable debounced evaluation function
  const debouncedEvaluate = useMemo(
    () =>
      debounce((code: string, parameters: Record<string, any>, defaultParameters: Record<string, any>) => {
        dispatch({ type: 'SET_STATUS', payload: { isBuffering: false } });
        const mergedParameters = { ...defaultParameters, ...parameters };
        evaluateCode(code, mergedParameters);
      }, DEBOUNCE_TIME),
    [evaluateCode],
  );

  // Effect to handle code/parameter changes
  useEffect(() => {
    dispatch({ type: 'SET_STATUS', payload: { isBuffering: true } });
    debouncedEvaluate(state.code, state.parameters, state.defaultParameters);
  }, [state.code, state.parameters, state.defaultParameters]);

  // Load default parameters when code changes
  useEffect(() => {
    if (!state.code) return;

    const loadDefaultParameters = async () => {
      const worker = await initWorker();
      if (!worker) return;

      try {
        const defaultParameters = await worker.extractDefaultParametersFromCode(state.code);
        dispatch({ type: 'SET_DEFAULT_PARAMETERS', payload: defaultParameters });
      } catch (error) {
        console.error('Failed to load default parameters:', error);
      }
    };

    loadDefaultParameters();
  }, [state.code, initWorker]);

  // Cleanup worker on unmount
  useEffect(() => terminateWorker, [terminateWorker]);

  const value = useMemo(
    () => ({
      mesh: state.mesh,
      status: {
        isComputing: state.isComputing,
        isBuffering: state.isBuffering,
        error: state.error,
      },
      downloadSTL: async () => {
        const worker = await initWorker();
        if (!worker) throw new Error('Worker not found');
        const result = await worker.exportShape('stl');
        return result[0].blob;
      },
      setCode: (code: string) => dispatch({ type: 'SET_CODE', payload: code }),
      setParameters: (parameters: Record<string, any>) => dispatch({ type: 'SET_PARAMETERS', payload: parameters }),
      defaultParameters: state.defaultParameters,
    }),
    [state.mesh, state.isComputing, state.isBuffering, state.error, state.defaultParameters, initWorker],
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
