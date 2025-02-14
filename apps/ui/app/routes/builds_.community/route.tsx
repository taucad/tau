import { useState, useCallback } from 'react';
import { Star, GitFork, Search, Code2, Layout, SlidersHorizontal, Zap, Cpu, Cog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type React from 'react'; // Import React
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Link } from '@remix-run/react';
import { SvgIcon } from '@/components/icons/svg-icon';

export const handle = {
  breadcrumb: () => {
    return (
      <Link to="/builds/community">
        <Button variant="ghost" className="p-2">
          Community
        </Button>
      </Link>
    );
  },
};

const CAD_LANGUAGES = ['Replicad', 'OpenSCAD', 'KCL'] as const;
type CadLanguage = (typeof CAD_LANGUAGES)[number];

export const CATEGORIES = {
  Mechanical: { icon: Cog, color: 'text-blue' },
  Electrical: { icon: Zap, color: 'text-yellow' },
  Firmware: { icon: Cpu, color: 'text-purple' },
} as const;
export type Category = keyof typeof CATEGORIES;

// Placeholder for language icons
const LANGUAGE_ICONS: Record<CadLanguage, React.ComponentType> = {
  Replicad: ({ ...properties }) => <SvgIcon id="replicad" {...properties} />,
  OpenSCAD: ({ ...properties }) => <SvgIcon id="openscad" {...properties} />,
  KCL: ({ ...properties }) => <SvgIcon id="zoo" {...properties} />,
};

const ITEMS_PER_PAGE = 9;

type SortOption = 'trending' | 'most-starred' | 'recently-updated' | 'most-forked';

export default function CadCommunity() {
  const [activeFilter, setActiveFilter] = useState<'all' | Category>('all');
  const [activeLanguage, setActiveLanguage] = useState<CadLanguage | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleProjects, setVisibleProjects] = useState(ITEMS_PER_PAGE);
  const [sortBy, setSortBy] = useState<SortOption>('trending');

  const filteredProjects = projects.filter(
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

      {/* Project Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sortedProjects.slice(0, visibleProjects).map((project) => (
          <ProjectCard key={project.id} {...project} onStar={handleStarProject} onFork={handleForkProject} />
        ))}
      </div>

      {/* Load More Button */}
      {visibleProjects < sortedProjects.length && (
        <div className="mt-8 text-center">
          <Button onClick={loadMore} variant="outline">
            Load More Projects
          </Button>
        </div>
      )}
    </div>
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
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-yellow-500 transition-colors"
            onClick={() => onStar(id)}
          >
            <Star className="size-4" />
            {stars}
          </button>
          <button
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-blue-500 transition-colors"
            onClick={() => onFork(id)}
          >
            <GitFork className="size-4" />
            {forks}
          </button>
        </div>
      </CardFooter>
    </Card>
  );
}

