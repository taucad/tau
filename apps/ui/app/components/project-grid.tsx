import type { ComponentType } from 'react';
import { Star, GitFork, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { SvgIcon } from '@/components/icons/svg-icon';
import { Build } from '@/types/build';
import { CadProvider, CATEGORIES, Category } from '@/types/cad';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { ReplicadProvider, useReplicad } from '@/components/geometry/kernel/replicad/replicad-context';
import { ReplicadViewer } from '@/components/geometry/kernel/replicad/replicad-viewer';
import { useState, useEffect, useRef } from 'react';
import { storage } from '@/db/storage';
import { useNavigate } from '@remix-run/react';

// Placeholder for language icons
const LANGUAGE_ICONS: Record<CadProvider, ComponentType<{ className?: string }>> = {
  replicad: ({ className }) => <SvgIcon id="replicad" className={className} />,
  openscad: ({ className }) => <SvgIcon id="openscad" className={className} />,
  kicad: ({ className }) => <SvgIcon id="kicad" className={className} />,
  kcl: ({ className }) => <SvgIcon id="kcl" className={className} />,
  cpp: ({ className }) => <SvgIcon id="cpp" className={className} />,
};

type CommunityBuildCardProperties = Build;

export interface CommunityBuildGridProperties {
  builds: Build[];
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export function CommunityBuildGrid({ builds, hasMore, onLoadMore }: CommunityBuildGridProperties) {
  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {builds.map((build) => (
          <ReplicadProvider key={build.id}>
            <ProjectCard {...build} />
          </ReplicadProvider>
        ))}
      </div>

      {hasMore && (
        <div className="mt-8 text-center">
          <Button onClick={onLoadMore} variant="outline">
            Load More Projects
          </Button>
        </div>
      )}
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
  const { setCode, mesh } = useReplicad();
  const navigate = useNavigate();
  const LanguageIcon = Object.values(assets)
    .map((asset) => asset.language)
    .map((language) => ({
      Icon: LANGUAGE_ICONS[language],
      language,
    }));

  // Get the replicad code if available
  const replicadAsset = Object.values(assets).find((asset) => asset.language === 'replicad');
  const replicadCode = replicadAsset?.files[replicadAsset.main]?.content;

  // Set up intersection observer to detect when card is visible
  useEffect(() => {
    if (!cardReference.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsVisible(entry.isIntersecting);
        }
      },
      {
        root: undefined,
        rootMargin: '50px', // Start loading a bit before the card comes into view
        threshold: 0.1,
      },
    );

    observer.observe(cardReference.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // When card becomes visible or preview is manually toggled, compile the code
  useEffect(() => {
    if ((isVisible || showPreview) && replicadCode) {
      setCode(replicadCode);
    }
  }, [isVisible, showPreview, replicadCode, setCode]);

  // eslint-disable-next-line unicorn/consistent-function-scoping -- This is a placeholder for future functionality
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
    navigate(`/builds/${createdBuild.id}`);
  };

  return (
    <Card ref={cardReference} className="group relative flex flex-col overflow-hidden">
      <div className="relative aspect-video overflow-hidden bg-muted">
        {!showPreview && !isVisible && (
          <img
            src={thumbnail || '/placeholder.svg'}
            alt={name}
            className="size-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        )}
        {replicadCode && (isVisible || showPreview) && (
          <div className="absolute inset-0">
            <ReplicadViewer mesh={mesh} className="bg-muted" zoomLevel={1.3} />
          </div>
        )}
        {replicadCode && (
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
        )}
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
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Object.keys() returns a string array.
            const { icon: Icon, color } = CATEGORIES[category as Category];
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
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-yellow"
            onClick={handleStar}
          >
            <Star className="size-4" />
            {stars}
          </button>
          <button
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
