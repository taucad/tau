import { type Remote, wrap } from 'comlink';
import { createContext, useContext, useReducer, ReactNode, useEffect, useRef, useState, useCallback } from 'react';
import { BuilderWorkerInterface } from './replicad-builder.worker';
import BuilderWorker from './replicad-builder.worker?worker';
import { debounce } from '@/utils/functions';

interface ReplicadState {
  code: string;
  parameters: Record<string, any>;
  error: string | undefined;
  isComputing: boolean;
  mesh: { edges: any; faces: any } | undefined;
}

type ReplicadAction =
  | { type: 'SET_CODE'; payload: string }
  | { type: 'SET_PARAMETERS'; payload: Record<string, any> }
  | { type: 'UPDATE_PARAMETER'; payload: { key: string; value: any } }
  | { type: 'SET_ERROR'; payload: string | undefined }
  | { type: 'SET_COMPUTING'; payload: boolean }
  | { type: 'SET_MESH'; payload: { edges: any; faces: any } | undefined };

const initialState: ReplicadState = {
  code: '',
  parameters: {},
  error: undefined,
  isComputing: false,
  mesh: undefined,
};

const DEBOUNCE_TIME = 300;

function replicadReducer(state: ReplicadState, action: ReplicadAction): ReplicadState {
  switch (action.type) {
    case 'SET_CODE': {
      return {
        ...state,
        code: action.payload,
      };
    }
    case 'SET_PARAMETERS': {
      console.log('setting parameters');
      return {
        ...state,
        parameters: action.payload,
      };
    }
    case 'UPDATE_PARAMETER': {
      console.log('updating parameter');
      return {
        ...state,
        parameters: {
          ...state.parameters,
          [action.payload.key]: action.payload.value,
        },
      };
    }
    case 'SET_ERROR': {
      return {
        ...state,
        error: action.payload,
      };
    }
    case 'SET_COMPUTING': {
      return {
        ...state,
        isComputing: action.payload,
      };
    }
    case 'SET_MESH': {
      return {
        ...state,
        mesh: action.payload,
      };
    }
    default: {
      return state;
    }
  }
}

const ReplicadContext = createContext<
  | {
      isComputing: boolean;
      isBuffering: boolean;
      error: string | undefined;
      mesh: { edges: any; faces: any } | undefined;
      code: string;
      parameters: Record<string, any>;
      downloadSTL: () => Promise<Blob>;
      setCode: (code: string) => void;
      setParameters: (key: string, value: any) => void;
    }
  | undefined
>(undefined);

export function ReplicadProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(replicadReducer, initialState);
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
        // TODO: Check if this is needed
        if ('terminate' in currentWorker) {
          (currentWorker as unknown as Worker).terminate();
          console.log('terminated worker');
        }
        workerReference.current = undefined;
      }
    };
  }, []);

  const [isBuffering, setIsBuffering] = useState(false);

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
    }, DEBOUNCE_TIME),
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
        dispatch({ type: 'SET_PARAMETERS', payload: defaultParameters });
      } catch (error) {
        console.error('Failed to load default parameters:', error);
      }
    };

    loadDefaultParameters();
  }, [state.code, dispatch]);

  const downloadSTL = async () => {
    const worker = workerReference.current;
    if (!worker) throw new Error('Worker not found');
    const result = await worker.exportShape('stl');
    return result[0].blob;
  };

  const setCode = (code: string) => {
    dispatch({ type: 'SET_CODE', payload: code });
  };

  const setParameters = (key: string, value: string | number | boolean) => {
    dispatch({ type: 'UPDATE_PARAMETER', payload: { key, value } });
  };

  return (
    <ReplicadContext.Provider
      value={{
        isComputing: state.isComputing,
        isBuffering,
        error: state.error,
        mesh: state.mesh,
        code: state.code,
        parameters: state.parameters,
        downloadSTL,
        setCode,
        setParameters,
      }}
    >
      {children}
    </ReplicadContext.Provider>
  );
}

export function useReplicad() {
  const context = useContext(ReplicadContext);
  if (!context) {
    throw new Error('useReplicad must be used within a ReplicadProvider');
  }
  return context;
}
