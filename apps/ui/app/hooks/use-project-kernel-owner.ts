import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import type { KernelOwner } from '@taucad/chat/prompts';
import { catalogKernelOfRuntimeKernel, kernelConfigurations } from '@taucad/types/constants';
import type { KernelId } from '@taucad/types/constants';
import { useProject } from '#hooks/use-project.js';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';

/** The one catalog kernel whose entry file has this path's extension, when only one does (`.scad`, `.kcl`, `.cs`). */
const kernelOfUniqueExtension = (entryPath: string): KernelId | undefined => {
  const extension = entryPath.split('.').at(-1)?.toLowerCase();
  const matches = kernelConfigurations.filter(({ mainFile }) => mainFile.toLowerCase().endsWith(`.${extension ?? ''}`));
  return matches.length === 1 ? matches[0]?.id : undefined;
};

/**
 * The project's owner kernel (blueprint D2): the kernel the runtime bound for the main entry, or, before the main entry
 * has been described, the one kernel its extension can name. None while the project is entry-less, that is while main
 * is undeclared or names no file (D3), or while a `.ts`, `.js` or `.py` entry has not been described yet.
 *
 * @param input - The main entry, whether it names a file, and the runtime kernel bound for it.
 * @returns The owner, or undefined.
 */
export const projectKernelOwner = (
  input: Readonly<{ entryPath: string | undefined; resolves: boolean; runtimeKernelId: string | undefined }>,
): KernelOwner | undefined => {
  if (!input.entryPath || !input.resolves) {
    return undefined;
  }
  const bound = input.runtimeKernelId === undefined ? undefined : catalogKernelOfRuntimeKernel(input.runtimeKernelId);
  const kernel = bound ?? kernelOfUniqueExtension(input.entryPath);
  return kernel === undefined ? undefined : { kernel, entryPath: input.entryPath };
};

/**
 * The open project's owner kernel, following the file tree and the main entry's binding. Undefined outside a project.
 *
 * @returns The owner, or undefined.
 */
export const useProjectKernelOwner = (): KernelOwner | undefined => {
  const projectContext = useProject({ enableNoContext: true });
  const treeService = useOptionalFileManager()?.treeService;
  const mainEntryPath = projectContext?.mainEntryPath === '' ? undefined : projectContext?.mainEntryPath;
  const subscribe = useCallback(
    (listener: () => void): (() => void) => treeService?.subscribeTree(listener) ?? (() => undefined),
    [treeService],
  );
  const readResolves = useCallback(
    (): boolean =>
      treeService !== undefined &&
      mainEntryPath !== undefined &&
      treeService.getTreeSnapshot().get(mainEntryPath)?.type === 'file',
    [treeService, mainEntryPath],
  );
  const resolves = useSyncExternalStore(subscribe, readResolves, readResolves);

  const mainUnit = mainEntryPath === undefined ? undefined : projectContext?.geometryUnits.get(mainEntryPath);
  const runtimeKernelId = useSelector(mainUnit, (state) => state?.context.activeKernelId);
  const owner = projectKernelOwner({ entryPath: mainEntryPath, resolves, runtimeKernelId });
  const ownerKernel = owner?.kernel;
  const ownerPath = owner?.entryPath;
  /* One reference per owner, so memoised consumers do not recompute on every render. */
  return useMemo(
    () =>
      ownerKernel === undefined || ownerPath === undefined ? undefined : { kernel: ownerKernel, entryPath: ownerPath },
    [ownerKernel, ownerPath],
  );
};
