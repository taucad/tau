import { useState, useCallback, useEffect } from 'react';
import { Search, Filter, Grid, List, Star, ChevronDown, ArrowRight, Zap, Cpu, Layout, Cog, Eye } from 'lucide-react';
import { Link } from '@remix-run/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Category, CATEGORIES } from '@/types/cad';
import { Build } from '@/types/build';
import { ReplicadProvider, useReplicad } from '@/components/geometry/kernel/replicad/replicad-context';
import { ReplicadViewer } from '@/components/geometry/kernel/replicad/replicad-viewer';
import { useBuilds } from '@/hooks/use-builds';

export const handle = {
  breadcrumb: () => {
    return (
      <Link to="/builds/library" tabIndex={-1}>
        <Button variant="ghost" className="p-2">
          Library
        </Button>
      </Link>
    );
  },
};

const ITEMS_PER_PAGE = 12;

const handleStatusChange = (projectId: string, newStatus: string) => {
  console.log(`Changing status of project ${projectId} to ${newStatus}`);
  // Implement status change logic here
};

const handleFavorite = (id: string) => {
  console.log(`Toggling favorite for project ${id}`);
  // Implement the actual favorite toggle logic here
};

export default function PersonalCadProjects() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'lastOpened' | 'createdAt' | 'name' | 'updatedAt'>('updatedAt');
  const [visibleProjects, setVisibleProjects] = useState(ITEMS_PER_PAGE);
  const { builds } = useBuilds();

  const filteredProjects = builds
    .filter(
      (project) =>
        (activeFilter === 'all' || Object.keys(project.assets).includes(activeFilter)) &&
        (project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          project.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          project.tags?.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))),
    )
    .sort((a, b) => {
      return sortBy === 'createdAt'
        ? b.createdAt - a.createdAt
        : sortBy === 'updatedAt'
          ? b.updatedAt - a.updatedAt
          : a.name.localeCompare(b.name);
    });

  // TODO: add load more
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const loadMore = useCallback(() => {
    setVisibleProjects((previous) => Math.min(previous + ITEMS_PER_PAGE, filteredProjects.length));
  }, [filteredProjects.length]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold">Builds</h1>
        <Link to="/" tabIndex={-1}>
          <Button>New Build</Button>
        </Link>
      </div>

      {/* Search and Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search builds..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
      </div>

      <Tabs value={activeFilter} onValueChange={(value) => setActiveFilter(value as 'all' | Category)}>
        <div className="flex flex-wrap gap-2 justify-between items-center mb-8">
          <TabsList className="">
            <TabsTrigger value="all" className="flex items-center gap-2">
              <Layout className="size-4" />
              <span className="hidden sm:inline">all</span>
            </TabsTrigger>
            {Object.entries(CATEGORIES).map(([key, { icon: Icon, color }]) => (
              <TabsTrigger key={key} value={key} className="flex items-center gap-2">
                <Icon className={`size-4 ${color}`} />
                <span className="hidden sm:inline">{key}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-2">
            <Select
              value={sortBy}
              onValueChange={(value: 'lastOpened' | 'createdAt' | 'updatedAt' | 'name') => setSortBy(value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updatedAt">Last Updated</SelectItem>
                <SelectItem value="lastOpened">Last Opened</SelectItem>
                <SelectItem value="createdAt">Created Date</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Filter className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setViewMode('grid')}>
                  <Grid className="mr-2 size-4" />
                  <span>Grid</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode('list')}>
                  <List className="mr-2 size-4" />
                  <span>List</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <TabsContent value="all">
          <ProjectGrid projects={filteredProjects} visibleProjects={visibleProjects} viewMode={viewMode} />
        </TabsContent>
        <TabsContent value="mechanical">
          <ProjectGrid
            projects={filteredProjects.filter((p) => Object.keys(p.assets).includes('mechanical'))}
            visibleProjects={visibleProjects}
            viewMode={viewMode}
          />
        </TabsContent>
        <TabsContent value="electrical">
          <ProjectGrid
            projects={filteredProjects.filter((p) => Object.keys(p.assets).includes('electrical'))}
            visibleProjects={visibleProjects}
            viewMode={viewMode}
          />
        </TabsContent>
        <TabsContent value="firmware">
          <ProjectGrid
            projects={filteredProjects.filter((p) => Object.keys(p.assets).includes('firmware'))}
            visibleProjects={visibleProjects}
            viewMode={viewMode}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProjectGrid({
  projects,
  visibleProjects,
  viewMode,
}: {
  projects: Build[];
  visibleProjects: number;
  viewMode: 'grid' | 'list';
}) {
  return (
    <div className={viewMode === 'grid' ? 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'space-y-4'}>
      {projects.slice(0, visibleProjects).map((project) => (
        <ReplicadProvider key={project.id}>
          <ProjectCard project={project} viewMode={viewMode} />
        </ReplicadProvider>
      ))}
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const icons = {
    mechanical: <Cog className="size-4" />,
    electrical: <Zap className="size-4" />,
    firmware: <Cpu className="size-4" />,
  };

  const colors = {
    mechanical: 'text-blue',
    electrical: 'text-yellow',
    firmware: 'text-purple',
  };

  return (
    <div className={cn('flex items-center gap-1.5', colors[category as keyof typeof colors])}>
      {icons[category as keyof typeof icons]}
      <span className="capitalize">{category}</span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function StatusDropdown({ status, projectId }: { status: string; projectId: string }) {
  const statusColors = {
    draft: 'bg-gray-100 hover:bg-neutral',
    published: 'bg-blue-100 hover:bg-blue-200',
    archived: 'bg-red-100 hover:bg-red-200',
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-7 text-xs font-normal', statusColors[status as keyof typeof statusColors])}
        >
          {status}
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleStatusChange(projectId, 'draft')}>Draft</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange(projectId, 'review')}>Review</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange(projectId, 'published')}>Published</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange(projectId, 'completed')}>Completed</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange(projectId, 'archived')}>Archived</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectCard({ project, viewMode }: { project: Build; viewMode: 'grid' | 'list' }) {
  const { setCode, setParameters, mesh } = useReplicad();
  const main = project.assets.mechanical?.main;
  const code = project.assets.mechanical?.files[main as string]?.content;
  const parameters = project.assets.mechanical?.parameters;

  // Start with preview false, then enable it once we have both code and mesh
  const [showPreview, setShowPreview] = useState(!!code);

  useEffect(() => {
    if (code) {
      setCode(code);
    }
    if (parameters) {
      setParameters(parameters);
    }
  }, [code, setCode, parameters, setParameters]);

  if (viewMode === 'list') {
    return (
      <Link to={`/builds/${project.id}`} className="block">
        <div className="flex items-center space-x-4 p-4 border rounded-lg hover:bg-accent">
          <div className="flex-shrink-0">
            <Avatar className="h-12 w-12">
              <AvatarImage src={project.thumbnail || project.author.avatar} alt={project.name} />
              <AvatarFallback>{project.name.charAt(0)}</AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-grow">
            <h3 className="font-semibold">{project.name}</h3>
            <p className="text-sm text-muted-foreground">{project.description}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {Object.keys(project.assets).map((cat) => (
                <CategoryBadge key={cat} category={cat} />
              ))}
            </div>
            {/* <StatusDropdown status={project.status} projectId={project.id} /> */}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/builds/${project.id}`} draggable={!showPreview}>
      <Card className="group relative overflow-hidden flex flex-col">
        <div className="relative aspect-video overflow-hidden bg-muted">
          {!showPreview && (
            <img
              src={project.thumbnail || '/placeholder.svg'}
              alt={project.name}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          )}
          <div
            className="absolute inset-0"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
          >
            {showPreview && (
              <ReplicadViewer
                mesh={mesh}
                disableGrid={true}
                disableGizmo={true}
                className="bg-muted"
                zoomLevel={1.25}
              />
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="absolute top-2 right-2"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              setShowPreview(!showPreview);
            }}
          >
            <Eye className="size-4" />
          </Button>
        </div>
        <CardHeader>
          <div className="flex justify-between items-start">
            <CardTitle>{project.name}</CardTitle>
          </div>
          <CardDescription>{project.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {Object.keys(project.assets).map((cat) => (
                <CategoryBadge key={cat} category={cat} />
              ))}
            </div>
            {/* <StatusDropdown status={project.status} projectId={project.id} /> */}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between items-center">
          <Button
            variant="ghost"
            size="icon"
            // className={cn(project.isFavorite ? 'text-yellow-400' : 'text-gray-400 hover:text-yellow-400')}
            onClick={(event) => {
              event.stopPropagation();
              handleFavorite(project.id);
            }}
          >
            <Star className="size-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <ArrowRight className="size-4" />
          </Button>
        </CardFooter>
      </Card>
    </Link>
  );
}
