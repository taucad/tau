import { useState, useCallback, useEffect } from 'react';
import {
  Search,
  Filter,
  Grid,
  List,
  Zap,
  Cpu,
  Layout,
  Cog,
  Eye,
  Star,
  ArrowRight,
  Trash,
  Ellipsis,
  Copy,
} from 'lucide-react';
import { Link, useNavigate } from '@remix-run/react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import { cn } from '@/utils/ui.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import type { Category } from '@/types/cad.js';
import { categories } from '@/types/cad.js';
import type { Build } from '@/types/build.js';
import { ReplicadProvider, useReplicad } from '@/components/geometry/kernel/replicad/replicad-context.js';
import { ReplicadViewer } from '@/components/geometry/kernel/replicad/replicad-viewer.js';
import { useBuilds } from '@/hooks/use-builds.js';
import { toast } from '@/components/ui/sonner.js';
import type { Handle } from '@/types/matches.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Link to="/builds/library" tabIndex={-1}>
        <Button variant="ghost" className="p-2">
          Library
        </Button>
      </Link>
    );
  },
};

const itemsPerPage = 12;

export default function PersonalCadProjects() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'lastOpened' | 'createdAt' | 'name' | 'updatedAt'>('updatedAt');
  const [visibleProjects, setVisibleProjects] = useState(itemsPerPage);
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

  const loadMore = useCallback(() => {
    setVisibleProjects((previous) => Math.min(previous + itemsPerPage, filteredProjects.length));
  }, [filteredProjects.length]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Builds</h1>
        <Link to="/" tabIndex={-1}>
          <Button>New Build</Button>
        </Link>
      </div>

      {/* Search and Controls */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-grow">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search builds..."
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
            }}
          />
        </div>
      </div>

      {}
      <Tabs
        value={activeFilter}
        onValueChange={(value) => {
          setActiveFilter(value as 'all' | Category);
        }}
      >
        <div className="mb-8 flex flex-wrap items-center justify-between gap-2">
          <TabsList className="">
            <TabsTrigger value="all" className="flex items-center gap-2">
              <Layout className="size-4" />
              <span className="hidden sm:inline">all</span>
            </TabsTrigger>
            {Object.entries(categories).map(([key, { icon: Icon, color }]) => (
              <TabsTrigger key={key} value={key} className="flex items-center gap-2">
                <Icon className={`size-4 ${color}`} />
                <span className="hidden sm:inline">{key}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-2">
            <Select
              value={sortBy}
              onValueChange={(value: 'lastOpened' | 'createdAt' | 'updatedAt' | 'name') => {
                setSortBy(value);
              }}
            >
              <SelectTrigger size="sm" className="w-[180px]">
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
                <DropdownMenuItem
                  onClick={() => {
                    setViewMode('grid');
                  }}
                >
                  <Grid className="mr-2 size-4" />
                  <span>Grid</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setViewMode('list');
                  }}
                >
                  <List className="mr-2 size-4" />
                  <span>List</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <TabsContent value="all">
          <LibraryBuildGrid projects={filteredProjects} visibleProjects={visibleProjects} viewMode={viewMode} />
        </TabsContent>
        <TabsContent value="mechanical">
          <LibraryBuildGrid
            projects={filteredProjects.filter((p) => Object.keys(p.assets).includes('mechanical'))}
            visibleProjects={visibleProjects}
            viewMode={viewMode}
          />
        </TabsContent>
        <TabsContent value="electrical">
          <LibraryBuildGrid
            projects={filteredProjects.filter((p) => Object.keys(p.assets).includes('electrical'))}
            visibleProjects={visibleProjects}
            viewMode={viewMode}
          />
        </TabsContent>
        <TabsContent value="firmware">
          <LibraryBuildGrid
            projects={filteredProjects.filter((p) => Object.keys(p.assets).includes('firmware'))}
            visibleProjects={visibleProjects}
            viewMode={viewMode}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LibraryBuildGrid({
  projects,
  visibleProjects,
  viewMode,
}: {
  readonly projects: Build[];
  readonly visibleProjects: number;
  readonly viewMode: 'grid' | 'list';
}) {
  return (
    <div className={viewMode === 'grid' ? 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'space-y-4'}>
      {projects.slice(0, visibleProjects).map((project) => (
        <ReplicadProvider key={project.id}>
          <BuildLibraryCard project={project} viewMode={viewMode} />
        </ReplicadProvider>
      ))}
    </div>
  );
}

function CategoryBadge({ category }: { readonly category: Category }) {
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
    <div className={cn('flex items-center gap-1.5', colors[category])}>
      {icons[category]}
      <span className="capitalize">{category}</span>
    </div>
  );
}

