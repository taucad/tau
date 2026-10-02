import { Eye, ArrowRight } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { kernelConfigurations } from '@taucad/types/constants';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { Button } from '#components/ui/button.js';
import { Avatar, AvatarFallback, AvatarImage } from '#components/ui/avatar.js';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '#components/ui/card.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { Loader } from '#components/ui/loader.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { CadPreviewProvider } from '#hooks/use-cad-preview.js';
import { CadPreviewViewer } from '#components/cad-preview.js';
import type { ProjectsWithFiles } from '#constants/project-examples.js';
import { KernelTierBadge } from '#components/tier-badge.js';

export const communityGridClassName = 'grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';

export type CommunityProjectGridProperties = {
  readonly projects: ProjectsWithFiles[];
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
          <ProjectCard key={project.id} {...project} />
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

function ProjectCard({
  id,
  name,
  description,
  thumbnail,
  author,
  tags,
  assets,
  files,
}: ProjectsWithFiles): React.JSX.Element {
  const [activated, setActivated] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isForking, setIsForking] = useState(false);
  const projectManager = useProjectManager();
  const navigate = useNavigate();

  const kernels = useMemo(() => [], []);

  const mainFile = assets.mechanical?.main ?? 'main.ts';

  const handleFork = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();

      if (isForking) {
        return;
      }

      setIsForking(true);

      try {
        const createProject = await projectManager.createProject({
          project: {
            name: `${name} (Remixed)`,
            description,
            thumbnail,
            author,
            tags,
            assets,
            forkedFrom: id,
          },
          files,
        });
        await navigate(`/projects/${createProject.id}`);
      } catch {
        setIsForking(false);
      }
    },
    [isForking, name, description, thumbnail, author, tags, assets, id, projectManager, files, navigate],
  );

  const handlePreviewToggle = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setActivated(true);
    setVisible((v) => !v);
  }, []);

  const handleCardClick = useCallback(() => {
    void navigate(`/projects/${id}/preview`);
  }, [navigate, id]);

  return (
    <Card className='group relative flex flex-col overflow-hidden py-0 transition-all duration-300 hover:border-primary/30 hover:bg-muted/70'>
      <div className='flex flex-1 cursor-pointer flex-col' onClick={handleCardClick}>
        <div className='inset-0 aspect-video h-fit w-full overflow-hidden bg-muted group-hover:bg-accent/70 sm:aspect-video'>
          {!visible && (
            <img src={thumbnail || '/placeholder.svg'} alt={name} className='size-full object-cover' loading='lazy' />
          )}
          {activated ? (
            <div className={visible ? 'size-full object-cover' : 'hidden'}>
              <CadPreviewProvider projectId={id} mainFile={mainFile} files={files}>
                <div
                  className='size-full'
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <CadPreviewViewer
                    enablePan={false}
                    stageOptions={{ zoomLevel: 1.5 }}
                    graphicsOptions={{
                      enableLines: false,
                      viewerClassName: 'bg-muted',
                    }}
                  />
                </div>
              </CadPreviewProvider>
            </div>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='overlay'
                size='icon'
                className='absolute top-1 right-1 z-10 size-7 sm:top-2 sm:right-2 sm:size-9'
                onClick={handlePreviewToggle}
              >
                <Eye className={visible ? 'size-3.5 text-primary sm:size-4' : 'size-3.5 sm:size-4'} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Preview model</TooltipContent>
          </Tooltip>
        </div>
        <div className='flex flex-1 flex-col sm:pt-4'>
          <CardHeader className='max-md:p-2'>
            <div className='flex items-center justify-between'>
              <CardTitle className='line-clamp-1 text-sm sm:text-base'>{name}</CardTitle>
              <div className='hidden flex-wrap gap-1 sm:flex'>
                {kernels.map((kernel) => {
                  const kernelConfiguration = kernelConfigurations.find((k) => k.id === kernel);
                  if (!kernelConfiguration) {
                    return null;
                  }

                  const kernelName = kernelConfiguration.name;
                  return (
                    <Tooltip key={kernel}>
                      <TooltipTrigger>
                        <Avatar className='h-5 w-5'>
                          <AvatarFallback>
                            <SvgIcon id={kernelConfiguration.id} className='size-3' />
                          </AvatarFallback>
                        </Avatar>
                      </TooltipTrigger>
                      <TooltipContent className='flex items-center gap-1.5'>
                        {kernelName}
                        <KernelTierBadge kernelId={kernelConfiguration.id} />
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
            <CardDescription className='line-clamp-1 text-xs sm:line-clamp-2 sm:text-sm'>{description}</CardDescription>
          </CardHeader>
          <CardFooter className='mt-auto flex items-center justify-between gap-1.5 p-2 pt-1 sm:gap-2 sm:p-4 sm:pt-2'>
            <div className='hidden items-center gap-2 sm:flex'>
              <Avatar className='size-6'>
                <AvatarImage src={author.avatar} alt={author.name} />
                <AvatarFallback className='text-xs'>{author.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className='line-clamp-1 text-sm text-muted-foreground'>{author.name}</span>
            </div>
            <div className='flex w-full items-center justify-between gap-1.5 sm:w-auto sm:justify-end sm:gap-2'>
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
      </div>
    </Card>
  );
}
