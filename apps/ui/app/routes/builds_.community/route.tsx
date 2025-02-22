import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from '@remix-run/react';
import { ProjectGrid, type Category, type CadLanguage } from '@/components/project-grid';
import { mockBuilds } from '@/components/mock-builds';
import { Search, Code2, Layout, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CATEGORIES, CAD_LANGUAGES } from '@/components/project-grid';

export const handle = {
  breadcrumb: () => {
    return (
      <Link to="/builds/community" tabIndex={-1}>
        <Button variant="ghost" className="p-2">
          Community
        </Button>
      </Link>
    );
  },
};

const ITEMS_PER_PAGE = 9;
type SortOption = 'trending' | 'most-starred' | 'recently-updated' | 'most-forked';

export default function CadCommunity() {
  const [activeFilter, setActiveFilter] = useState<'all' | Category>('all');
  const [activeLanguage, setActiveLanguage] = useState<CadLanguage | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleProjects, setVisibleProjects] = useState(ITEMS_PER_PAGE);
  const [sortBy, setSortBy] = useState<SortOption>('trending');

  const filteredProjects = mockBuilds.filter(
    (project) =>
      (activeFilter === 'all' || project.categories.includes(activeFilter as Category)) &&
      (activeLanguage === 'all' || project.language === activeLanguage) &&
      (project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))),
  );

  // Sort projects based on selected sort option
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    switch (sortBy) {
      case 'most-starred': {
        return b.stars - a.stars;
      }
      case 'most-forked': {
        return b.forks - a.forks;
      }
      case 'recently-updated': {
        // For demo purposes, we'll use a random sort since we don't have update dates
        return Math.random() - 0.5;
      }
      default: {
        // For trending, we'll use a combination of stars and forks
        return b.stars * 2 + b.forks - (a.stars * 2 + a.forks);
      }
    }
  });

  const handleStarProject = useCallback((projectId: string) => {
    console.log(`Starred project: ${projectId}`);
    // Implement star functionality here
  }, []);

  const handleForkProject = useCallback((projectId: string) => {
    console.log(`Forked project: ${projectId}`);
    // Implement fork functionality here
  }, []);

  const loadMore = useCallback(() => {
    setVisibleProjects((previous) => Math.min(previous + ITEMS_PER_PAGE, sortedProjects.length));
  }, [sortedProjects.length]);

  const displayedProjects = sortedProjects.slice(0, visibleProjects);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">Discover Community CAD Projects</h1>
        <p className="text-lg text-muted-foreground">Explore, fork, and collaborate on open-source CAD designs</p>
      </div>

      {/* Search */}
      <div className="relative mb-8 max-w-2xl mx-auto">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="w-full pl-10"
          placeholder="Search CAD projects..."
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </div>

      {/* Filters */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Tabs value={activeFilter} onValueChange={(value) => setActiveFilter(value as 'all' | Category)}>
          <TabsList>
            <TabsTrigger value="all" className="flex items-center gap-2">
              <Layout className="size-4" />
              <span className="hidden sm:inline">All</span>
            </TabsTrigger>
            {Object.entries(CATEGORIES).map(([key, { icon: Icon, color }]) => (
              <TabsTrigger key={key} value={key} className="flex items-center gap-2">
                <Icon className={`size-4 ${color}`} />
                <span className="hidden sm:inline">{key}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <Code2 className="size-4" />
                Language: {activeLanguage}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setActiveLanguage('all')}>All</DropdownMenuItem>
                {CAD_LANGUAGES.map((lang) => (
                  <DropdownMenuItem key={lang} onSelect={() => setActiveLanguage(lang)}>
                    {lang}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <SlidersHorizontal className="size-4" />
                Sort by:{' '}
                {sortBy
                  .split('-')
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setSortBy('trending')}>Trending</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSortBy('most-starred')}>Most Starred</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSortBy('recently-updated')}>Recently Updated</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSortBy('most-forked')}>Most Forked</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ProjectGrid
        projects={displayedProjects}
        onStar={handleStarProject}
        onFork={handleForkProject}
        hasMore={visibleProjects < sortedProjects.length}
        onLoadMore={loadMore}
      />
    </div>
  );
}
