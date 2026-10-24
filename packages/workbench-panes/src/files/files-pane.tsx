import { useCallback, useEffect, useState } from 'react';
import { useWorkbenchPanesHost } from '#host/workbench-host.jsx';
import { FileBrowser, useFileBrowser } from '#files/file-selector.jsx';
import type { FilesSource } from '#files/files-source.js';

const failureMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const noActivePath = (): string | undefined => undefined;

/**
 * How often the source said its files changed, so the browser lists again at each change.
 *
 * @param subscribe - The source's change feed; nothing ever changes without one.
 * @returns A number that moves at every change.
 */
const useRevision = (subscribe: FilesSource['subscribe']): number => {
  const [revision, setRevision] = useState(0);
  useEffect(
    () =>
      subscribe?.(() => {
        setRevision((current) => current + 1);
      }),
    [subscribe],
  );
  return revision;
};

/** The pane's body over a host's source; split out so its hooks run only when the host has one. */
function FilesBody({ source }: Readonly<{ source: FilesSource }>): React.JSX.Element {
  const useActivePath = source.useActivePath ?? noActivePath;
  const activePath = useActivePath();
  const revision = useRevision(source.subscribe);
  const browser = useFileBrowser({ dataSource: source, isActive: true, revision });
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [openError, setOpenError] = useState<string | undefined>(undefined);
  const { openFile } = source;
  const select = useCallback(
    (path: string) => {
      setPending(path);
      setOpenError(undefined);
      const run = async (): Promise<void> => {
        try {
          await openFile(path);
        } catch (error) {
          setOpenError(failureMessage(error));
        } finally {
          setPending((current) => (current === path ? undefined : current));
        }
      };
      // async-iife: bootstrap — a click starts it; the row's spinner and the alert report its outcome.
      void run();
    },
    [openFile],
  );
  return (
    <section aria-label='Files' className='flex size-full min-h-0 flex-col bg-background'>
      <FileBrowser {...browser} fill selectedFile={activePath} pendingFile={pending} onSelect={select} />
      {openError === undefined ? undefined : (
        <p role='alert' className='shrink-0 border-t px-3 py-2 text-xs text-feature'>
          {openError}
        </p>
      )}
    </section>
  );
}

/**
 * The Files pane body, drawn from the host's {@link FilesSource}: the project's files with breadcrumbs and a search,
 * the shown file marked, a file the view cannot show disabled, and a click showing another file in this view only.
 *
 * @returns The browser, or an empty slot when the host offers no files.
 * @public
 *
 * @example <caption>A host that lists its files in the pane</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { FilesPane } from '@taucad/workbench-panes/files/files-pane';
 * import { createStaticDataSource } from '@taucad/workbench-panes/files/file-selector';
 * import { WorkbenchPanesHostProvider } from '@taucad/workbench-panes/host/workbench-host';
 *
 * const files = { ...createStaticDataSource([{ path: 'main.ts' }]), openFile: console.info };
 * createElement(WorkbenchPanesHostProvider, { value: { useUnits: () => [], files } }, createElement(FilesPane));
 * ```
 */
export function FilesPane(): React.JSX.Element | undefined {
  const source = useWorkbenchPanesHost().files;
  return source === undefined ? undefined : <FilesBody source={source} />;
}
