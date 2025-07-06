import type { ComponentType, JSX } from 'react';
import { Star, GitFork, Eye } from 'lucide-react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useActor, useSelector } from '@xstate/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { Button } from '~/components/ui/button.js';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar.js';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '~/components/ui/card.js';
import { SvgIcon } from '~/components/icons/svg-icon.js';
import type { Build } from '~/types/build.types.js';
import type { KernelProvider } from '~/types/kernel.types';
import { CadViewer } from '~/components/geometry/cad/cad-viewer.js';
import { storage } from '~/db/storage.js';
import { cadMachine } from '~/machines/cad.machine.js';
import { HammerAnimation } from '~/components/hammer-animation.js';

// Placeholder for language icons
const kernelIcons: Record<KernelProvider, ComponentType<{ className?: string }>> = {
  replicad: ({ className }) => <SvgIcon id="replicad" className={className} />,
  openscad: ({ className }) => <SvgIcon id="openscad" className={className} />,
};

type CommunityBuildCardProperties = Build;

export type CommunityBuildGridProperties = {
  readonly builds: Build[];
  readonly hasMore?: boolean;
  readonly onLoadMore?: () => void;
};

export function CommunityBuildGrid({ builds, hasMore, onLoadMore }: CommunityBuildGridProperties): JSX.Element {
  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {builds.map((build) => (
          <ProjectCard key={build.id} {...build} />
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
  forks,
  chats,
  author,
  tags,
  assets,
}: CommunityBuildCardProperties) {
  const [showPreview, setShowPreview] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const cardReference = useRef<HTMLDivElement>(null);

  // Create a unique instance of the CAD machine for this card using the card's ID
  const [_, send, actorRef] = useActor(cadMachine, { input: { shouldInitializeKernelOnStart: false } });
  const shapes = useSelector(actorRef, (state) => state.context.shapes);
  const status = useSelector(actorRef, (state) => state.value);

  const navigate = useNavigate();

  // Memoize the KernelIcon computation to prevent re-creation on every render
  const KernelIcon = useMemo(
    () =>
      Object.values(assets)
        .map((asset) => asset.language)
        .map((kernel) => ({
          Icon: kernelIcons[kernel],
          language: kernel,
        })),
    [assets],
  );

  // Set up visibility observer
  useEffect(() => {
    const currentElement = cardReference.current;
    if (!currentElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          // Once we've detected visibility, we can stop observing
          observer.disconnect();
        }
      },
      { threshold: 0.1 }, // Trigger when at least 10% of the card is visible
    );

    observer.observe(currentElement);

    return () => {
      if (currentElement) {
        observer.unobserve(currentElement);
      }
    };
  }, []);

  const mechanicalAsset = assets.mechanical;
  if (!mechanicalAsset) throw new Error('Mechanical asset not found');

  // Only load the CAD model when the card is visible and preview is enabled
  useEffect(() => {
    if (isVisible && showPreview && mechanicalAsset) {
      send({
        type: 'initializeModel',
        code: mechanicalAsset.files[mechanicalAsset.main].content,
        parameters: mechanicalAsset.parameters,
        kernelType: mechanicalAsset.language,
      });
    }
  }, [isVisible, showPreview, mechanicalAsset, send]);

  const handleStar = useCallback(() => {
    // TODO: Implement star functionality
  }, []);

  const handleFork = useCallback(async () => {
    // Create a new build with forked data
    const newBuild: Omit<Build, 'id'> = {
      name: `${name} (Fork)`,
      description,
      thumbnail,
      stars: 0,
      forks: 0,
      author, // This should be the current user in a real implementation
      tags,
      assets,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      forkedFrom: id,
      chats,
    };

    const createdBuild = await storage.createBuild(newBuild);
    // Navigate to the new build
    await navigate(`/builds/${createdBuild.id}`);
  }, [name, description, thumbnail, author, tags, assets, id, chats, navigate]);

  const handlePreviewToggle = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      setShowPreview(!showPreview);
    },
    [showPreview],
  );

  return (
    <Card ref={cardReference} className="group relative flex flex-col overflow-hidden">
      <div className="relative aspect-video overflow-hidden bg-muted">
        {!showPreview && (
          <img
            src={thumbnail || '/placeholder.svg'}
            alt={name}
            className="size-full scale-110 object-cover transition-transform group-hover:scale-120"
            loading="lazy"
          />
        )}
        {showPreview ? (
          <div className="absolute inset-0">
            {['initializing', 'booting'].includes(status) ? (
              <div className="flex size-full items-center justify-center">
                <HammerAnimation className="size-10" />
              </div>
            ) : null}
            <CadViewer
              enableLines={false}
              shapes={shapes}
              className="bg-muted"
              stageOptions={{
                zoomLevel: 1.5,
              }}
            />
          </div>
        ) : null}
        <Button variant="overlay" size="icon" className="absolute top-2 right-2 z-10" onClick={handlePreviewToggle}>
          <Eye className={showPreview ? 'size-4 text-primary' : 'size-4'} />
        </Button>
      </div>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{name}</CardTitle>
          <div className="flex flex-wrap gap-1">
            {KernelIcon.map(({ language, Icon }) => (
              <Tooltip key={language}>
                <TooltipTrigger>
                  <Avatar className="h-5 w-5">
                    <AvatarFallback>
                      <Icon className="size-3" />
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent>{language}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
        <CardDescription className="line-clamp-2">{description}</CardDescription>
      </CardHeader>
      <CardFooter className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={author.avatar} alt={author.name} />
            <AvatarFallback>{author.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">{author.name}</span>
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
                <Star />
                {stars}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Star this project</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-blue"
                onClick={handleFork}
              >
                <GitFork />
                {forks}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fork this project</TooltipContent>
          </Tooltip>
        </div>
      </CardFooter>
    </Card>
  );
}
