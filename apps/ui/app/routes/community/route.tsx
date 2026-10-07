import { useEffect, useMemo, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { PageContent } from '#components/layout/page-content.js';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { SearchX, X } from 'lucide-react';
import { z } from 'zod';
import { getCoreRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { kernelConfigurations, kernelProviders } from '@taucad/types/constants';
import type { KernelId } from '@taucad/types/constants';
import { Button } from '@taucad/ui/components/button';
import { ToggleGroup, ToggleGroupItem } from '@taucad/ui/components/toggle-group';
import { SearchInput } from '#components/search-input.js';
import { PageHeader } from '#components/layout/page-header.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { Loader } from '#components/ui/loader.js';
import { DataTablePagination } from '#components/ui/data-table.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { CommunityProjectGrid } from '#components/project-grid.js';
import { featuredCommunityLocator, galleryProjects } from '#constants/project-examples.js';
import type { BuiltinProjectCardModel } from '#constants/project-examples.js';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useImmediateSearchParameter } from '#hooks/use-immediate-search-parameter.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { enumParameter, stringParameter } from '#utils/search-parameter.codecs.js';
import { isFunction } from '#utils/function.utils.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = {
  enableOverflowY: true,
};

export const meta: MetaFunction = () => [
  { title: 'Community · Tau' },
  {
    name: 'description',
    content: 'Open, preview and remix curated CAD examples built with Tau, filtered by kernel.',
  },
];

const allKernels = 'all';

/** Examples per kernel, in the curated order of each kernel's first example. */
const kernelCounts = new Map<KernelId, number>();
for (const project of galleryProjects) {
  kernelCounts.set(project.kernel, (kernelCounts.get(project.kernel) ?? 0) + 1);
}

/** The kernel shelf lists only kernels that have examples, in the catalog's words. */
const shelfKernels = [...kernelCounts].flatMap(([id, count]) => {
  const configuration = kernelConfigurations.find((kernel) => kernel.id === id);
  return configuration ? [{ id, count, name: configuration.name, description: configuration.description }] : [];
});

const queryParameter = stringParameter();
const kernelParameter = enumParameter<KernelId | typeof allKernels>(
  z.union([z.enum(kernelProviders).refine((id) => kernelCounts.has(id)), z.literal(allKernels)]),
  allKernels,
);

const defaultPageSize = 20;
const pageSizeOptions = [defaultPageSize, 50, 100];
const noColumns: Array<ColumnDef<BuiltinProjectCardModel>> = [];
const searchShortcut = { key: '/' };
const searchShortcutOptions = { ignoreInputs: true };

const matchesQuery = (project: BuiltinProjectCardModel, term: string): boolean =>
  term === '' ||
  project.name.toLowerCase().includes(term) ||
  project.description.toLowerCase().includes(term) ||
  project.tags.some((tag) => tag.toLowerCase().includes(term));

