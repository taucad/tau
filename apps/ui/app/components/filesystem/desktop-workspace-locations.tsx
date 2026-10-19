import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Plus, Unplug } from 'lucide-react';
import { resolveStorageRootKey } from '@taucad/filesystem/storage-root-key';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '@taucad/ui/components/loader';
import { desktopBridge, hostPathName } from '#filesystem/desktop-bridge.js';
import { listWorkspaces } from '#filesystem/handle-store.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProjectManager } from '#hooks/use-project-manager.js';

/** Manage native folder grants, including old grants with no surviving workspace row. */
export function DesktopWorkspaceLocations(): React.JSX.Element {
  const { workspace } = useFileManager();
  const projectManager = useProjectManager();
  const [paths, setPaths] = useState<readonly string[]>();
  const [busyPath, setBusyPath] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [errorMessage, setError] = useState<string>();
  const directories = desktopBridge()?.directories;

  const refresh = useCallback(async () => {
    if (!directories) {
      throw new Error('Folder management is unavailable. Restart Tau and try again.');
    }
    setPaths(await directories.list());
  }, [directories]);

  useEffect(() => {
    const reload = async (): Promise<void> => {
      try {
        await refresh();
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Could not load connected folders.');
      }
    };
    void reload();
    return directories?.onChange(reload);
  }, [directories, refresh]);

  const disconnect = async (path: string): Promise<void> => {
    setBusyPath(path);
    setError(undefined);
    setMessage(undefined);
    let revoked = false;
    try {
      if (!directories) {
        throw new Error('Folder management is unavailable.');
      }
      const known = await listWorkspaces();
      for (const entry of known.filter((entry) => entry.path === path)) {
        // oxlint-disable-next-line no-await-in-loop -- Check every affected identity before changing its authority.
        await projectManager.assertWorkspaceMutationAllowed(entry.workspaceId);
      }
      await directories.disconnect(path);
      revoked = true;
      setPaths((current) => current?.filter((entry) => entry !== path));
      setMessage(`Disconnected ${hostPathName(path)}. Your files are still on disk.`);
      await workspace.disposeStorageRoot(resolveStorageRootKey({ backend: 'node', path }, ''));
      await workspace.syncProjectRoots();
      await projectManager.refreshWorkspaceCatalog();
      await refresh();
    } catch (error) {
      setError(
        revoked
          ? 'The folder is disconnected. Restart Tau to finish refreshing locations.'
          : error instanceof Error
            ? error.message
            : 'Could not disconnect this folder.',
      );
    } finally {
      setBusyPath(undefined);
    }
  };

  const connect = async (): Promise<void> => {
    setBusyPath('');
    setError(undefined);
    setMessage(undefined);
    try {
      await projectManager.connectWorkspace();
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not connect this folder.');
    } finally {
      setBusyPath(undefined);
    }
  };

  return (
    <section aria-label='Manage locations' className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-lg font-medium'>Connected folders</h2>
          <p className='text-sm text-muted-foreground'>
            Disconnecting stops Tau accessing a folder. Files stay on disk.
          </p>
        </div>
        <Button variant='outline' size='sm' disabled={busyPath !== undefined} onClick={connect}>
          <Plus className='size-4' />
          Connect a folder…
        </Button>
      </div>
      {errorMessage ? (
        <p role='alert' className='text-sm'>
          {errorMessage}
        </p>
      ) : undefined}
      {message ? (
        <p role='status' className='text-sm'>
          {message}
        </p>
      ) : undefined}
      {paths === undefined && !errorMessage ? (
        <Loader aria-label='Loading connected folders' className='size-4' />
      ) : undefined}
      {paths?.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No connected folders. Home is always available.</p>
      ) : undefined}
      {paths && paths.length > 0 ? (
        <ul className='divide-y rounded-lg border'>
          {paths.map((path) => (
            <li key={path} className='flex flex-wrap items-center gap-3 p-3'>
              <FolderOpen className='size-4 shrink-0 text-muted-foreground' aria-hidden />
              <div className='min-w-0 flex-1'>
                <p className='text-sm font-medium'>{hostPathName(path)}</p>
                <p className='text-xs break-all text-muted-foreground'>{path}</p>
              </div>
              <Button
                variant='outline'
                size='sm'
                aria-label={`Disconnect ${hostPathName(path)}`}
                disabled={busyPath !== undefined}
                onClick={async () => disconnect(path)}
              >
                <Unplug className='size-4' />
                {busyPath === path ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            </li>
          ))}
        </ul>
      ) : undefined}
      <p className='text-xs text-muted-foreground'>To reconnect a folder later, choose Connect a folder.</p>
    </section>
  );
}
