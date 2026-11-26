import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { GitFork } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useProjectManager } from '#hooks/use-project-manager.js';
import type { CreateProjectOptions } from '@taucad/project-library/runtime/project-library-commands';
import { useProjectCreationLocationError } from '#hooks/use-project-creation-location-error.js';
import { toast } from '@taucad/ui/components/sonner';
import { projectUrl } from '@taucad/files-ui/utils/project-url.utils';
import { homeProjectCreationLocation } from '@taucad/ui-core/types/project-creation-location.types';

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

/** A Remix in progress, and the call that starts one. */
export type RemixHandle = {
  /** True while the remix is being created; the trigger is disabled meanwhile. */
  readonly isBusy: boolean;
  /** Copies the source into Home as `<name> (fork)` and opens it. */
  readonly remix: () => Promise<void>;
};

/**
 * The one Remix flow: copy the source into Home as `<name> (fork)` and open it. A Remix
 * asks nothing first — it always lands in Home, never a connected folder, so browsers
 * without folder access (Safari, Brave) and with it (Chrome, desktop) behave alike.
 * Community cards and the example page's {@link ForkAction} both compose it.
 *
 * @param source - What the remix copies.
 * @returns The busy state and the call that starts the remix.
 */
export function useRemix(source: RemixSource): RemixHandle {
  const navigate = useNavigate();
  const projectManager = useProjectManager();
  const presentLocationError = useProjectCreationLocationError();
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);
  const { name } = source.project;

  const remix = useCallback(async () => {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setIsBusy(true);

    try {
      const files = await source.loadFiles();
      const newProject = await projectManager.createProject({
        project: { ...source.project, name: remixProjectName(name) },
        files,
        location: homeProjectCreationLocation,
      });

      toast.success('Remixed to your projects', { description: name });
      void navigate(projectUrl(newProject.slugs));
    } catch (error) {
      if (!presentLocationError(error)) {
        toast.error(`Could not remix ${name}`, {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }, [name, navigate, presentLocationError, projectManager, source]);

  return { isBusy, remix };
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

  const { isBusy, remix } = useRemix(source);

  return (
    <Button
      type='button'
      size='sm'
      variant='secondary'
      aria-label='Remix'
      aria-busy={isBusy}
      className='max-md:size-8 max-md:px-0'
      disabled={isBusy || files.size === 0}
      onClick={() => {
        void remix();
      }}
    >
      <GitFork className='size-3.5 md:mr-1.5' aria-hidden />
      <span className='hidden md:inline'>Remix</span>
    </Button>
  );
}