// TODO: review statuses
// function StatusDropdown({ status, projectId }: { status: string; projectId: string }) {
//   const statusColors = {
//     draft: 'bg-gray-100 hover:bg-neutral',
//     published: 'bg-blue-100 hover:bg-blue-200',
//     archived: 'bg-red-100 hover:bg-red-200',
//   };

//   return (
//     <DropdownMenu>
//       <DropdownMenuTrigger asChild>
//         <Button
//           variant="outline"
//           size="sm"
//           className={cn('h-7 text-xs font-normal', statusColors[status as keyof typeof statusColors])}
//         >
//           {status}
//           <ChevronDown className="ml-1 h-3 w-3" />
//         </Button>
//       </DropdownMenuTrigger>
//       <DropdownMenuContent align="end">
//         <DropdownMenuItem onClick={() => handleStatusChange(projectId, 'draft')}>Draft</DropdownMenuItem>
//         <DropdownMenuItem onClick={() => handleStatusChange(projectId, 'review')}>Review</DropdownMenuItem>
//         <DropdownMenuItem onClick={() => handleStatusChange(projectId, 'published')}>Published</DropdownMenuItem>
//         <DropdownMenuItem onClick={() => handleStatusChange(projectId, 'completed')}>Completed</DropdownMenuItem>
//         <DropdownMenuItem onClick={() => handleStatusChange(projectId, 'archived')}>Archived</DropdownMenuItem>
//       </DropdownMenuContent>
//     </DropdownMenu>
//   );
// }

function BuildLibraryCard({ project, viewMode }: { readonly project: Build; readonly viewMode: 'grid' | 'list' }) {
  const { setCode, setParameters, mesh } = useReplicad();
  const { deleteBuild, duplicateBuild } = useBuilds();
  const code = project.assets.mechanical?.files[project.assets.mechanical?.main]?.content;
  const parameters = project.assets.mechanical?.parameters;
  const navigate = useNavigate();

  // Start with preview false, then enable it once we have both code and mesh
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (showPreview) {
      if (code) {
        setCode(code);
      }

      if (parameters) {
        setParameters(parameters);
      }
    }
  }, [code, setCode, parameters, setParameters, showPreview]);

  const handleDelete = () => {
    deleteBuild(project.id);
    toast.success(`Deleted ${project.name}`);
  };

  const handleDuplicate = async () => {
    try {
      await duplicateBuild(project.id);
      toast.success(`Duplicated ${project.name}`, {
        action: {
          label: 'Open',
          onClick() {
            navigate(`/builds/${project.id}`);
          },
        },
      });
    } catch (error) {
      toast.error('Failed to duplicate build');
      console.error('Error in component:', error);
    }
  };

  if (viewMode === 'list') {
    return (
      <Link to={`/builds/${project.id}`} className="block">
        <div className="flex items-center gap-4 rounded-lg border p-4 hover:bg-accent">
          <div className="flex-shrink-0">
            <Avatar className="aspect-video w-12 scale-200">
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
                <CategoryBadge key={cat} category={cat as Category} />
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
      <Card className="group relative flex flex-col overflow-hidden">
        <div className="relative aspect-video overflow-hidden bg-muted">
          {!showPreview && (
            <img
              src={project.thumbnail || '/placeholder.svg'}
              alt={project.name}
              className="size-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          )}
          {showPreview ? (
            <div
              className="absolute inset-0"
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
              }}
            >
              <ReplicadViewer mesh={mesh} className="bg-muted" zoomLevel={1.3} />
            </div>
          ) : null}
          <Button
            variant="outline"
            size="icon"
            className={cn('absolute top-2 right-2', showPreview && 'text-primary')}
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
          <div className="flex items-start justify-between">
            <CardTitle>{project.name}</CardTitle>
          </div>
          <CardDescription>{project.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {Object.keys(project.assets).map((cat) => (
                <CategoryBadge key={cat} category={cat as Category} />
              ))}
            </div>
            {/* <StatusDropdown status={project.status} projectId={project.id} /> */}
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <Button variant="outline">
            <span>Open</span>
            <ArrowRight className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
              }}
            >
              <DropdownMenuItem onClick={handleDuplicate}>
                <Copy className="mr-2 size-4" />
                <span>Duplicate</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Star className="mr-2 size-4" />
                <span>Favorite</span>
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={handleDelete}>
                <Trash className="mr-2 size-4" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardFooter>
      </Card>
    </Link>
  );
}
