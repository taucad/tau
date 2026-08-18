import { useState, useCallback } from 'react';
import { Star, GitFork, ExternalLink, Sparkles } from 'lucide-react';
import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelId } from '@taucad/types/constants';
import { SvgIcon } from '#components/icons/svg-icon.js';
import type { SvgIcons } from '#components/icons/generated/svg-icons.js';
import { cn } from '#utils/ui.utils.js';

type SuggestedRepository = {
  owner: string;
  repo: string;
  description: string;
  mainFile: string;
  stars: number;
  forks: number;
  kernel: KernelId;
  kernelIcon: SvgIcons;
  ref: string;
  path?: string;
};

/** Get the display name for a kernel from the kernel configurations */
function getKernelName(kernelId: KernelId): string {
  const config = kernelConfigurations.find((k) => k.id === kernelId);
  return config?.name ?? kernelId;
}

const suggestedRepositories: readonly SuggestedRepository[] = [
  {
    owner: 'openscad',
    repo: 'openscad',
    description: 'Official OpenSCAD examples showcasing CSG operations, extrusions, and parametric designs',
    mainFile: 'examples/Basics/logo.scad',
    stars: 8500,
    forks: 1400,
    kernel: 'openscad',
    kernelIcon: 'openscad',
    ref: 'master',
    path: 'examples',
  },
  {
    owner: 'sgenoud',
    repo: 'models',
    description: 'Collection of parametric 3D models built with Replicad - rings, pendants, and more',
    mainFile: 'public/models/honeycomb.js',
    stars: 25,
    forks: 5,
    kernel: 'replicad',
    kernelIcon: 'typescript',
    ref: 'main',
  },
  {
    owner: 'KittyCAD',
    repo: 'modeling-app',
    description: 'Zoo Design Studio - a modern CAD application using KCL for parametric modeling',
    mainFile: 'public/kcl-samples/ball-bearing/main.kcl',
    stars: 1000,
    forks: 97,
    kernel: 'zoo',
    kernelIcon: 'zoo',
    ref: 'main',
    path: 'public/kcl-samples',
  },
  {
    owner: 'jscad',
    repo: 'OpenJSCAD.org',
    description: 'JSCAD examples - parametric 3D modeling with JavaScript/TypeScript',
    mainFile: 'packages/examples/core/primitives/roundedCuboid.js',
    stars: 2700,
    forks: 420,
    kernel: 'jscad',
    kernelIcon: 'typescript',
    ref: 'master',
    path: 'packages/examples',
  },
];

type SuggestedClonesProperties = {
  readonly onSelect: (repository: { owner: string; repo: string; ref: string; mainFile: string }) => void;
  readonly className?: string;
};

function formatCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }

  return count.toString();
}

type RepositoryAvatarProperties = {
  readonly owner: string;
  readonly repo: string;
};

function RepositoryAvatar({ owner, repo }: RepositoryAvatarProperties): React.JSX.Element {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');

  const handleLoad = useCallback(() => {
    setImageState('loaded');
  }, []);

  const handleError = useCallback(() => {
    setImageState('error');
  }, []);

  // Use proxied avatar URL through our API
  const avatarUrl = `/api/github-avatar?user=${encodeURIComponent(owner)}&size=64`;

  // Show GitHub icon fallback when error
  if (imageState === 'error') {
    return (
      <div className='flex size-8 items-center justify-center rounded-full bg-muted'>
        <SvgIcon id='github' className='size-5 text-muted-foreground' />
      </div>
    );
  }

  // Show loaded image
  if (imageState === 'loaded') {
    return <img src={avatarUrl} alt={`${owner} avatar`} className='size-8 rounded-full' />;
  }

  // Loading state: show placeholder and preload image in background
  return (
    <div className='relative flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground'>
      {owner[0]}/{repo[0]}
      {/* Hidden image to trigger load/error events */}
      <img
        src={avatarUrl}
        alt=''
        className='absolute inset-0 size-0 opacity-0'
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}

export function SuggestedClones(properties: SuggestedClonesProperties): React.JSX.Element {
  const { onSelect, className } = properties;

  return (
    <div className={cn('space-y-3', className)}>
      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
        <Sparkles className='size-4' />
        <span className='font-medium'>Suggested Repositories</span>
      </div>

      <div className='grid grid-cols-2 gap-3'>
        {suggestedRepositories.map((repo) => (
          <button
            key={`${repo.owner}/${repo.repo}`}
            type='button'
            className='group flex flex-col gap-2 rounded-lg border bg-sidebar p-3 text-left transition-colors hover:border-primary/50 hover:bg-sidebar/80 sm:gap-3 sm:p-4'
            onClick={() => {
              onSelect({
                owner: repo.owner,
                repo: repo.repo,
                ref: repo.ref,
                mainFile: repo.mainFile,
              });
            }}
          >
            {/* Header with avatar and kernel badge */}
            <div className='flex items-center justify-between gap-2'>
              <RepositoryAvatar owner={repo.owner} repo={repo.repo} />

              {/* Kernel badge */}
              <div className='flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs sm:px-2 sm:text-xs'>
                <SvgIcon id={repo.kernelIcon} className='size-3' />
                <span className='hidden sm:inline'>{getKernelName(repo.kernel)}</span>
              </div>
            </div>

            {/* Repository name */}
            <div className='flex items-center gap-2'>
              <span className='truncate font-mono text-xs font-medium sm:text-sm'>
                {repo.owner}/{repo.repo}
              </span>
              <ExternalLink className='size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100' />
            </div>

            {/* Description */}
            <p className='line-clamp-2 text-xs text-muted-foreground sm:text-xs'>{repo.description}</p>

            {/* Footer with stats and main file */}
            <div className='flex items-center justify-between text-xs text-muted-foreground sm:text-xs'>
              <div className='flex items-center gap-2 sm:gap-3'>
                <div className='flex items-center gap-1'>
                  <Star className='size-3' />
                  <span>{formatCount(repo.stars)}</span>
                </div>
                <div className='flex items-center gap-1'>
                  <GitFork className='size-3' />
                  <span>{formatCount(repo.forks)}</span>
                </div>
              </div>
              <div className='hidden truncate text-right font-mono text-xs sm:block'>
                {repo.mainFile.split('/').pop()}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
