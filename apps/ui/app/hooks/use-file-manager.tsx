import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useCallback, useEffect } from 'react';
import { useActorRef } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { fileManagerMachine } from '#machines/file-manager.machine.js';

export type FileEntry = {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size: number;
  isLoaded: boolean;
};

type FileManagerContextType = {
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
  loadDirectory: (path: string) => void;
  writeFile: (path: string, data: Uint8Array) => void;
  writeFiles: (files: Record<string, { content: Uint8Array }>) => Promise<void>;
  readFile: (path: string) => Promise<Uint8Array>;
  getZippedDirectory: (path: string) => Promise<Blob>;
  copyDirectory: (sourcePath: string, destinationPath: string) => Promise<void>;
};

const FileManagerContext = createContext<FileManagerContextType | undefined>(undefined);

export function FileManagerProvider({
  children,
  rootDirectory,
  shouldInitializeOnStart = true,
}: {
  readonly children: ReactNode;
  readonly rootDirectory: string;
  readonly shouldInitializeOnStart?: boolean;
}): React.JSX.Element {
  const actorRef = useActorRef(fileManagerMachine, {
    input: {
      rootDirectory,
      shouldInitializeOnStart,
    },
  });

  useEffect(() => {
    actorRef.send({ type: 'setRoot', path: rootDirectory });
  }, [actorRef, rootDirectory]);

  const loadDirectory = useCallback(
    (path: string) => {
      actorRef.send({ type: 'loadDirectory', path });
    },
    [actorRef],
  );

  const writeFile = useCallback(
    (path: string, data: Uint8Array) => {
      actorRef.send({ type: 'writeFile', path, data });
    },
    [actorRef],
  );

  const readFile = useCallback(
    async (path: string): Promise<Uint8Array> => {
      actorRef.send({ type: 'readFile', path });

      const snapshot = await waitFor(actorRef, (state) => state.context.openFiles.has(path));
      const file = snapshot.context.openFiles.get(path);

      if (!file) {
        throw new Error(`File not found in open files: ${path}`);
      }

      return file;
    },
    [actorRef],
  );

  const getZippedDirectory = useCallback(
    async (path: string): Promise<Blob> => {
      const snapshot = await waitFor(actorRef, (state) => state.matches('ready'));
      const worker = snapshot.context.wrappedWorker;
      if (!worker) {
        throw new Error('File manager worker not initialized');
      }

      return worker.getZippedDirectory(path);
    },
    [actorRef],
  );

  const writeFiles = useCallback(
    async (files: Record<string, { content: Uint8Array }>) => {
      actorRef.send({ type: 'writeFiles', files });
      await waitFor(actorRef, (state) => state.matches('ready'));
    },
    [actorRef],
  );

  const copyDirectory = useCallback(
    async (sourcePath: string, destinationPath: string) => {
      const snapshot = await waitFor(actorRef, (state) => state.matches('ready'));
      const worker = snapshot.context.wrappedWorker;
      if (!worker) {
        throw new Error('File manager worker not initialized');
      }

      await worker.copyDirectory(sourcePath, destinationPath);
      await waitFor(actorRef, (state) => state.matches('ready'));
    },
    [actorRef],
  );

  const value = useMemo<FileManagerContextType>(() => {
    return {
      fileManagerRef: actorRef,
      loadDirectory,
      writeFile,
      writeFiles,
      readFile,
      getZippedDirectory,
      copyDirectory,
    };
  }, [actorRef, loadDirectory, writeFile, writeFiles, readFile, getZippedDirectory, copyDirectory]);

  return <FileManagerContext.Provider value={value}>{children}</FileManagerContext.Provider>;
}

export function useFileManager(): FileManagerContextType {
  const context = useContext(FileManagerContext);
  if (context === undefined) {
    throw new Error('useFileManager must be used within a FileManagerProvider');
  }

  return context;
}
