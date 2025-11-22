import type { ReactNode } from 'react';
import type { PartialDeep } from 'type-fest';
import { createContext, useContext, useMemo, useCallback, useEffect } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { Build } from '@taucad/types';
import type { Remote } from 'comlink';
import { buildManagerMachine } from '#hooks/build-manager.machine.js';
import type { ObjectStoreWorker } from '#hooks/object-store.worker.js';

type BuildManagerContextType = {
  wrappedWorker: Remote<ObjectStoreWorker> | undefined;
  isLoading: boolean;
  error: Error | undefined;
  buildManagerRef: ActorRefFrom<typeof buildManagerMachine>;
  createBuild: (build: Omit<Build, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Build>;
  updateBuild: (
    buildId: string,
    update: PartialDeep<Build>,
    options?: {
      ignoreKeys?: string[];
      noUpdatedAt?: boolean;
    },
  ) => Promise<Build | undefined>;
  getBuilds: (options?: { includeDeleted?: boolean }) => Promise<Build[]>;
  getBuild: (buildId: string) => Promise<Build | undefined>;
  deleteBuild: (buildId: string) => Promise<void>;
};

const BuildManagerContext = createContext<BuildManagerContextType | undefined>(undefined);

export function BuildManagerProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const actorRef = useActorRef(buildManagerMachine);

  // Select state from the machine
  const error = useSelector(actorRef, (state) => state.context.error);
  const wrappedWorker = useSelector(actorRef, (state) => state.context.wrappedWorker);
  const isLoading = useSelector(actorRef, (state) => {
    return state.matches('initializing') || state.matches('creatingWorker');
  });

  useEffect(() => {
    // Initialize the machine on mount
    actorRef.send({ type: 'initialize' });
  }, [actorRef]);

  const createBuild = useCallback(
    async (build: Omit<Build, 'id' | 'createdAt' | 'updatedAt'>): Promise<Build> => {
      if (!wrappedWorker) {
        throw new Error('Worker not initialized');
      }

      return wrappedWorker.createBuild(build);
    },
    [wrappedWorker],
  );

  const updateBuild = useCallback(
    async (
      buildId: string,
      update: PartialDeep<Build>,
      options?: {
        ignoreKeys?: string[];
        noUpdatedAt?: boolean;
      },
    ): Promise<Build | undefined> => {
      if (!wrappedWorker) {
        throw new Error('Worker not initialized');
      }

      return wrappedWorker.updateBuild(buildId, update, options);
    },
    [wrappedWorker],
  );

  const getBuilds = useCallback(
    async (options?: { includeDeleted?: boolean }): Promise<Build[]> => {
      if (!wrappedWorker) {
        throw new Error('Worker not initialized');
      }

      return wrappedWorker.getBuilds(options);
    },
    [wrappedWorker],
  );

  const getBuild = useCallback(
    async (buildId: string): Promise<Build | undefined> => {
      if (!wrappedWorker) {
        throw new Error('Worker not initialized');
      }

      return wrappedWorker.getBuild(buildId);
    },
    [wrappedWorker],
  );

  const deleteBuild = useCallback(
    async (buildId: string): Promise<void> => {
      if (!wrappedWorker) {
        throw new Error('Worker not initialized');
      }

      return wrappedWorker.deleteBuild(buildId);
    },
    [wrappedWorker],
  );

  const value = useMemo<BuildManagerContextType>(() => {
    return {
      isLoading,
      error,
      buildManagerRef: actorRef,
      wrappedWorker,
      createBuild,
      updateBuild,
      getBuilds,
      getBuild,
      deleteBuild,
    };
  }, [isLoading, error, actorRef, wrappedWorker, createBuild, updateBuild, getBuilds, getBuild, deleteBuild]);

  return <BuildManagerContext.Provider value={value}>{children}</BuildManagerContext.Provider>;
}

export function useBuildManager(): BuildManagerContextType {
  const context = useContext(BuildManagerContext);

  if (context === undefined) {
    throw new Error('useBuildManager must be used within a BuildManagerProvider');
  }

  return context;
}
