import { ArrowRight } from 'lucide-react';
import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { Button } from '@taucad/ui/components/button';
import { Avatar, AvatarFallback, AvatarImage } from '@taucad/ui/components/avatar';
import { CardHeader, CardTitle, CardFooter } from '@taucad/ui/components/card';
import { Loader } from '#components/ui/loader.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useProjectCreationLocationError } from '#hooks/use-project-creation-location-error.js';
import { CadPreviewProvider } from '#hooks/use-cad-preview.js';
import type { BuiltinProjectCardModel, ProjectFiles } from '#constants/project-examples.js';
import { loadBuiltinProjectFiles } from '#constants/project-examples.js';
import { ProjectCard, ProjectCardCadPreview, ProjectCardMedia } from '#components/project-card.js';
import { projectUrl } from '#utils/project-url.utils.js';
import { formatSharePath } from '@taucad/share/locator';

export const communityGridClassName = 'grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';

export type CommunityProjectGridProperties = {
  readonly projects: readonly BuiltinProjectCardModel[];
  readonly hasMore?: boolean;
  readonly onLoadMore?: () => void;
  readonly limit?: number;
};

export function CommunityProjectGrid({
  projects,
  hasMore,
  onLoadMore,
  limit,
}: CommunityProjectGridProperties): React.JSX.Element {
  const displayedProjects = limit ? projects.slice(0, limit) : projects;

  return (
    <>
      <div className={communityGridClassName}>
        {displayedProjects.map((project) => (
          <CommunityProjectCard key={project.id} {...project} />
        ))}
      </div>

      {hasMore ? (
        <div className='mt-8 text-center'>
          <Button variant='outline' onClick={onLoadMore}>
            Load More Projects
          </Button>
        </div>
      ) : null}
    </>
  );
}

function CommunityProjectCard(project: BuiltinProjectCardModel): React.JSX.Element {
  const { id, name, description, thumbnail, author, tags, assets, locator } = project;
  const [activated, setActivated] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isForking, setIsForking] = useState(false);
  const [files, setFiles] = useState<ProjectFiles>();
  const filesPromise = useRef<Promise<ProjectFiles> | undefined>(undefined);
  const projectManager = useProjectManager();
  const presentLocationError = useProjectCreationLocationError();
  const navigate = useNavigate();

  const thumbnailSource = thumbnail;
  const mainFile = assets.main.entryPath;

  const ensureFiles = useCallback(async (): Promise<ProjectFiles> => {
    filesPromise.current ??= loadBuiltinProjectFiles({ project });
    const loaded = await filesPromise.current;
    setFiles(loaded);
    return loaded;
  }, [project]);

  const handleFork = useCallback(async () => {
    if (isForking) {
      return;
    }

    setIsForking(true);

    try {
      const projectFiles = await ensureFiles();
      const createProject = await projectManager.createProject({
        project: {
          name: `${name} (Remixed)`,
          description,
          tags: [...tags],
          assets,
        },
        files: projectFiles,
      });
      await navigate(projectUrl(createProject.slugs));
    } catch (error) {
      presentLocationError(error);
      setIsForking(false);
    }
  }, [isForking, name, description, tags, assets, projectManager, ensureFiles, navigate, presentLocationError]);

  const handlePreviewVisibilityChange = useCallback(
    (isVisible: boolean) => {
      setActivated(true);
      setVisible(isVisible);
      if (isVisible) {
        void ensureFiles();
      }
    },
    [ensureFiles],
  );

  return (
    <ProjectCard
      to={formatSharePath({ providerId: 'builtin', reference: locator })}
      linkLabel={`Preview ${name}`}
      className='flex flex-col pb-0'
    >
      <ProjectCardMedia
        name={name}
        thumbnailSource={thumbnailSource}
        isPreviewVisible={visible}
        onPreviewVisibilityChange={handlePreviewVisibilityChange}
      >
        {activated && files ? (
          <CadPreviewProvider projectId={id} mainFile={mainFile} files={files}>
            <ProjectCardCadPreview />
          </CadPreviewProvider>
        ) : null}
      </ProjectCardMedia>
      <div className='flex flex-1 flex-col'>
        <CardHeader className='max-md:p-2'>
          <CardTitle className='line-clamp-1 text-sm sm:text-base'>{name}</CardTitle>
        </CardHeader>
        <CardFooter className='mt-auto flex items-center justify-between gap-1.5 p-2 pt-1 sm:gap-2 sm:p-4 sm:pt-2'>
          <div className='hidden items-center gap-2 sm:flex'>
            <Avatar className='size-6'>
              <AvatarImage src={author.avatar} alt={author.name} />
              <AvatarFallback className='text-xs'>{author.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span className='line-clamp-1 text-sm text-muted-foreground'>{author.name}</span>
          </div>
          <div className='relative z-20 flex w-full items-center justify-between gap-1.5 sm:w-auto sm:justify-end sm:gap-2'>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='outline'
                  size='sm'
                  className='flex h-7 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-primary sm:h-8 sm:px-3 sm:text-sm'
                  disabled={isForking}
                  onClick={handleFork}
                >
                  <span className='text-xs sm:text-sm'>Remix</span>
                  {isForking ? (
                    <Loader className='size-3.5 sm:size-4' />
                  ) : (
                    <ArrowRight className='size-3.5 sm:size-4' />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isForking ? 'Remixing project...' : 'Remix this project'}</TooltipContent>
            </Tooltip>
          </div>
        </CardFooter>
      </div>
    </ProjectCard>
  );
}
