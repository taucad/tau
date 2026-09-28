import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { GitFork } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@taucad/ui/components/dialog';
import { WorkspaceSelector } from '#components/filesystem/workspace-selector.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import type { CreateProjectOptions } from '#hooks/use-project-manager.js';
import { useProjectCreationLocationError } from '#hooks/use-project-creation-location-error.js';
import { toast } from '#components/ui/sonner.js';
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

type CreateProjectData = Extract<CreateProjectOptions, { readonly files: unknown }>;

/** What a Remix copies: the source manifest and, once confirmed, its files. */
export type RemixSource = {
  /** The source's manifest; the remix is named by {@link remixProjectName}. */
  readonly project: CreateProjectData['project'];
  /** Loads the files to copy after the person confirms. */
  readonly loadFiles: () => Promise<CreateProjectData['files']>;
};

/** The one name every Remix gives its copy, from a card or the example page. */
export const remixProjectName = (name: string): string => `${name} (fork)`;

type RemixDialogProps = {
  readonly source: RemixSource;
  /** Renders the trigger button; `isBusy` is true while the remix is being created. */
  readonly children: (isBusy: boolean) => React.ReactElement;
};

/**
 * The one Remix flow: the trigger opens a dialog that asks where the files persist,
 * then creates `<name> (fork)` there and opens it. Community cards and the example
 * page's {@link ForkAction} both compose it.
 */
export function RemixDialog({ source, children }: RemixDialogProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children(isBusy)}</DialogTrigger>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Remix {source.project.name}</DialogTitle>
          <DialogDescription>Choose where the project files will be persisted.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so a grid of cards does not read workspaces up front. */}
        <RemixForm source={source} isBusy={isBusy} onBusyChange={setIsBusy} onOpenChange={setOpen} />
      </DialogContent>
    </Dialog>
  );
}

type RemixFormProps = {
  readonly source: RemixSource;
  readonly isBusy: boolean;
  readonly onBusyChange: (isBusy: boolean) => void;
  readonly onOpenChange: (open: boolean) => void;
};

function RemixForm({ source, isBusy, onBusyChange, onOpenChange }: RemixFormProps): React.JSX.Element {
  const navigate = useNavigate();
  const projectManager = useProjectManager();
  const presentLocationError = useProjectCreationLocationError();
  const location = useProjectCreationLocation();
  const { name } = source.project;

  const handleRemix = useCallback(async () => {
    if (isBusy || location.phase !== 'ready') {
      return;
    }

    onBusyChange(true);

    try {
      const files = await source.loadFiles();
      const newProject = await projectManager.createProject({
        project: { ...source.project, name: remixProjectName(name) },
        files,
        location: location.value,
      });

      onOpenChange(false);
      toast.success('Remixed to your projects', { description: name });
      void navigate(projectUrl(newProject.slugs));
    } catch (error) {
      if (presentLocationError(error)) {
        if (location.hasWebAccessCapability) {
          await location.refresh();
        }
      } else {
        toast.error(`Could not remix ${name}`, {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    } finally {
      onBusyChange(false);
    }
  }, [isBusy, location, name, navigate, onBusyChange, onOpenChange, presentLocationError, projectManager, source]);

  return (
    <>
      <WorkspaceSelector state={location} variant='field' />
      <DialogFooter>
        <Button
          type='button'
          variant='outline'
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
        <Button
          type='button'
          aria-busy={isBusy}
          disabled={isBusy || !location.canCreate}
          onClick={() => {
            void handleRemix();
          }}
        >
          {isBusy ? 'Remixing…' : 'Create remix'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function ForkAction({ publication, files }: ForkActionProps): React.JSX.Element {
  const source = useMemo<RemixSource>(
    () => ({
      project: {
        name: publication.title,
        description: publication.description ?? '',
        tags: [],
        assets: { main: { entryPath: publication.entryPath } },
      },
      loadFiles: async () =>
        Object.fromEntries([...files.entries()].map(([path, file]) => [path, { content: file.content }])),
    }),
    [files, publication.description, publication.entryPath, publication.title],
  );

  return (
    <RemixDialog source={source}>
      {(isBusy) => (
        <Button
          type='button'
          size='sm'
          variant='secondary'
          aria-label='Remix'
          className='max-md:size-8 max-md:px-0'
          disabled={isBusy || files.size === 0}
        >
          <GitFork className='size-3.5 md:mr-1.5' aria-hidden />
          <span className='hidden md:inline'>Remix</span>
        </Button>
      )}
    </RemixDialog>
  );
}
