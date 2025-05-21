import type { ComponentType, JSX } from 'react';
import { Star, GitFork, Eye } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useActor, useSelector } from '@xstate/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { Button } from '~/components/ui/button.js';
import { Badge } from '~/components/ui/badge.js';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '~/components/ui/card.js';
import { SvgIcon } from '~/components/icons/svg-icon.js';
import type { Build } from '~/types/build.js';
import type { CadKernelProvider, Category } from '~/types/cad.js';
import { categories } from '~/types/cad.js';
import { CadViewer } from '~/components/geometry/cad/cad-viewer.js';
import { storage } from '~/db/storage.js';
import { cadMachine } from '~/machines/cad.js';

// Placeholder for language icons
const languageIcons: Record<CadKernelProvider, ComponentType<{ className?: string }>> = {
  replicad: ({ className }) => <SvgIcon id="replicad" className={className} />,
  openscad: ({ className }) => <SvgIcon id="openscad" className={className} />,
  kicad: ({ className }) => <SvgIcon id="kicad" className={className} />,
  kcl: ({ className }) => <SvgIcon id="kcl" className={className} />,
  cpp: ({ className }) => <SvgIcon id="cpp" className={className} />,
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
  author,
  tags,
  assets,
}: CommunityBuildCardProperties) {
  const [showPreview, setShowPreview] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const cardReference = useRef<HTMLDivElement>(null);

  // Create a unique instance of the CAD machine for this card using the card's ID
  const [_, send, actorRef] = useActor(cadMachine, { input: { id: `cad-card-${id}` } });
  const shapes = useSelector(actorRef, (state) => state.context.shapes);

  const navigate = useNavigate();

  const LanguageIcon = Object.values(assets)
    .map((asset) => asset.language)
    .map((language) => ({
      Icon: languageIcons[language],
      language,
    }));

  // Get the replicad code if available
  const replicadAsset = Object.values(assets).find((asset) => asset.language === 'replicad');
  const replicadCode = replicadAsset?.files[replicadAsset.main]?.content;

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

  // Only load the CAD model when the card is visible and preview is enabled
  useEffect(() => {
    if (isVisible && showPreview && replicadCode) {
      send({ type: 'setCode', code: replicadCode });
    }
  }, [isVisible, showPreview, replicadCode, send]);

  const handleStar = () => {
    // TODO: Implement star functionality
  };

  const handleFork = async () => {
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
      messages: [], // Initialize with empty messages array
    };

    const createdBuild = await storage.createBuild(newBuild);
    // Navigate to the new build
    void navigate(`/builds/${createdBuild.id}`);
  };

  return (
    <Card ref={cardReference} className="group relative flex flex-col overflow-hidden">
      <div className="relative aspect-video overflow-hidden bg-muted">
        {!showPreview && (
          <img
            src={thumbnail || '/placeholder.svg'}
            alt={name}
            className="size-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        )}
        {replicadCode && showPreview ? (
          <div className="absolute inset-0">
            <CadViewer shapes={shapes} className="bg-muted" zoomLevel={1.8} />
          </div>
        ) : null}
        {replicadCode ? (
          <Button
            variant="overlay"
            size="icon"
            className="absolute top-2 right-2 z-10"
            onClick={(event) => {
              event.stopPropagation();
              setShowPreview(!showPreview);
            }}
          >
            <Eye className={showPreview ? 'size-4 text-primary' : 'size-4'} />
          </Button>
        ) : null}
      </div>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{name}</CardTitle>
          <div className="flex flex-wrap gap-1">
            {LanguageIcon.map(({ language, Icon }) => (
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
      <CardContent className="flex-grow">
        <div className="mb-2 flex flex-wrap gap-2">
          {Object.keys(assets).map((category) => {
            const { icon: Icon, color } = categories[category as Category];
            return (
              <span key={category} className={`flex items-center gap-1 text-sm ${color}`}>
                <Icon className="size-4" />
                {category}
              </span>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={author.avatar} alt={author.name} />
            <AvatarFallback>{author.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">{author.name}</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-yellow"
            onClick={handleStar}
          >
            <Star className="size-4" />
            {stars}
          </button>
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-blue"
            onClick={handleFork}
          >
            <GitFork className="size-4" />
            {forks}
          </button>
        </div>
      </CardFooter>
    </Card>
  );
}
