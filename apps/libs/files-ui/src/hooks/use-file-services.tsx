import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';

/**
 * The project's content and tree services, as the app's file manager binds them.
 *
 * Each is `undefined` until the file-manager worker has bound its services; a reader degrades to loading or an
 * empty tree until then.
 */
export type FileServices = Readonly<{
  contentService: FileContentService | undefined;
  treeService: FileTreeService | undefined;
}>;

const FileServicesContext = createContext<FileServices | undefined>(undefined);

/**
 * Supplies the project's file services to the files hooks. The app's `FileManagerProvider` renders it, so the files
 * feature reads the services without importing the app's file manager.
 *
 * @param props - `value`: the services, memoised by the provider so readers re-render only when one changes.
 */
export function FileServicesProvider({
  value,
  children,
}: Readonly<{ value: FileServices; children: ReactNode }>): ReactNode {
  return <FileServicesContext.Provider value={value}>{children}</FileServicesContext.Provider>;
}

/**
 * The project's file services.
 *
 * @returns The services the nearest {@link FileServicesProvider} supplies.
 * @throws When no provider is mounted.
 */
export function useFileServices(): FileServices {
  const services = useContext(FileServicesContext);
  if (services === undefined) {
    throw new Error('useFileServices must be used within a FileServicesProvider');
  }

  return services;
}

/**
 * Non-throwing variant of {@link useFileServices}, for presentation-only surfaces that may render outside a project.
 *
 * @returns The services, or `undefined` outside a {@link FileServicesProvider}.
 */
export function useOptionalFileServices(): FileServices | undefined {
  return useContext(FileServicesContext);
}
