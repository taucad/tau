import type { ComponentType } from 'react';
import { Star, GitFork } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { SvgIcon } from '@/components/icons/svg-icon';
import { Build } from '@/types/build';
import { CadProvider, CATEGORIES, Category } from '@/types/cad';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

// Placeholder for language icons
const LANGUAGE_ICONS: Record<CadProvider, ComponentType<{ className?: string }>> = {
  replicad: ({ className }) => <SvgIcon id="replicad" className={className} />,
  openscad: ({ className }) => <SvgIcon id="openscad" className={className} />,
  kicad: ({ className }) => <SvgIcon id="kicad" className={className} />,
  kcl: ({ className }) => <SvgIcon id="kcl" className={className} />,
  cpp: ({ className }) => <SvgIcon id="cpp" className={className} />,
};

interface ProjectCardProperties extends Build {
  onStar?: (id: string) => void;
  onFork?: (id: string) => void;
}

export interface ProjectGridProperties {
  projects: Build[];
  onStar?: (id: string) => void;
  onFork?: (id: string) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export function ProjectGrid({ projects, onStar, onFork, hasMore, onLoadMore }: ProjectGridProperties) {
  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projects.map((project) => (
          <ProjectCard key={project.id} {...project} onStar={onStar} onFork={onFork} />
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
  onStar,
  onFork,
}: ProjectCardProperties) {
  const LanguageIcon = Object.values(assets)
    .map((asset) => asset.language)
    .map((language) => ({
      Icon: LANGUAGE_ICONS[language],
      language,
    }));

  return (
    <Card className="group relative overflow-hidden flex flex-col">
      <div className="aspect-video overflow-hidden bg-muted">
        <img
          src={thumbnail || '/placeholder.svg'}
          alt={name}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
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
        <div className="flex flex-wrap gap-2 mb-2">
          {Object.keys(assets).map((category) => {
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
            onClick={() => onStar?.(id)}
          >
            <Star className="size-4" />
            {stars}
          </button>
          <button
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-blue"
            onClick={() => onFork?.(id)}
          >
            <GitFork className="size-4" />
            {forks}
          </button>
        </div>
      </CardFooter>
    </Card>
  );
}
