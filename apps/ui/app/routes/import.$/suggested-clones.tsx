import { ArrowRight } from 'lucide-react';
import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelId } from '@taucad/types/constants';
import { SvgIcon } from '#components/icons/svg-icon.js';
import type { SvgIcons } from '#components/icons/generated/svg-icons.js';
import { cn } from '@taucad/ui/utils/cn';

type SuggestedRepository = {
  owner: string;
  repo: string;
  description: string;
  mainFile: string;
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
    kernel: 'replicad',
    kernelIcon: 'replicad',
    ref: 'main',
  },
  {
    owner: 'KittyCAD',
    repo: 'modeling-app',
    description: 'Zoo Design Studio - a modern CAD application using KCL for parametric modeling',
    mainFile: 'public/kcl-samples/ball-bearing/main.kcl',
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
    kernel: 'jscad',
    kernelIcon: 'jscad',
    ref: 'master',
    path: 'packages/examples',
  },
];

type SuggestedClonesProperties = {
  readonly onSelect: (repository: { owner: string; repo: string; ref: string; mainFile: string }) => void;
  readonly className?: string;
};

export function SuggestedClones({ onSelect, className }: SuggestedClonesProperties): React.JSX.Element {
  return (
    <section className={cn('grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]', className)}>
      <h2 className='pt-3 text-sm font-medium'>Public examples</h2>
      <ul className='min-w-0 divide-y'>
        {suggestedRepositories.map((repository) => (
          <li key={`${repository.owner}/${repository.repo}`}>
            <button
              type='button'
              className='flex w-full flex-wrap items-center gap-4 rounded-md px-2 py-3 text-left hover:bg-muted focus-visible:focus-outline'
              onClick={() => {
                onSelect(repository);
              }}
            >
              <div className='min-w-0 flex-1 space-y-1'>
                <span className='block font-mono text-sm break-all'>
                  {repository.owner}/{repository.repo}
                </span>
                <span className='block text-xs text-muted-foreground'>{repository.description}</span>
              </div>
              <span className='flex items-center gap-2 text-xs text-muted-foreground'>
                <SvgIcon id={repository.kernelIcon} className='size-4' />
                {getKernelName(repository.kernel)}
              </span>
              <ArrowRight className='size-4 shrink-0 text-muted-foreground' />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
