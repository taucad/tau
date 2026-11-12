import { useCallback, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { KernelId } from '@taucad/types/constants';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { toast } from '@taucad/ui/components/sonner';
import { SvgIcon } from '@taucad/ui-kit/icons/svg-icon';
import { availableKernelConfigurations } from '#constants/available-kernel-configurations.js';
import { kernelPackageFiles } from '#utils/kernel-package-files.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { encodeTextFile } from '@taucad/ui-core/utils/filesystem.utils';
import { getEmptyCode, getMainFile } from '#utils/kernel.utils.js';

/**
 * "Start from a template" on an entry-less project's empty viewer (automatic kernel selection blueprint D3): when the
 * first turn never wrote a model (signed out, offline, cancelled or failed), today's creation path is one pick away.
 * It writes the kernel's template main file and package files, leaving any file already there, and declares main.
 */
export function StartFromTemplate(): React.JSX.Element {
  const { projectRef } = useProject();
  const project = useSelector(projectRef, (state) => state.context.project);
  const fileManager = useFileManager();
  const [isWriting, setIsWriting] = useState(false);

  const start = useCallback(
    async (kernel: KernelId): Promise<void> => {
      if (project === undefined) {
        return;
      }
      setIsWriting(true);
      try {
        const mainFile = getMainFile(kernel);
        const { treeService } = await fileManager.whenServicesReady();
        const files = {
          ...(await kernelPackageFiles(kernel, project.name)),
          [mainFile]: encodeTextFile(getEmptyCode(kernel)),
        };
        // A file already there is kept: the person or the agent may have started one.
        const entries = Object.entries(files);
        const present = await Promise.all(entries.map(async ([path]) => treeService.exists(path)));
        await Promise.all(
          entries
            .filter((_entry, index) => !present[index])
            .map(async ([path, content]) => fileManager.writeFile(path, content, { source: 'machine' })),
        );
        projectRef.send({ type: 'setMainFile', path: mainFile });
      } catch (error) {
        console.error('[start-from-template] failed', error);
        toast.error('Could not start from a template');
      } finally {
        setIsWriting(false);
      }
    },
    [fileManager, project, projectRef],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm' disabled={isWriting}>
          Start from a template
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='center' className='w-56'>
        {availableKernelConfigurations().map(({ id, name }) => (
          <DropdownMenuItem
            key={id}
            onSelect={() => {
              void start(id);
            }}
          >
            <SvgIcon id={id} aria-hidden className='size-4 grayscale' />
            {name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