// Sample data
interface Project {
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

const projects: Project[] = [
  {
    id: '1',
    title: 'Parametric Gear Generator',
    description: 'A fully customizable gear system with automatic mesh generation and stress analysis',
    image:
      'https://makerworld.bblmw.com/makerworld/model/USce1b6106deb1fb/design/2025-01-28_c52ecae10189c.jpeg?x-oss-process=image/resize,w_1000/format,webp',
    stars: 245,
    forks: 72,
    author: {
      name: 'Sarah Chen',
      avatar: '/avatar-sample.png',
    },
    language: 'OpenSCAD',
    categories: ['Mechanical'],
    tags: ['gears', 'parametric', 'engineering'],
  },
  {
    id: '2',
    title: 'Modular Drone Frame',
    description: 'Open-source drone frame design with swappable components and printable parts',
    image: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?q=80&w=640',
    stars: 189,
    forks: 45,
    author: {
      name: 'Alex Kumar',
      avatar: '/avatar-sample.png',
    },
    language: 'Replicad',
    categories: ['Mechanical', 'Electrical'],
    tags: ['drone', 'modular', '3D-printing'],
  },
  {
    id: '3',
    title: 'Smart Home Hub Enclosure',
    description: 'Customizable enclosure for DIY smart home controllers with cooling optimization',
    image: 'https://media.bunnings.com.au/api/public/content/f65b9387002740cabdab22149ea669c0?v=42a24028',
    stars: 156,
    forks: 38,
    author: {
      name: 'Maria Garcia',
      avatar: '/avatar-sample.png',
    },
    language: 'KCL',
    categories: ['Electrical', 'Firmware'],
    tags: ['smart-home', 'IoT', 'enclosure'],
  },
  {
    id: '4',
    title: 'Electric Skateboard Mount',
    description: 'Optimized motor mount design for DIY electric skateboards with built-in cooling',
    image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=640',
    stars: 324,
    forks: 89,
    author: {
      name: 'Tom Wilson',
      avatar: '/avatar-sample.png',
    },
    language: 'Replicad',
    categories: ['Mechanical', 'Electrical'],
    tags: ['e-mobility', 'skateboard', 'motor-mount'],
  },
  {
    id: '5',
    title: 'Modular Building System',
    description: 'Architectural components for rapid prototyping of building designs',
    image: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=640',
    stars: 892,
    forks: 156,
    author: {
      name: 'Emma Smith',
      avatar: '/avatar-sample.png',
    },
    language: 'OpenSCAD',
    categories: ['Mechanical'],
    tags: ['architecture', 'modular', 'prototyping'],
  },
  {
    id: '6',
    title: 'PCB Enclosure Generator',
    description: 'Parametric electronics enclosure with custom PCB mounting options',
    image: 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?q=80&w=640',
    stars: 467,
    forks: 92,
    author: {
      name: 'David Park',
      avatar: '/avatar-sample.png',
    },
    language: 'KCL',
    categories: ['Electrical'],
    tags: ['electronics', 'PCB', 'parametric'],
  },
  {
    id: '7',
    title: 'Robotic Arm Assembly',
    description: '6-axis robotic arm with inverse kinematics and servo mounts',
    image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?q=80&w=640',
    stars: 1243,
    forks: 278,
    author: {
      name: 'Michael Chang',
      avatar: '/avatar-sample.png',
    },
    language: 'OpenSCAD',
    categories: ['Mechanical'],
    tags: ['robotics', 'kinematics', 'servo'],
  },
  {
    id: '8',
    title: 'Solar Panel Mount',
    description: 'Adjustable mounting system for solar panels with wind load analysis',
    image: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=640',
    stars: 534,
    forks: 112,
    author: {
      name: 'Lisa Johnson',
      avatar: '/avatar-sample.png',
    },
    language: 'Replicad',
    categories: ['Mechanical'],
    tags: ['solar', 'renewable-energy', 'mounting'],
  },
  {
    id: '9',
    title: 'Mechanical Keyboard Case',
    description: 'Custom keyboard case with integrated wrist rest and cable routing',
    image: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?q=80&w=640',
    stars: 678,
    forks: 145,
    author: {
      name: 'Ryan Martinez',
      avatar: '/avatar-sample.png',
    },
    language: 'KCL',
    categories: ['Mechanical'],
    tags: ['keyboard', 'mechanical-keyboard', 'case'],
  },
  {
    id: '10',
    title: '3D Printer Upgrades',
    description: 'Collection of enhancement parts for popular 3D printer models',
    image:
      'https://i.all3dp.com/workers/images/fit=scale-down,w=1920,h=1080,gravity=0.5x0.5,format=auto/wp-content/uploads/2022/05/20172502/PXL_20220114_183227051.PORTRAIT-scaled.jpg',
    stars: 892,
    forks: 234,
    author: {
      name: 'Chris Anderson',
      avatar: '/avatar-sample.png',
    },
    language: 'OpenSCAD',
    categories: ['Mechanical'],
    tags: ['3D-printing', 'upgrades', 'DIY'],
  },
  {
    id: '11',
    title: 'Hydroponics System',
    description: 'Modular hydroponics setup with nutrient flow optimization',
    image: 'https://images.unsplash.com/photo-1558449028-b53a39d100fc?q=80&w=640',
    stars: 445,
    forks: 89,
    author: {
      name: 'Sophie Turner',
      avatar: '/avatar-sample.png',
    },
    language: 'Replicad',
    categories: ['Mechanical'],
    tags: ['hydroponics', 'gardening', 'automation'],
  },
  {
    id: '12',
    title: 'Camera Gimbal Mount',
    description: '3-axis camera stabilizer with quick-release plate',
    image:
      'https://content.instructables.com/FIX/2WP3/I9QWHCF2/FIX2WP3I9QWHCF2.png?auto=webp&frame=1&crop=3:2&width=667&height=1024&fit=bounds&md=MjAxNS0wNS0xNiAxNDoyMToyNy4w',
    stars: 567,
    forks: 123,
    author: {
      name: 'James Lee',
      avatar: '/avatar-sample.png',
    },
    language: 'KCL',
    categories: ['Mechanical'],
    tags: ['camera', 'gimbal', 'stabilizer'],
  },
  {
    id: '13',
    title: 'Wind Turbine Blades',
    description: 'Optimized small-scale wind turbine blade design with CFD analysis',
    image: 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?q=80&w=640',
    stars: 789,
    forks: 167,
    author: {
      name: 'Anna White',
      avatar: '/avatar-sample.png',
    },
    language: 'OpenSCAD',
    categories: ['Mechanical'],
    tags: ['wind-energy', 'turbine', 'CFD'],
  },
  {
    id: '14',
    title: 'Ergonomic Mouse',
    description: 'Vertical mouse design optimized for wrist comfort',
    image: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?q=80&w=640',
    stars: 234,
    forks: 45,
    author: {
      name: 'Peter Zhang',
      avatar: '/avatar-sample.png',
    },
    language: 'Replicad',
    categories: ['Mechanical'],
    tags: ['ergonomics', 'mouse', 'design'],
  },
  {
    id: '15',
    title: 'Micro RC Car Chassis',
    description: '1:24 scale RC car frame with suspension geometry',
    image: 'https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?q=80&w=640',
    stars: 345,
    forks: 78,
    author: {
      name: 'Kevin Brown',
      avatar: '/avatar-sample.png',
    },
    language: 'KCL',
    categories: ['Mechanical'],
    tags: ['RC-car', 'chassis', 'suspension'],
  },
  {
    id: '16',
    title: 'Modular Shelf System',
    description: 'Customizable shelving with hidden bracket design',
    image:
      'https://media.printables.com/media/prints/230356/images/2136386_a71237f4-d2f3-4cba-a749-173a58bde021/thumbs/inside/1280x960/jpg/001.webp',
    stars: 567,
    forks: 89,
    author: {
      name: 'Rachel Green',
      avatar: '/avatar-sample.png',
    },
    language: 'OpenSCAD',
    categories: ['Mechanical'],
    tags: ['shelving', 'modular', 'furniture'],
  },
  {
    id: '17',
    title: 'Bike Light Mount',
    description: 'Universal bicycle light mounting system with quick release',
    image: 'https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?q=80&w=640',
    stars: 234,
    forks: 56,
    author: {
      name: 'Daniel Kim',
      avatar: '/avatar-sample.png',
    },
    language: 'Replicad',
    categories: ['Mechanical'],
    tags: ['bicycle', 'light-mount', 'accessories'],
  },
  {
    id: '18',
    title: 'Server Rack Design',
    description: '4U rack mount case with advanced cooling system',
    image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=640',
    stars: 678,
    forks: 145,
    author: {
      name: 'Eric Thompson',
      avatar: '/avatar-sample.png',
    },
    language: 'KCL',
    categories: ['Mechanical'],
    tags: ['server', 'rack-mount', 'cooling'],
  },
  {
    id: '19',
    title: 'Garden Irrigation',
    description: 'Smart irrigation system with pressure-compensating emitters',
    image: 'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?q=80&w=640',
    stars: 445,
    forks: 98,
    author: {
      name: 'Laura Martinez',
      avatar: '/avatar-sample.png',
    },
    language: 'OpenSCAD',
    categories: ['Mechanical'],
    tags: ['irrigation', 'gardening', 'automation'],
  },
  {
    id: '20',
    title: 'Desktop CNC Frame',
    description: 'Rigid desktop CNC machine frame with linear rail guides',
    image: 'https://images.unsplash.com/photo-1565043589221-1a6fd9ae45c7?q=80&w=640',
    stars: 892,
    forks: 234,
    author: {
      name: 'Mark Wilson',
      avatar: '/avatar-sample.png',
    },
    language: 'KCL',
    categories: ['Mechanical', 'Electrical'],
    tags: ['CNC', 'desktop-manufacturing', 'DIY'],
  },
];