export default function CadCommunity(): React.JSX.Element {
  'use no memo';

  const [query, setQuery, showQuery] = useImmediateSearchParameter(searchParameterName.query, queryParameter);
  const [kernel, setKernel, showKernel] = useImmediateSearchParameter(searchParameterName.kernel, kernelParameter);
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [pageSize, setPageSize] = useCookie<number>(cookieName.examplePageSize, defaultPageSize);
  const searchInput = useRef<HTMLInputElement>(null);

  const term = query.trim().toLowerCase();
  const isFiltered = kernel !== allKernels || term !== '';
  const filteredProjects = useMemo(
    () =>
      galleryProjects.filter(
        (project) => (kernel === allKernels || project.kernel === kernel) && matchesQuery(project, term),
      ),
    [kernel, term],
  );

  /* The page index belongs to one filter: a new query or kernel starts at the first page. */
  const filterKey = `${kernel}\n${term}`;
  const [page, setPage] = useState({ filterKey, pageIndex: 0 });
  const pageIndex = page.filterKey === filterKey ? page.pageIndex : 0;

  /* `#<locator>` opens the page that holds that card (after filters), then brings it into
     view and focuses its link. The example page links back here the same way. */
  const anchor = hash.slice(1);
  const [handledAnchor, setHandledAnchor] = useState('');
  if (anchor !== handledAnchor) {
    setHandledAnchor(anchor);
    const anchorIndex = filteredProjects.findIndex(({ locator }) => locator === anchor);
    if (anchorIndex !== -1) {
      setPage({ filterKey, pageIndex: Math.floor(anchorIndex / pageSize) });
    }
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const card = anchor === '' ? null : document.querySelector(`#${CSS.escape(anchor)}`);
      card?.scrollIntoView({ block: 'center' });
      card?.querySelector<HTMLAnchorElement>('a[href]')?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [anchor]);

  // oxlint-disable-next-line react/incompatible-library -- This component is explicitly opted out because TanStack Table returns mutable functions that cannot be compiler-memoized safely.
  const table = useReactTable({
    data: filteredProjects,
    columns: noColumns,
    getRowId: (row) => row.locator,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    onPaginationChange: (updater) => {
      const next = isFunction(updater) ? updater({ pageIndex, pageSize }) : updater;
      setPage({ filterKey, pageIndex: next.pageIndex });
      setPageSize(next.pageSize);
    },
    state: { pagination: { pageIndex, pageSize } },
  });

  useKeybinding(
    searchShortcut,
    () => {
      searchInput.current?.focus();
    },
    searchShortcutOptions,
  );

  /* One navigation: two parameter writes in one tick would each merge into the same
     rendered URL, and the second would restore what the first removed. */
  const clearFilters = (): void => {
    showQuery(queryParameter.fallback);
    showKernel(kernelParameter.fallback);
    void navigate({ search: '' }, { replace: true });
  };

  const pageProjects = table.getRowModel().rows.map((row) => row.original);

  return (
    <PageContent className='space-y-3'>
      <PageHeader
        title='Community'
        count={galleryProjects.length}
        className='gap-x-4 gap-y-3'
        action={
          <div className='ml-auto flex w-full items-center gap-2 sm:w-auto'>
            <SearchInput
              ref={searchInput}
              aria-label='Search examples'
              placeholder='Search examples…'
              value={query}
              keyboardShortcut='/'
              containerClassName='min-w-0 grow sm:w-72'
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onClear={() => {
                setQuery('');
              }}
            />
            <Button asChild>
              <NavLink to='/projects/new'>
                {({ isPending }) => (
                  <>
                    New project
                    {isPending ? <Loader /> : null}
                  </>
                )}
              </NavLink>
            </Button>
          </div>
        }
      />

      <div className='flex flex-wrap items-end gap-2'>
        <ToggleGroup
          type='single'
          variant='outline'
          spacing={2}
          className='grid w-full grid-cols-2 sm:flex sm:w-auto sm:flex-wrap'
          aria-label='Kernel'
          value={kernel}
          onValueChange={(value) => {
            if (value !== '') {
              setKernel(kernelParameter.parse(value));
            }
          }}
        >
          <ToggleGroupItem value={allKernels} className='h-auto flex-col items-start gap-0.5 px-3 py-2 text-left'>
            <span className='flex items-center gap-2'>
              All kernels <span className='text-muted-foreground tabular-nums'>{galleryProjects.length}</span>
            </span>{' '}
            <span className='text-xs font-normal text-muted-foreground'>Every example</span>
          </ToggleGroupItem>
          {shelfKernels.map((shelfKernel) => (
            <ToggleGroupItem
              key={shelfKernel.id}
              value={shelfKernel.id}
              className='h-auto flex-col items-start gap-0.5 px-3 py-2 text-left'
            >
              <span className='flex items-center gap-2'>
                <SvgIcon id={shelfKernel.id} className='size-4' aria-hidden />
                {shelfKernel.name} <span className='text-muted-foreground tabular-nums'>{shelfKernel.count}</span>
              </span>{' '}
              <span className='max-w-full truncate text-xs font-normal text-muted-foreground sm:max-w-56'>
                {shelfKernel.description}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className='ml-auto flex items-center gap-2'>
          <p role='status' className='text-sm text-muted-foreground tabular-nums'>
            {isFiltered
              ? `${filteredProjects.length} of ${galleryProjects.length} match`
              : `${galleryProjects.length} examples`}
          </p>
          {isFiltered ? (
            <Button variant='ghost' size='sm' onClick={clearFilters}>
              <X aria-hidden /> Clear
            </Button>
          ) : null}
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div className='h-64'>
          <PanelEmptyState
            icon={SearchX}
            title={`No examples match “${query.trim()}”`}
            description='Try another name or kernel.'
          >
            <Button variant='outline' size='sm' onClick={clearFilters}>
              Clear filters
            </Button>
          </PanelEmptyState>
        </div>
      ) : (
        <>
          <CommunityProjectGrid
            projects={pageProjects}
            featuredLocator={!isFiltered && pageIndex === 0 ? featuredCommunityLocator : undefined}
          />
          <DataTablePagination
            table={table}
            pageSizeOptions={pageSizeOptions}
            withSelectedCount={false}
            itemName='example'
          />
        </>
      )}
    </PageContent>
  );
}
