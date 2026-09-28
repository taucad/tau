import { ArrowRight } from 'lucide-react';
import { useState, useCallback, useMemo, useRef } from 'react';
import { resolveKernel } from '@taucad/types/constants';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { formatSharePath } from '@taucad/share/locator';
import { Loader } from '#components/ui/loader.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { CadPreviewProvider } from '#hooks/use-cad-preview.js';
import type { BuiltinProjectCardModel, ProjectFiles } from '#constants/project-examples.js';
import { loadBuiltinProjectFiles } from '#constants/project-examples.js';
import { ProjectCard, ProjectCardCadPreview, ProjectCardMedia } from '#components/project-card.js';
import { RemixDialog } from '#components/share/fork-action.js';
import type { RemixSource } from '#components/share/fork-action.js';

/** The project card grid, shared by the Community, the landing strip and their skeletons. */
export const projectGridClassName = 'grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';

export type CommunityProjectGridProperties = {
  readonly projects: readonly BuiltinProjectCardModel[];
  readonly limit?: number;
  /** The example that spans two columns and rows, when it is in `projects`. */
  readonly featuredLocator?: string;
};

export function CommunityProjectGrid({
  projects,
  limit,
  featuredLocator,
}: CommunityProjectGridProperties): React.JSX.Element {
  const displayedProjects = limit ? projects.slice(0, limit) : projects;
  /* One live preview at a time: opening another card's preview releases this one. */
  const [previewLocator, setPreviewLocator] = useState<string>();

  return (
    <ul role='list' className={cn(projectGridClassName, 'grid-flow-dense')}>
      {displayedProjects.map((project) => {
        const isFeatured = project.locator === featuredLocator;
        return (
          <li key={project.id} id={project.locator} className={cn(isFeatured && 'col-span-2 lg:row-span-2')}>
            <CommunityProjectCard
              project={project}
              isFeatured={isFeatured}
              isPreviewVisible={previewLocator === project.locator}
              onPreviewLocatorChange={setPreviewLocator}
            />
          </li>
        );
      })}
    </ul>
  );
}

type CommunityProjectCardProperties = {
  readonly project: BuiltinProjectCardModel;
  readonly isFeatured: boolean;
  readonly isPreviewVisible: boolean;
  readonly onPreviewLocatorChange: (locator: string | undefined) => void;
};

function CommunityProjectCard({
  project,
  isFeatured,
  isPreviewVisible,
  onPreviewLocatorChange,
}: CommunityProjectCardProperties): React.JSX.Element {
  const { id, name, description, thumbnail, kernel, tags, assets, locator } = project;
  const [files, setFiles] = useState<ProjectFiles>();
  const filesPromise = useRef<Promise<ProjectFiles> | undefined>(undefined);

  const mainFile = assets.main.entryPath;

  const ensureFiles = useCallback(async (): Promise<ProjectFiles> => {
    filesPromise.current ??= loadBuiltinProjectFiles({ project });
    const loaded = await filesPromise.current;
    setFiles(loaded);
    return loaded;
  }, [project]);

  const remixSource = useMemo<RemixSource>(
    () => ({ project: { name, description, tags: [...tags], assets }, loadFiles: ensureFiles }),
    [assets, description, ensureFiles, name, tags],
  );

  const handlePreviewVisibilityChange = useCallback(
    (isVisible: boolean) => {
      onPreviewLocatorChange(isVisible ? locator : undefined);
      if (isVisible) {
        void ensureFiles();
      }
    },
    [ensureFiles, locator, onPreviewLocatorChange],
  );

  return (
    <ProjectCard
      to={formatSharePath({ providerId: 'builtin', reference: locator })}
      linkLabel={`Open ${name}`}
      className='flex h-full flex-col gap-0 pb-0'
    >
      {/* The wrapper owns the media geometry and the media fills it, so the spanning
          featured card takes its height from the grid rows (size containment). */}
      <div
        className={cn(
          'relative w-full',
          isFeatured ? 'aspect-4/3 lg:aspect-auto lg:flex-1 lg:[contain:size]' : 'aspect-4/3',
        )}
      >
        <ProjectCardMedia
          shouldFill
          thumbnailSource={thumbnail}
          isPreviewVisible={isPreviewVisible}
          onPreviewVisibilityChange={handlePreviewVisibilityChange}
        >
          {files ? (
            <CadPreviewProvider projectId={id} mainFile={mainFile} files={files}>
              <ProjectCardCadPreview />
            </CadPreviewProvider>
          ) : null}
        </ProjectCardMedia>
      </div>
      {/* Below sm the action takes its own full-width row so the title keeps its width. */}
      <div
        className={cn(
          'flex flex-col gap-2 p-3 sm:flex-row sm:items-end sm:justify-between sm:gap-3',
          isFeatured && 'lg:p-4',
        )}
      >
        <div className='min-w-0'>
          <div className='flex items-center gap-2'>
            <h2 className={cn('line-clamp-1 font-semibold', isFeatured ? 'text-xl leading-7' : 'text-base leading-6')}>
              {name}
            </h2>
            {isFeatured ? <Badge variant='secondary'>Featured</Badge> : null}
          </div>
          {isFeatured ? (
            <p className='mt-1 line-clamp-2 max-w-prose text-sm text-muted-foreground'>{description}</p>
          ) : null}
          <p className='mt-1 flex items-center gap-1.5 text-xs leading-4 text-muted-foreground'>
            <SvgIcon id={kernel} className='size-3.5 shrink-0' aria-hidden />
            {resolveKernel(kernel).name}
          </p>
        </div>
        <div className='relative z-20 sm:shrink-0'>
          <RemixDialog source={remixSource}>
            {(isBusy) => (
              <Button variant='outline' size='sm' className='max-sm:w-full' aria-busy={isBusy} disabled={isBusy}>
                Remix
                {isBusy ? <Loader /> : <ArrowRight aria-hidden />}
                <span className='sr-only'> {name}</span>
              </Button>
            )}
          </RemixDialog>
        </div>
      </div>
    </ProjectCard>
  );
}
