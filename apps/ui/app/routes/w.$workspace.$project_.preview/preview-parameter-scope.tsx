import { useEffect, useMemo, useRef, useState } from 'react';
import { randomUuid } from '@taucad/utils/id';
import { parametersDirectory } from '@taucad/types';
import { FileManagerProvider, useFileManager } from '#hooks/use-file-manager.js';
import { createParameterSetService } from '#services/parameter-set-service.js';
import type { ParameterSetService } from '#services/parameter-set-service.js';
import { toast } from '#components/ui/sonner.js';

type SourceFiles = Pick<ReturnType<typeof useFileManager>, 'exists' | 'readdir' | 'stat' | 'readFile'>;
type ParameterState = { service: ParameterSetService } | { error: string } | undefined;

/** Copy only saved parameter records; model source and runtime placement remain on the owned project. */
export async function readPreviewParameterRecords(
  source: SourceFiles,
): Promise<Record<string, { content: Uint8Array<ArrayBuffer> }>> {
  const files: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
  const visit = async (directory: string): Promise<void> => {
    const names = await source.readdir(directory);
    await Promise.all(
      names.map(async (name) => {
        const path = `${directory}/${name}`;
        const stat = await source.stat(path);
        if (stat.type === 'dir') {
          await visit(path);
        } else {
          files[path] = { content: await source.readFile(path) };
        }
      }),
    );
  };
  if (await source.exists(parametersDirectory)) {
    await visit(parametersDirectory);
  }
  return files;
}

function PreviewParameterMount({
  source,
  rootDirectory,
  onReady,
}: {
  readonly source: SourceFiles;
  readonly rootDirectory: string;
  readonly onReady: (state: ParameterState) => void;
}): React.JSX.Element | undefined {
  const { workspace, writeFiles, whenServicesReady, parameterFiles } = useFileManager();
  const mountingRef = useRef<Promise<void> | undefined>(undefined);
  const generation = useRef(0);
  const closingServices = useRef(new Set<Promise<void>>());
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const active = ++generation.current;
    const mount = async (): Promise<void> => {
      await workspace.mount(rootDirectory, {
        backend: 'memory',
        storageRootKey: `memory:preview:${rootDirectory.slice('/previews/'.length)}`,
        class: 'authored',
      });
      await writeFiles(await readPreviewParameterRecords(source));
    };
    const mounting = mountingRef.current ?? mount();
    mountingRef.current = mounting;
    const report = async (): Promise<void> => {
      try {
        await mounting;
        if (generation.current === active) {
          setMounted(true);
        }
      } catch (error) {
        if (generation.current === active) {
          onReady({ error: error instanceof Error ? error.message : 'Preview parameters could not load.' });
        }
      }
    };
    void report();
    return () => {
      const released = ++generation.current;
      const release = async (): Promise<void> => {
        try {
          await mounting;
        } catch {
          // The mount error was already surfaced by report.
        } finally {
          await Promise.all(closingServices.current);
          workspace.unmount(rootDirectory);
        }
      };
      queueMicrotask(() => {
        if (generation.current !== released) {
          return;
        }
        mountingRef.current = undefined;
        void release();
      });
    };
  }, [source, rootDirectory, onReady, workspace, writeFiles]);

  // Ports are incarnation-scoped; reconnect to the existing memory records after a worker opener changes.
  useEffect(() => {
    if (!mounted) {
      return;
    }
    let cancelled = false;
    let service: ParameterSetService | undefined;
    const connect = async (): Promise<void> => {
      try {
        const { contentService } = await whenServicesReady();
        if (cancelled) {
          return;
        }
        service = createParameterSetService({
          rootDirectory,
          client: parameterFiles,
          watchReady: (request, onEvent) => {
            const watch = contentService.watchReady(request, onEvent);
            return {
              ready: watch.ready,
              closed: (async () => {
                await watch.closed;
              })(),
              unsubscribe: watch.dispose,
            };
          },
          onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Preview parameters failed.');
          },
        });
        onReady({ service });
      } catch (error) {
        if (!cancelled) {
          onReady({ error: error instanceof Error ? error.message : 'Preview parameters could not connect.' });
        }
      }
    };
    void connect();
    return () => {
      cancelled = true;
      service?.discardDrafts();
      const close = async (): Promise<void> => {
        try {
          await service?.close();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Preview parameters could not close.');
        }
      };
      const closing = close();
      closingServices.current.add(closing);
      const forgetClosed = async (): Promise<void> => {
        await closing;
        closingServices.current.delete(closing);
      };
      void forgetClosed();
    };
  }, [mounted, rootDirectory, onReady, whenServicesReady, parameterFiles]);
  return undefined;
}

/** An authority-owned memory mount, separate from the project's files and native runtime. */
export function PreviewParameterScope({
  children,
}: {
  readonly children: (service: ParameterSetService) => React.ReactNode;
}): React.JSX.Element {
  const { exists, readdir, stat, readFile } = useFileManager();
  const source = useMemo(() => ({ exists, readdir, stat, readFile }), [exists, readdir, stat, readFile]);
  const [instance] = useState(() => randomUuid());
  const rootDirectory = `/previews/parameters-${instance}`;
  const [state, setState] = useState<ParameterState>();
  return (
    <>
      <FileManagerProvider initialBackend='memory' rootDirectory={rootDirectory}>
        <PreviewParameterMount source={source} rootDirectory={rootDirectory} onReady={setState} />
      </FileManagerProvider>
      {state === undefined ? (
        <p role='status' className='p-4 text-sm'>
          Loading preview parameters…
        </p>
      ) : 'error' in state ? (
        <p role='alert' className='p-4 text-sm'>
          {state.error}
        </p>
      ) : (
        children(state.service)
      )}
    </>
  );
}
