/**
 * The app's binding of the native file manager actions (`@taucad/files-ui/hooks/use-native-file-manager`).
 *
 * The actions live in files-ui; this binding passes the folder the desktop agent host works in
 * (`#lib/agent-host-placement`), read when a folder is opened, so a suite that mocks that module reaches the action
 * through it. App readers import the actions from here, so a suite that mocks this module replaces them for all of
 * them.
 */
import {
  NativeFileManagerIcon as NativeFileManagerGlyph,
  useOpenProjectInFileManager as useOpenProjectFolder,
  useRevealInFileManager as useRevealProjectPath,
} from '@taucad/files-ui/hooks/use-native-file-manager';
import type {
  OpenProjectInFileManager,
  OpenProjectInFileManagerServices,
  RevealInFileManager,
} from '@taucad/files-ui/hooks/use-native-file-manager';
import type { ProjectListItem } from '@taucad/files-ui/types/project-library.types';
import { desktopWorkspaceRoot } from '#lib/agent-host-placement.js';

const openProjectServices: OpenProjectInFileManagerServices = {
  resolveProjectFolder: async (projectId) => desktopWorkspaceRoot(projectId),
};

/**
 * The host's own file manager glyph: Finder, File Explorer, or a folder elsewhere.
 *
 * @param props - The host's file manager icon.
 * @returns The glyph.
 */
export function NativeFileManagerIcon(props: Parameters<typeof NativeFileManagerGlyph>[0]): React.JSX.Element {
  return <NativeFileManagerGlyph {...props} />;
}

/**
 * Open a disk-backed project's folder in the host's file manager.
 *
 * @param project - The project to open; browser-stored projects have no folder.
 * @returns The action, or `undefined` when this host or project has no native folder.
 */
export function useOpenProjectInFileManager(
  project: Pick<ProjectListItem, 'id' | 'name'> & Partial<Pick<ProjectListItem, 'locator'>>,
): OpenProjectInFileManager | undefined {
  return useOpenProjectFolder(project, openProjectServices);
}

/**
 * Reveal project paths in the host's file manager, reporting failures as toasts.
 *
 * @param projectId - The open project, when one is loaded.
 * @returns The action, or `undefined` when this host has no native file manager.
 */
export function useRevealInFileManager(projectId: string | undefined): RevealInFileManager | undefined {
  return useRevealProjectPath(projectId);
}
