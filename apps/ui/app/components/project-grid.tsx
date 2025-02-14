import type { ComponentType } from 'react';
import { Star, GitFork } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { SvgIcon } from '@/components/icons/svg-icon';
import { Cog, Zap, Cpu } from 'lucide-react';

export const CAD_LANGUAGES = ['Replicad', 'OpenSCAD', 'KCL'] as const;
export type CadLanguage = (typeof CAD_LANGUAGES)[number];

export const CATEGORIES = {
  Mechanical: { icon: Cog, color: 'text-blue' },
  Electrical: { icon: Zap, color: 'text-yellow' },
  Firmware: { icon: Cpu, color: 'text-purple' },
} as const;
export type Category = keyof typeof CATEGORIES;

// Placeholder for language icons
const LANGUAGE_ICONS: Record<CadLanguage, ComponentType<{ className?: string }>> = {
  Replicad: ({ className }) => <SvgIcon id="replicad" className={className} />,
  OpenSCAD: ({ className }) => <SvgIcon id="openscad" className={className} />,
  KCL: ({ className }) => <SvgIcon id="zoo" className={className} />,
};

export interface Project {
  id: string;
  title: string;
  description: string;
  image: string;
  stars: number;
  forks: number;
  author: {
    name: string;
    avatar: string;
  };
  language: CadLanguage;
  categories: Category[];
  tags: string[];
}

interface ProjectCardProperties extends Project {
  onStar?: (id: string) => void;
  onFork?: (id: string) => void;
}

export interface ProjectGridProperties {
  projects: Project[];
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
  title,
  description,
  image,
  stars,
  forks,
  author,
  language,
  categories,
  tags,
  onStar,
  onFork,
}: ProjectCardProperties) {
  const LanguageIcon = LANGUAGE_ICONS[language];

  return (
    <Card className="group relative overflow-hidden flex flex-col">
      <div className="aspect-video overflow-hidden bg-muted">
        <img
          src={image || '/placeholder.svg'}
          alt={title}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Badge variant="outline" className="flex items-center gap-2 rounded-full pr-0.5">
            {language}
            <Avatar className="h-5 w-5">
              <AvatarFallback>
                <LanguageIcon className="size-3" />
              </AvatarFallback>
            </Avatar>
          </Badge>
        </div>
        <CardDescription className="line-clamp-2">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="flex flex-wrap gap-2 mb-2">
          {categories.map((category) => {
            const { icon: Icon, color } = CATEGORIES[category];
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
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-yellow transition-colors"
            onClick={() => onStar?.(id)}
          >
            <Star className="size-4" />
            {stars}
          </button>
          <button
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-blue transition-colors"
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
