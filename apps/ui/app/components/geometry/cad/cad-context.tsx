import type { JSX, ReactNode } from 'react';
import { createContext, useContext, useReducer, useEffect, useMemo, useCallback } from 'react';
import { useKernel } from '~/components/geometry/kernel/kernel-context.js';
import { useLogs } from '~/hooks/use-console.js';
import type { Shape } from '~/types/cad.js';

// Combine related state
type CadState = {
  code: string;
  parameters: Record<string, unknown>;
  defaultParameters: Record<string, unknown> | undefined;
  error?: string;
  isComputing: boolean;
  isBuffering: boolean;
  shapes: Shape[];
};

type CadAction =
  | { type: 'SET_CODE'; payload: string }
  | { type: 'SET_PARAMETERS'; payload: Record<string, unknown> }
  | { type: 'SET_DEFAULT_PARAMETERS'; payload: Record<string, unknown> }
  | { type: 'SET_STATUS'; payload: { error?: string; isComputing?: boolean; isBuffering?: boolean } }
  | { type: 'SET_SHAPES'; payload: CadState['shapes'] };

const initialState: CadState = {
  code: '',
  parameters: {},
  defaultParameters: undefined,
  isComputing: false,
  isBuffering: false,
  shapes: [],
};

function cadReducer(state: CadState, action: CadAction): CadState {
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

    case 'SET_SHAPES': {
      return { ...state, shapes: action.payload };
    }
  }
}

type CadContextProperties = {
  shapes: Shape[];
  status: {
    isComputing: boolean;
    isBuffering: boolean;
    error?: string;
  };
  downloadStl: () => Promise<Blob>;
  setCode: (code: string) => void;
  setParameters: (parameters: Record<string, unknown>) => void;
  defaultParameters: Record<string, unknown>;
};

const CadContext = createContext<CadContextProperties | undefined>(undefined);

export function CadProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(cadReducer, initialState);
  const kernel = useKernel();
  const { log } = useLogs({ defaultOrigin: { component: 'CAD' } });

  // Memoize the evaluation function
  const evaluateCode = useCallback(
    async (code: string, parameters: Record<string, unknown>) => {
      const evalStartTime = performance.now();
      log.debug(`Starting evaluation at ${evalStartTime}ms`);

      if (!code) return;

      const loadDefaultParameters = async (code: string) => {
        try {
          const defaultParameters = await kernel.extractDefaultParametersFromCode(code);
          dispatch({ type: 'SET_DEFAULT_PARAMETERS', payload: defaultParameters });
          log.debug('Loaded default parameters', { data: defaultParameters });

          return defaultParameters;
        } catch (error) {
          log.error('Failed to load default parameters', {
            data: error instanceof Error ? error.message : String(error),
          });

          return {};
        }
      };

      try {
        dispatch({ type: 'SET_STATUS', payload: { isComputing: true, error: undefined } });
        const defaultParameters = await loadDefaultParameters(code);
        const mergedParameters = { ...defaultParameters, ...parameters };
        log.debug('Building shape');

        const buildStartTime = performance.now();
        const result = await kernel.buildShapesFromCode(code, mergedParameters);
        const buildEndTime = performance.now();
        log.debug(`Shape building took ${buildEndTime - buildStartTime}ms`);

        if ('error' in result) {
          throw new Error(result.message);
        }

        if (!result) {
          // Gracefully handle the case where no shape is generated
          dispatch({
            type: 'SET_SHAPES',
            payload: [],
          });
          return;
        }

        const shapesWithoutErrors = result.filter((shape) => !shape.error);

        if (shapesWithoutErrors.length === 0) {
          throw new Error(result.map((shape) => shape.error).join(', '));
        }

        const processingStartTime = performance.now();
        log.debug('Built shape');
        dispatch({
          type: 'SET_SHAPES',
          payload: shapesWithoutErrors,
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
    [kernel],
  );
  // Effect to handle code/parameter changes
  useEffect(() => {
    const debounceStartTime = performance.now();
    log.debug(`Starting debounce at ${debounceStartTime}ms`);

    log.debug('Evaluating code after debounce');

    void evaluateCode(state.code, state.parameters);
  }, [state.code, state.parameters, evaluateCode]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      log.debug('Unmounting CadProvider, terminating worker');
      kernel.terminateWorker();
    };
  }, [kernel]);

  const value = useMemo(
    () => ({
      shapes: state.shapes,
      status: {
        isComputing: state.isComputing,
        isBuffering: state.isBuffering,
        error: state.error,
      },
      async downloadStl() {
        const result = await kernel.exportShape('stl');
        if (result && result.length > 0 && result[0].blob) {
          return result[0].blob;
        }

        throw new Error('Failed to export STL file');
      },
      setCode(code: string) {
        dispatch({ type: 'SET_CODE', payload: code });
      },
      setParameters(parameters: Record<string, unknown>) {
        dispatch({ type: 'SET_PARAMETERS', payload: parameters });
      },
      defaultParameters: state.defaultParameters ?? {},
    }),
    [state.shapes, state.isComputing, state.isBuffering, state.error, state.defaultParameters, kernel],
  );

  return <CadContext.Provider value={value}>{children}</CadContext.Provider>;
}

export function useCad(): CadContextProperties {
  const context = useContext(CadContext);
  if (!context) {
    throw new Error('useCad must be used within a CadProvider');
  }

  return context;
}
