import { useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { Search, Code2, SlidersHorizontal } from 'lucide-react';
import { Button } from '~/components/ui/button.js';
import { Input } from '~/components/ui/input.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu.js';
import type { CadKernelProvider } from '~/types/cad.js';
import { cadKernelProviders } from '~/types/cad.js';
import { sampleBuilds } from '~/constants/build-examples.js';
import { CommunityBuildGrid } from '~/components/project-grid.js';
import type { Handle } from '~/types/matches.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Link to="/builds/community" tabIndex={-1}>
        <Button variant="ghost" className="p-2">
          Community
        </Button>
      </Link>
    );
  },
};

const itemsPerPage = 9;
type SortOption = 'newest' | 'oldest' | 'stars' | 'forks';

export default function CadCommunity(): JSX.Element {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<CadKernelProvider | 'all'>('all');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [visibleProjects, setVisibleProjects] = useState(itemsPerPage);

  // Filter projects based on search term and selected language
  const filteredProjects = sampleBuilds.filter((project) => {
    const matchesSearch =
      searchTerm === '' ||
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesLanguage =
      selectedLanguage === 'all' || Object.values(project.assets).some((asset) => asset.language === selectedLanguage);

    return matchesSearch && matchesLanguage;
  });

  // Sort projects based on selected option
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    switch (sortOption) {
      case 'newest': {
        return b.createdAt - a.createdAt;
      }

      case 'oldest': {
        return a.createdAt - b.createdAt;
      }

      case 'stars': {
        return b.stars - a.stars;
      }

      case 'forks': {
        return b.forks - a.forks;
      }

      // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- exhaustive check
      default: {
        const exhaustiveCheck: never = sortOption;
        throw new Error(`Invalid sort option: ${String(exhaustiveCheck)}`);
      }
    }
  });

  const handleLoadMore = () => {
    setVisibleProjects((previous) => Math.min(previous + itemsPerPage, sortedProjects.length));
  };

  return (
    <div className="container mx-auto space-y-8 px-4 py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">Community</h1>
          <span className="text-muted-foreground">({sortedProjects.length})</span>
        </div>
        <Button asChild>
          <Link to="/builds/new">Create New</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-grow">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchTerm}
              className="pl-10"
              onChange={(event) => {
                setSearchTerm(event.target.value);
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-[180px] justify-start">
                  <Code2 className="mr-2 size-4" />
                  {selectedLanguage === 'all' ? 'All Languages' : selectedLanguage}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px]">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedLanguage('all');
                    }}
                  >
                    All Languages
                  </DropdownMenuItem>
                  {cadKernelProviders.map((key) => (
                    <DropdownMenuItem
                      key={key}
                      onClick={() => {
                        setSelectedLanguage(key);
                      }}
                    >
                      {key}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-[180px] justify-start">
                  <SlidersHorizontal className="mr-2 size-4" />
                  Sort by: {sortOption}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px]">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => {
                      setSortOption('newest');
                    }}
                  >
                    Newest
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSortOption('oldest');
                    }}
                  >
                    Oldest
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSortOption('stars');
                    }}
                  >
                    Most Stars
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSortOption('forks');
                    }}
                  >
                    Most Forks
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <CommunityBuildGrid builds={sortedProjects} />

      {visibleProjects < sortedProjects.length && (
        <div className="flex justify-center">
          <Button onClick={handleLoadMore}>Load More Projects</Button>
        </div>
      )}
    </div>
  );
}
