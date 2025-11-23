import type { ReactNode } from 'react';
import type { PartialDeep } from 'type-fest';
import { createContext, useContext, useMemo, useCallback, useEffect } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { Build } from '@taucad/types';
import type { Remote } from 'comlink';
import { buildManagerMachine } from '#hooks/build-manager.machine.js';
import type { ObjectStoreWorker } from '#hooks/object-store.worker.js';
import { useFileManager } from '#hooks/use-file-manager.js';

type BuildManagerContextType = {
  isLoading: boolean;
  error: Error | undefined;
  buildManagerRef: ActorRefFrom<typeof buildManagerMachine>;
  createBuild: (
    build: Omit<Build, 'id' | 'createdAt' | 'updatedAt'>,
    files: Record<string, { content: Uint8Array }>,
  ) => Promise<Build>;
  updateBuild: (
    buildId: string,
    update: PartialDeep<Build>,
    options?: {
      ignoreKeys?: string[];
      noUpdatedAt?: boolean;
    },
  ) => Promise<Build | undefined>;
  duplicateBuild: (buildId: string) => Promise<Build>;
  getBuilds: (options?: { includeDeleted?: boolean }) => Promise<Build[]>;
  getBuild: (buildId: string) => Promise<Build | undefined>;
  deleteBuild: (buildId: string) => Promise<void>;
};

const BuildManagerContext = createContext<BuildManagerContextType | undefined>(undefined);

export function BuildManagerProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const actorRef = useActorRef(buildManagerMachine);
  const fileManager = useFileManager();

  // Select state from the machine
  const error = useSelector(actorRef, (state) => state.context.error);
  const isLoading = useSelector(actorRef, (state) => {
    return state.matches('initializing') || state.matches('creatingWorker');
  });

  useEffect(() => {
    // Initialize the machine on mount
    actorRef.send({ type: 'initialize' });
  }, [actorRef]);

  const getReadiedWorker = useCallback(async (): Promise<Remote<ObjectStoreWorker>> => {
    const snapshot = await waitFor(actorRef, (state) => state.matches('ready') || state.matches('error'));
    if (snapshot.matches('error')) {
      throw new Error('Build manager worker failed to initialize');
    }

    if (!snapshot.context.wrappedWorker) {
      throw new Error('Build manager worker not initialized');
    }

    return snapshot.context.wrappedWorker;
  }, [actorRef]);

  const createBuild = useCallback(
    async (
      buildData: Omit<Build, 'id' | 'createdAt' | 'updatedAt'>,
      files: Record<string, { content: Uint8Array }>,
    ): Promise<Build> => {
      const worker = await getReadiedWorker();

      const build = await worker.createBuild(buildData);

      const buildFiles: Record<string, { content: Uint8Array }> = {};
      for (const [path, file] of Object.entries(files)) {
        buildFiles[`/builds/${build.id}/${path}`] = file;
      }

      await fileManager.writeFiles(buildFiles);

      return build;
    },
    [getReadiedWorker, fileManager],
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
      const worker = await getReadiedWorker();
      return worker.updateBuild(buildId, update, options);
    },
    [getReadiedWorker],
  );

  const duplicateBuild = useCallback(
    async (buildId: string): Promise<Build> => {
      const worker = await getReadiedWorker();
      const build = await worker.duplicateBuild(buildId);
      await fileManager.copyDirectory(`/builds/${buildId}`, `/builds/${build.id}`);
      return build;
    },
    [getReadiedWorker, fileManager],
  );

  const getBuilds = useCallback(
    async (options?: { includeDeleted?: boolean }): Promise<Build[]> => {
      const worker = await getReadiedWorker();
      return worker.getBuilds(options);
    },
    [getReadiedWorker],
  );

  const getBuild = useCallback(
    async (buildId: string): Promise<Build | undefined> => {
      const worker = await getReadiedWorker();

      return worker.getBuild(buildId);
    },
    [getReadiedWorker],
  );

  const deleteBuild = useCallback(
    async (buildId: string): Promise<void> => {
      const worker = await getReadiedWorker();
      return worker.deleteBuild(buildId);
    },
    [getReadiedWorker],
  );

  const value = useMemo<BuildManagerContextType>(() => {
    return {
      isLoading,
      error,
      buildManagerRef: actorRef,
      createBuild,
      updateBuild,
      duplicateBuild,
      getBuilds,
      getBuild,
      deleteBuild,
    };
  }, [isLoading, error, actorRef, createBuild, updateBuild, duplicateBuild, getBuilds, getBuild, deleteBuild]);

  return <BuildManagerContext.Provider value={value}>{children}</BuildManagerContext.Provider>;
}

export function useBuildManager(): BuildManagerContextType {
  const context = useContext(BuildManagerContext);

  if (context === undefined) {
    throw new Error('useBuildManager must be used within a BuildManagerProvider');
  }

  return context;
}
