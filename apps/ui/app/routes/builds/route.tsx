import { useState, useCallback } from 'react';
import { Search, Filter, Grid, List, Star, ChevronDown, ArrowRight, Zap, Cpu, Layout, Cog } from 'lucide-react';
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
import { CATEGORIES, Category } from '../builds_.community/route';

export const handle = {
  breadcrumb: () => {
    return (
      <Link to="/builds">
        <Button variant="ghost" className="p-2">
          Builds
        </Button>
      </Link>
    );
  },
};

interface Build {
  id: string;
  category: string[];
  files: {
    mech: Record<string, { content: string; metadata?: FileMetadata }>;
    elec: Record<string, { content: string; metadata?: FileMetadata }>;
    firmware: Record<string, { content: string; metadata?: FileMetadata }>;
  };
  name: string;
  description: string;
  author: {
    name: string;
    avatar: string;
    contact?: string;
  };
  version: string;
  createdAt: Date;
  updatedAt?: Date;
  status: 'draft' | 'review' | 'published' | 'completed' | 'archived';
  tags?: string[];
  dependencies?: string[];
  notes?: string;
  collaborators?: { name: string; role?: string }[];
  lastOpened?: Date;
  isFavorite: boolean;
  thumbnail?: string;
  estimatedCompletionDate?: Date;
  revisions?: {
    version: string;
    date: Date;
    changes: string;
  }[];
}

interface FileMetadata {
  size: number;
  type: string;
  lastModified: Date;
}

const ITEMS_PER_PAGE = 12;

