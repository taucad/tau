import { useState } from 'react';
import { FolderOpen, PanelsTopLeft } from 'lucide-react';
import { resolveRootedPath } from '@taucad/utils/path';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { toast } from '#components/ui/sonner.js';
import { desktopBridge, nodeHomeRoot } from '#filesystem/desktop-bridge.js';
import type { DesktopBridge } from '#filesystem/desktop-bridge.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { desktopWorkspaceRoot } from '#lib/agent-host-placement.js';
import type { ProjectListItem } from '#types/project-library.types.js';

type NativeDirectories = NonNullable<DesktopBridge['directories']>;

/** The host's own file manager glyph: Finder, File Explorer, or a folder elsewhere. */
export function NativeFileManagerIcon({ icon }: { readonly icon: NativeDirectories['openIcon'] }): React.JSX.Element {
  if (icon === 'finder') {
    return <SvgIcon id='finder' aria-hidden />;
  }
  return icon === 'file-explorer' ? <PanelsTopLeft aria-hidden /> : <FolderOpen aria-hidden />;
}

/** Opening a whole project's folder, as the sidebar and project cards offer it. */
export type OpenProjectInFileManager = {
  readonly label: string;
  readonly icon: NativeDirectories['openIcon'];
  readonly isOpening: boolean;
  readonly open: () => Promise<void>;
};

/**
 * Open a disk-backed project's folder in the host's file manager.
 *
 * @param project - The project to open; browser-stored projects have no folder.
 * @returns The action, or `undefined` when this host or project has no native folder.
 */
export function useOpenProjectInFileManager(
  project: Pick<ProjectListItem, 'id' | 'name' | 'locator'>,
): OpenProjectInFileManager | undefined {
  const directories = project.locator.backend === 'node' ? desktopBridge()?.directories : undefined;
  const [isOpening, setIsOpening] = useState(false);
  if (!directories) {
    return undefined;
  }
  return {
    label: directories.openLabel,
    icon: directories.openIcon,
    isOpening,
    async open() {
      if (isOpening) {
        return;
      }
      setIsOpening(true);
      try {
        await directories.open(await desktopWorkspaceRoot(project.id));
      } catch (error) {
        toast.error(`Could not open ${project.name}`, {
          description: error instanceof Error ? error.message : 'Try opening the folder again.',
        });
      } finally {
        setIsOpening(false);
      }
    },
  };
}

/**
 * Select one project file or folder in the host's file manager.
 *
 * @param projectId - Project whose files the path is relative to.
 * @param path - Project-relative path; `''` is the project root.
 * @throws When the host cannot reveal paths, the project is not on disk, or the path is gone.
 */
export const revealProjectPathInFileManager = async (projectId: string, path: string): Promise<void> => {
  const directories = desktopBridge()?.directories;
  if (!directories) {
    throw new Error('This build of Tau cannot open the file manager.');
  }
  const config = await getProjectFileSystemConfig(projectId);
  if (config?.backend !== 'node') {
    throw new Error('This project is stored in the browser, so it has no folder on disk.');
  }
  const relative = resolveRootedPath(path);
  const root = `${config.path ?? nodeHomeRoot()}/${config.providerBasePath}`;
  await directories.reveal(relative ? `${root}/${relative}` : root);
};

/** Revealing project paths, as the file tree and pane tabs offer it. */
export type RevealInFileManager = {
  readonly label: string;
  readonly icon: NativeDirectories['openIcon'];
  /** Resolves once revealed or once the failure has been reported. */
  readonly reveal: (path: string) => Promise<void>;
};

/**
 * Reveal project paths in the host's file manager, reporting failures as toasts.
 *
 * @param projectId - The open project, when one is loaded.
 * @returns The action, or `undefined` when this host has no native file manager.
 */
export function useRevealInFileManager(projectId: string | undefined): RevealInFileManager | undefined {
  const directories = desktopBridge()?.directories;
  if (!directories || projectId === undefined) {
    return undefined;
  }
  return {
    label: directories.revealLabel,
    icon: directories.openIcon,
    async reveal(path) {
      try {
        await revealProjectPathInFileManager(projectId, path);
      } catch (error) {
        const name = path.split('/').findLast((segment) => segment.length > 0) ?? 'the project';
        toast.error(`Could not reveal ${name}`, {
          description: error instanceof Error ? error.message : 'Try revealing it again.',
        });
      }
    },
  };
}
