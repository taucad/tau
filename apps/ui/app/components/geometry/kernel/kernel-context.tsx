import React, { createContext, useCallback, useContext, useRef, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import type { BuilderWorkerInterface } from './replicad/replicad-builder.worker';
import BuilderWorker from './replicad/replicad-builder.worker?worker';
import { useConsole } from '~/hooks/use-console.js';

export type Shape = {
  mesh: unknown;
  edges: unknown;
  error?: string;
  color?: string;
  opacity?: number;
};

export type BuildShapesResult = Shape[] | { error: true; message: string };
export type ExportFormat = 'stl' | 'stl-binary' | 'step' | 'step-assembly';

export type ExportResult = Array<{
  blob: Blob;
  filename?: string;
}>;

type KernelContextType = {
  buildShapesFromCode: (code: string, parameters: Record<string, unknown>) => Promise<BuildShapesResult>;
  extractDefaultParametersFromCode: (code: string) => Promise<Record<string, unknown>>;
  exportShape: (format: ExportFormat) => Promise<ExportResult>;
  terminateWorker: () => void;
  withExceptions: boolean;
};

// Create the context with a default undefined value
const KernelContext = createContext<KernelContextType | undefined>(undefined);

/**
 * Provider component for kernel functionality
 */
export function KernelProvider({
  children,
  withExceptions = false,
}: {
  readonly children: ReactNode;
  readonly withExceptions?: boolean;
}): React.JSX.Element {
  const { log } = useConsole({ defaultOrigin: { component: 'Kernel' } });
  const wrappedWorkerReference = useRef<Remote<BuilderWorkerInterface> | undefined>(undefined);
  const workerReference = useRef<Worker | undefined>(undefined);
  const workerInitializationId = useRef<number>(0);
  const workerInitializationPromise = useRef<Promise<Remote<BuilderWorkerInterface> | undefined> | undefined>(
    undefined,
  );

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

  const initWorker = useCallback(async () => {
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
  }, [withExceptions]);

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
  }, [initWorker]);

  const buildShapesFromCode = useCallback(
    async (code: string, parameters: Record<string, unknown>): Promise<BuildShapesResult> => {
      const worker = await getOrInitWorker();
      if (!worker) {
        return { error: true, message: 'Worker initialization failed' };
      }

      return worker.buildShapesFromCode(code, parameters) as BuildShapesResult;
    },
    [getOrInitWorker],
  );

  const extractDefaultParametersFromCode = useCallback(
    async (code: string): Promise<Record<string, unknown>> => {
      const worker = await getOrInitWorker();
      if (!worker) {
        return {};
      }

      return worker.extractDefaultParametersFromCode(code);
    },
    [getOrInitWorker],
  );

  const exportShape = useCallback(
    async (format: ExportFormat): Promise<ExportResult> => {
      const worker = await getOrInitWorker();
      if (!worker) {
        throw new Error('Worker not found');
      }

      try {
        const result = await worker.exportShape(format);

        // Validate the result
        if (!Array.isArray(result) || result.length === 0 || !result[0].blob) {
          throw new Error('Invalid export result');
        }

        return result.map((item) => ({
          blob: item.blob,
          filename: (item as { name?: string }).name,
        }));
      } catch (error) {
        log.error('Failed to export shape', {
          data: error instanceof Error ? error.message : String(error),
        });
        throw new Error(`Failed to export shape: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [getOrInitWorker],
  );

  // Create the context value with useMemo to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      buildShapesFromCode,
      extractDefaultParametersFromCode,
      exportShape,
      terminateWorker,
      withExceptions,
    }),
    [buildShapesFromCode, extractDefaultParametersFromCode, exportShape, terminateWorker, withExceptions],
  );

  return <KernelContext.Provider value={contextValue}>{children}</KernelContext.Provider>;
}

/**
 * Hook to access kernel functionality
 */
export function useKernel(): KernelContextType {
  const context = useContext(KernelContext);

  if (!context) {
    throw new Error('useKernel must be used within a KernelProvider');
  }

  return context;
}