function formatHumanDate(date: Date) {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);

  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  if (hours < 6) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (hours < 24) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString();
}

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
  const [sortBy, setSortBy] = useState<'lastOpened' | 'createdAt' | 'name'>('lastOpened');
  const [visibleProjects, setVisibleProjects] = useState(ITEMS_PER_PAGE);

  const filteredProjects = projects
    .filter(
      (project) =>
        (activeFilter === 'all' || project.category.includes(activeFilter)) &&
        (project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          project.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          project.tags?.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))),
    )
    .sort((a, b) => {
      if (sortBy === 'lastOpened') {
        return (b.lastOpened?.getTime() || 0) - (a.lastOpened?.getTime() || 0);
      } else if (sortBy === 'createdAt') {
        return b.createdAt.getTime() - a.createdAt.getTime();
      } else {
        return a.name.localeCompare(b.name);
      }
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
        <Link to="/builds/new">
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
              <span className="hidden sm:inline">All</span>
            </TabsTrigger>
            {Object.entries(CATEGORIES).map(([key, { icon: Icon, color }]) => (
              <TabsTrigger key={key} value={key} className="flex items-center gap-2">
                <Icon className={`size-4 ${color}`} />
                <span className="hidden sm:inline">{key}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={(value: 'lastOpened' | 'createdAt' | 'name') => setSortBy(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
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
            projects={filteredProjects.filter((p) => p.category.includes('mechanical'))}
            visibleProjects={visibleProjects}
            viewMode={viewMode}
          />
        </TabsContent>
        <TabsContent value="electrical">
          <ProjectGrid
            projects={filteredProjects.filter((p) => p.category.includes('electrical'))}
            visibleProjects={visibleProjects}
            viewMode={viewMode}
          />
        </TabsContent>
        <TabsContent value="firmware">
          <ProjectGrid
            projects={filteredProjects.filter((p) => p.category.includes('firmware'))}
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
        <ProjectCard key={project.id} project={project} viewMode={viewMode} />
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
  if (viewMode === 'list') {
    return (
      <div className="flex items-center space-x-4 p-4 border rounded-lg hover:bg-accent transition-colors">
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
            {project.category.map((cat) => (
              <CategoryBadge key={cat} category={cat} />
            ))}
          </div>
          <StatusDropdown status={project.status} projectId={project.id} />
        </div>
        <div className="text-sm text-muted-foreground">
          {project.lastOpened
            ? `Last opened ${formatHumanDate(project.lastOpened)}`
            : `Created ${formatHumanDate(project.createdAt)}`}
        </div>
      </div>
    );
  }

  return (
    <Card className="group relative overflow-hidden flex flex-col">
      <div className="aspect-video overflow-hidden bg-muted">
        <img
          src={project.thumbnail || '/placeholder.svg'}
          alt={project.name}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
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
            {project.category.map((cat) => (
              <CategoryBadge key={cat} category={cat} />
            ))}
          </div>
          <StatusDropdown status={project.status} projectId={project.id} />
        </div>
      </CardContent>
      <CardFooter className="flex justify-between items-center">
        <Button
          variant="ghost"
          size="icon"
          className={cn(project.isFavorite ? 'text-yellow-400' : 'text-gray-400 hover:text-yellow-400')}
          onClick={() => handleFavorite(project.id)}
        >
          <Star className="size-4" />
        </Button>
        <Button variant="ghost" size="icon">
          <ArrowRight className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}

// Sample data
const projects: Build[] = [
  {
    id: '1',
    category: ['mechanical', 'electrical'],
    files: {
      mech: { 'main.scad': { content: '// OpenSCAD code here' } },
      elec: { 'schematic.kicad': { content: '// KiCad schematic here' } },
      firmware: {},
    },
    name: 'Robotic Arm',
    description: '6-axis robotic arm with custom PCB control',
    author: {
      name: 'Jane Doe',
      avatar: '/avatar-sample.png',
    },
    version: '1.2.0',
    createdAt: new Date('2023-01-15'),
    updatedAt: new Date('2023-06-20'),
    status: 'completed',
    tags: ['robotics', 'automation'],
    lastOpened: new Date('2023-06-25'),
    isFavorite: true,
    thumbnail: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?q=80&w=640',
  },
  {
    id: '2',
    category: ['mechanical'],
    files: {
      mech: { 'gears.scad': { content: '// OpenSCAD gear system' } },
      elec: {},
      firmware: {},
    },
    name: 'Parametric Gearbox',
    description: 'Customizable gearbox for various applications',
    author: {
      name: 'John Smith',
      avatar: '/avatar-sample.png',
    },
    version: '0.9.5',
    createdAt: new Date('2023-03-10'),
    status: 'draft',
    lastOpened: new Date('2023-07-01'),
    isFavorite: false,
    thumbnail: 'https://images.unsplash.com/photo-1631083215251-26ef18bd1fdb?q=80&w=640',
  },
  {
    id: '3',
    category: ['electrical', 'firmware'],
    files: {
      mech: {},
      elec: { 'main_board.kicad': { content: '// KiCad PCB layout' } },
      firmware: { 'main.ino': { content: '// Arduino code' } },
    },
    name: 'Smart Home Hub',
    description: 'Central control unit for home automation',
    author: {
      name: 'Alice Johnson',
      avatar: '/avatar-sample.png',
    },
    version: '2.1.3',
    createdAt: new Date('2022-11-05'),
    updatedAt: new Date('2023-05-15'),
    status: 'completed',
    tags: ['IoT', 'home-automation'],
    lastOpened: new Date('2023-07-10'),
    isFavorite: true,
    thumbnail: 'https://images.unsplash.com/photo-1638383417648-0c5a3b9baa9b?q=80&w=640',
  },
  {
    id: '4',
    category: ['mechanical', 'electrical'],
    files: {
      mech: { 'frame.scad': { content: '// OpenSCAD frame design' } },
      elec: { 'motor_control.kicad': { content: '// KiCad motor controller schematic' } },
      firmware: {},
    },
    name: 'Electric Skateboard',
    description: 'Custom electric skateboard with regenerative braking',
    author: {
      name: 'Bob Wilson',
      avatar: '/avatar-sample.png',
    },
    version: '1.0.0',
    createdAt: new Date('2023-02-20'),
    updatedAt: new Date('2023-06-30'),
    status: 'completed',
    tags: ['e-mobility', 'transportation'],
    lastOpened: new Date('2023-07-05'),
    isFavorite: false,
    thumbnail: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=640',
  },
  {
    id: '5',
    category: ['firmware'],
    files: {
      mech: {},
      elec: {},
      firmware: { 'control_system.cpp': { content: '// C++ firmware for drone' } },
    },
    name: 'Drone Flight Controller',
    description: 'Advanced flight control system for quadcopters',
    author: {
      name: 'Charlie Brown',
      avatar: '/avatar-sample.png',
    },
    version: '3.2.1',
    createdAt: new Date('2022-09-15'),
    updatedAt: new Date('2023-07-01'),
    status: 'draft',
    tags: ['drones', 'flight-control'],
    lastOpened: new Date('2023-07-15'),
    isFavorite: true,
    thumbnail: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?q=80&w=640',
  },
];
