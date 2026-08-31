import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { GitFork } from 'lucide-react';
import { parameterEntryPath } from '@taucad/types';
import { Button } from '#components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog.js';
import { WorkspaceSelector } from '#components/filesystem/workspace-selector.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useProjectCreationLocationError } from '#hooks/use-project-creation-location-error.js';
import { toast } from '#components/ui/sonner.js';
import { encodeTextFile } from '#utils/filesystem.utils.js';
import { createParameterEntry, serializeParameterEntry } from '#utils/parameter-config.utils.js';
import { projectUrl } from '#utils/project-url.utils.js';
import { useProjectCreationLocation } from '#hooks/use-project-creation-location.js';

export type PublicationForkSource = {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly entryPath: string;
};

type ForkActionProps = {
  readonly publication: PublicationForkSource;
  readonly files: Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>;
  readonly parameters: Record<string, unknown>;
};

export function ForkAction({ publication, files, parameters }: ForkActionProps): React.JSX.Element {
  const navigate = useNavigate();
  const projectManager = useProjectManager();
  const presentLocationError = useProjectCreationLocationError();
  const location = useProjectCreationLocation();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const handleFork = useCallback(async () => {
    if (busy || files.size === 0 || location.phase !== 'ready') {
      return;
    }

    setBusy(true);

    try {
      const newProject = await projectManager.createProject({
        project: {
          name: `${publication.title} (fork)`,
          description: publication.description ?? '',
          tags: [],
          assets: { main: { entryPath: publication.entryPath } },
        },
        files: {
          ...Object.fromEntries([...files.entries()].map(([path, file]) => [path, { content: file.content }])),
          [parameterEntryPath(publication.entryPath)]: {
            content: encodeTextFile(serializeParameterEntry(createParameterEntry(parameters))),
          },
        },
        location: location.value,
      });

      setOpen(false);
      toast.success('Remixed to your projects');
      void navigate(projectUrl(newProject.slugs));
    } catch (error) {
      if (presentLocationError(error)) {
        if (location.hasWebAccessCapability) {
          await location.refresh();
        }
      } else {
        const message = error instanceof Error ? error.message : 'Fork failed';
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    files,
    location,
    parameters,
    navigate,
    projectManager,
    presentLocationError,
    publication.description,
    publication.entryPath,
    publication.title,
  ]);

  return (
    <>
      <Button
        type='button'
        size='sm'
        variant='secondary'
        aria-label='Remix'
        className='max-sm:size-8 max-sm:px-0'
        disabled={busy || files.size === 0}
        onClick={() => {
          setOpen(true);
        }}
      >
        <GitFork className='size-3.5 sm:mr-1.5' aria-hidden />
        <span className='hidden sm:inline'>Remix</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Remix {publication.title}</DialogTitle>
            <DialogDescription>Choose where the project files will be persisted.</DialogDescription>
          </DialogHeader>
          <WorkspaceSelector state={location} variant='field' />
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type='button'
              disabled={busy || !location.canCreate}
              onClick={() => {
                void handleFork();
              }}
            >
              {busy ? 'Remixing…' : 'Create remix'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
