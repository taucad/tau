import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { Code2, SlidersHorizontal } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { SearchInput } from '#components/search-input.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import type { KernelProvider } from '#types/kernel.types.js';
import { kernelProviders } from '#types/kernel.types.js';
import { sampleBuilds } from '#constants/build-examples.js';
import { CommunityBuildGrid } from '#components/project-grid.js';
import type { Handle } from '#types/matches.types.js';
import { LoadingSpinner } from '#components/loading-spinner.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant="ghost">
        <Link to="/builds/community">Community</Link>
      </Button>
    );
  },
};

const itemsPerPage = 9;
type SortOption = 'newest' | 'oldest' | 'stars' | 'forks';

export default function CadCommunity(): React.JSX.Element {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKernel, setSelectedKernel] = useState<KernelProvider | 'all'>('all');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [visibleProjects, setVisibleProjects] = useState(itemsPerPage);

  // Filter projects based on search term and selected language
  const filteredProjects = sampleBuilds.filter((project) => {
    const matchesSearch =
      searchTerm === '' ||
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesKernel =
      selectedKernel === 'all' || Object.values(project.assets).some((asset) => asset.language === selectedKernel);

    return matchesSearch && matchesKernel;
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

      default: {
        const exhaustiveCheck: never = sortOption;
        throw new Error(`Invalid sort option: ${String(exhaustiveCheck)}`);
      }
    }
  });

  const handleLoadMore = () => {
    setVisibleProjects((previous) => Math.min(previous + itemsPerPage, sortedProjects.length));
  };

  const handleSearchClear = () => {
    setSearchTerm('');
  };

  return (
    <div className="container mx-auto space-y-8 px-4 py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">Community</h1>
          <span className="text-muted-foreground">({sortedProjects.length})</span>
        </div>
        <Button asChild>
          <NavLink to="/">{({ isPending }) => (isPending ? <LoadingSpinner /> : 'New Build')}</NavLink>
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <SearchInput
            placeholder="Search projects..."
            value={searchTerm}
            containerClassName="flex-grow"
            onChange={(event) => {
              setSearchTerm(event.target.value);
            }}
            onClear={handleSearchClear}
          />
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-[180px] justify-start">
                  <Code2 className="mr-2 size-4" />
                  {selectedKernel === 'all' ? 'All Kernels' : selectedKernel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px]">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedKernel('all');
                    }}
                  >
                    All Kernels
                  </DropdownMenuItem>
                  {kernelProviders.map((key) => (
                    <DropdownMenuItem
                      key={key}
                      onClick={() => {
                        setSelectedKernel(key);
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
