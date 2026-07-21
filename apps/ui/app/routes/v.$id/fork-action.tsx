import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSelector } from '@xstate/react';
import deepmerge from 'deepmerge';
import { GitFork } from 'lucide-react';
import { parameterEntryPath } from '@taucad/types';
import { Button } from '#components/ui/button.js';
import { useCadPreview } from '#hooks/use-cad-preview.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { toast } from '#components/ui/sonner.js';
import { encodeTextFile } from '#utils/filesystem.utils.js';
import { createParameterEntry, serializeParameterEntry } from '#utils/parameter-config.utils.js';

export type PublicationForkSource = {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly entryPath: string;
};

type ForkActionProps = {
  readonly publication: PublicationForkSource;
  readonly files: Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>;
};

export function ForkAction({ publication, files }: ForkActionProps): React.JSX.Element {
  const navigate = useNavigate();
  const projectManager = useProjectManager();
  const { cadRef, defaultParameters } = useCadPreview();
  const parameterOverrides = useSelector(cadRef, (snapshot) => snapshot.context.parameters);

  const mergedParameters = useMemo(
    () =>
      deepmerge(defaultParameters, parameterOverrides, {
        arrayMerge: (_target: unknown[], source: unknown[]) => source,
      }),
    [defaultParameters, parameterOverrides],
  );
  const [busy, setBusy] = useState(false);

  const handleFork = useCallback(async () => {
    if (busy || files.size === 0) {
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
            content: encodeTextFile(serializeParameterEntry(createParameterEntry(mergedParameters))),
          },
        },
      });

      toast.success('Forked to your projects');
      void navigate(`/projects/${newProject.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fork failed';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    files,
    mergedParameters,
    navigate,
    projectManager,
    publication.description,
    publication.entryPath,
    publication.title,
  ]);

  return (
    <Button type='button' size='sm' variant='secondary' disabled={busy || files.size === 0} onClick={handleFork}>
      <GitFork className='mr-1.5 size-3.5' aria-hidden />
      Remix
    </Button>
  );
}
