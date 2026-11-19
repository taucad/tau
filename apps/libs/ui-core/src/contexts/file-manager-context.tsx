import { createContext } from 'react';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { FileWriteSource } from '@taucad/fs-client/file-write-source';

/**
 * The part of the project's file manager that library components use.
 *
 * The app's file-manager providers supply the whole file manager; its `useFileManager` hooks read this context and
 * narrow it to the app's type. A component that only reads files uses `@taucad/files-ui/hooks/use-file-services`.
 */
export type FileManagerContextValue = Readonly<{
  /** Resolves once the tree service is bound. */
  whenServicesReady: () => Promise<Readonly<{ treeService: FileTreeService }>>;
  /** Writes one file, by a path relative to the project root. */
  writeFile: (
    path: string,
    data: Uint8Array<ArrayBuffer>,
    options: Readonly<{ source: FileWriteSource }>,
  ) => Promise<void>;
}>;

/** The project's file manager, or `undefined` outside a file-manager provider. */
export const FileManagerContext = createContext<FileManagerContextValue | undefined>(undefined);
