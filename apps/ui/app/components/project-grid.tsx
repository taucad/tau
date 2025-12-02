import { Star, Eye, ArrowRight } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useSelector } from '@xstate/react';
import type { Build } from '@taucad/types';
import { idPrefix, kernelConfigurations } from '@taucad/types/constants';
import { fromPromise } from 'xstate';
import { generatePrefixedId } from '@taucad/utils/id';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { Button } from '#components/ui/button.js';
import { Avatar, AvatarFallback, AvatarImage } from '#components/ui/avatar.js';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '#components/ui/card.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';
import { HammerAnimation } from '#components/hammer-animation.js';
import { LoadingSpinner } from '#components/ui/loading-spinner.js';
import { BuildProvider, useBuild } from '#hooks/use-build.js';
import { useBuildManager } from '#hooks/use-build-manager.js';
import type { BuildWithFiles } from '#constants/build-examples.js';

type CommunityBuildCardProperties = BuildWithFiles;

export type CommunityBuildGridProperties = {
  readonly builds: BuildWithFiles[];
  readonly hasMore?: boolean;
  readonly onLoadMore?: () => void;
};

export function CommunityBuildGrid({ builds, hasMore, onLoadMore }: CommunityBuildGridProperties): React.JSX.Element {
  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {builds.map((build) => (
          <BuildProvider
            key={build.id}
            buildId={build.id}
            input={{ shouldLoadModelOnStart: false }}
            provide={{
              actors: {
                loadBuildActor: fromPromise(async () => {
                  const { files, ...rest } = build;
                  return rest;
                }),
              },
            }}
          >
            <ProjectCard {...build} />
          </BuildProvider>
        ))}
      </div>

      {hasMore ? (
        <div className="mt-8 text-center">
          <Button variant="outline" onClick={onLoadMore}>
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
  stars,
  author,
  tags,
  assets,
  files,
}: CommunityBuildCardProperties) {
  const [showPreview, setShowPreview] = useState(false);
  const [isForking, setIsForking] = useState(false);
  const [hasLoadedModel, setHasLoadedModel] = useState(false);

  // Get actors from BuildProvider context
  const { cadRef, buildRef } = useBuild();
  const geometries = useSelector(cadRef, (state) => state.context.geometries);
  const status = useSelector(cadRef, (state) => state.value);
  const buildManager = useBuildManager();

  const navigate = useNavigate();

  const kernels = useMemo(() => [], []);

  const mechanicalAsset = assets.mechanical;
  if (!mechanicalAsset) {
    throw new Error('Mechanical asset not found');
  }

  // Load the CAD model when preview is enabled for the first time
  useEffect(() => {
    if (showPreview && !hasLoadedModel) {
      buildRef.send({ type: 'loadModel' });
      setHasLoadedModel(true);
    }
  }, [showPreview, hasLoadedModel, buildRef]);

  const handleStar = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    // TODO: Implement star functionality
  }, []);

  const handleFork = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();

      if (isForking) {
        return;
      }

      setIsForking(true);

      const chatId = generatePrefixedId(idPrefix.chat);
      try {
        // Create a new build with forked data
        const newBuild: Omit<Build, 'id' | 'createdAt' | 'updatedAt'> = {
          name: `${name} (Remixed)`,
          description,
          thumbnail,
          stars: 0,
          forks: 0,
          author, // TODO: This should be the current user in a real implementation
          tags,
          assets,
          forkedFrom: id,
          lastChatId: chatId,
        };

        const createdBuild = await buildManager.createBuild(newBuild, files);

        // Navigate to the new build
        await navigate(`/builds/${createdBuild.id}`);
      } catch (error: unknown) {
        console.error('Failed to remix project:', error);
        // TODO: Show error toast/notification to user
        setIsForking(false);
      }
    },
    [isForking, name, description, thumbnail, author, tags, assets, id, buildManager, files, navigate],
  );

  const handlePreviewToggle = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      setShowPreview(!showPreview);
    },
    [showPreview],
  );

  const handleCardClick = useCallback(() => {
    void navigate(`/builds/${id}/preview`);
  }, [navigate, id]);

  return (
    <Card className="group relative flex flex-col overflow-hidden pt-0">
      <div className="cursor-pointer" onClick={handleCardClick}>
        <div className="inset-0 aspect-video h-fit w-full overflow-hidden bg-muted group-hover:bg-accent/70">
          {!showPreview && (
            <img src={thumbnail || '/placeholder.svg'} alt={name} className="size-full object-cover" loading="lazy" />
          )}
          {showPreview ? (
            <div className="size-full object-cover">
              {['initializing', 'booting'].includes(status) ? (
                <div className="flex size-full items-center justify-center">
                  <HammerAnimation className="size-10" />
                </div>
              ) : null}
              <div
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <CadViewer
                  enablePan={false}
                  enableLines={false}
                  enableMatcap={false}
                  geometries={geometries}
                  className="cursor-default bg-transparent"
                  stageOptions={{
                    zoomLevel: 1.5,
                  }}
                />
              </div>
            </div>
          ) : null}
          <Button variant="overlay" size="icon" className="absolute top-2 right-2 z-10" onClick={handlePreviewToggle}>
            <Eye className={showPreview ? 'size-4 text-primary' : 'size-4'} />
          </Button>
        </div>
        <div className="flex h-28 flex-col justify-between pt-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{name}</CardTitle>
              <div className="flex flex-wrap gap-1">
                {kernels.map((kernel) => {
                  const kernelConfiguration = kernelConfigurations.find((k) => k.id === kernel);
                  if (!kernelConfiguration) {
                    return null;
                  }

                  const kernelName = kernelConfiguration.name;
                  return (
                    <Tooltip key={kernel}>
                      <TooltipTrigger>
                        <Avatar className="h-5 w-5">
                          <AvatarFallback>
                            <SvgIcon id={kernel} className="size-3" />
                          </AvatarFallback>
                        </Avatar>
                      </TooltipTrigger>
                      <TooltipContent>{kernelName}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
            <CardDescription className="line-clamp-2">{description}</CardDescription>
          </CardHeader>
          <CardFooter className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="size-6">
                <AvatarImage src={author.avatar} alt={author.name} />
                <AvatarFallback>{author.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="line-clamp-1 text-sm text-muted-foreground">{author.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="group flex items-center gap-1 text-sm text-muted-foreground hover:text-yellow"
                    onClick={handleStar}
                  >
                    {stars}
                    <Star />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Star this project</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
                    disabled={isForking}
                    onClick={handleFork}
                  >
                    <span className="text-sm">Remix</span>
                    {isForking ? <LoadingSpinner /> : <ArrowRight />}
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
