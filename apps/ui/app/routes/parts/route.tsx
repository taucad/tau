import { useEffect, useMemo, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { useLocation, useNavigate } from 'react-router';
import { ChevronDown, Package, SearchX, X } from 'lucide-react';
import { z } from 'zod';
import { getCoreRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { PageContent } from '#components/layout/page-content.js';
import { PageHeader } from '#components/layout/page-header.js';
import { SearchInput } from '#components/search-input.js';
import { DataTablePagination } from '#components/ui/data-table.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { CommunityProjectGrid } from '#components/project-grid.js';
import { warehouseProjects } from '#constants/warehouse-parts.js';
import type { BuiltinProjectCardModel } from '#constants/project-examples.js';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useImmediateSearchParameter } from '#hooks/use-immediate-search-parameter.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { useFeature } from '#flags/use-feature.js';
import { enumParameter, stringParameter } from '#utils/search-parameter.codecs.js';
import { isFunction } from '#utils/function.utils.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = { enableOverflowY: true };
export const meta: MetaFunction = () => [
  { title: 'Parts · Tau' },
  { name: 'description', content: 'Browse, preview and remix reusable parametric CAD parts.' },
];

const allCategories = 'all';
const categories = [...new Set(warehouseProjects.flatMap(({ tags }) => (tags[0] ? [tags[0]] : [])))].sort();
const categoryLabel = (category: string): string =>
  category === allCategories
    ? 'All categories'
    : category.replaceAll('-', ' ').replace(/^./u, (letter) => letter.toUpperCase());
const queryParameter = stringParameter();
const categoryParameter = enumParameter(
  z.string().refine((value) => value === allCategories || categories.includes(value)),
  allCategories,
);
const defaultPageSize = 20;
const pageSizeOptions = [defaultPageSize, 50, 100];
const noColumns: Array<ColumnDef<BuiltinProjectCardModel>> = [];
const searchShortcut = { key: '/' };
const searchShortcutOptions = { ignoreInputs: true };

export default function Parts(): React.JSX.Element {
  const isEnabled = useFeature('partsWarehouse');
  const settings = useSettingsDialog();
  return isEnabled ? (
    <PartsCatalog />
  ) : (
    <PageContent>
      <PageHeader title='Parts' />
      <PanelEmptyState
        icon={Package}
        title='Parts is turned off'
        description='Enable Parts warehouse in Experimental settings to browse the catalog.'
      >
        <Button
          variant='outline'
          onClick={() => {
            settings.open('experimental');
          }}
        >
          Open settings
        </Button>
      </PanelEmptyState>
    </PageContent>
  );
}

function PartsCatalog(): React.JSX.Element {
  'use no memo';

  const [query, setQuery, showQuery] = useImmediateSearchParameter(searchParameterName.query, queryParameter);
  const [category, setCategory, showCategory] = useImmediateSearchParameter(
    searchParameterName.partCategory,
    categoryParameter,
  );
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [pageSize, setPageSize] = useCookie<number>(cookieName.partPageSize, defaultPageSize);
  const searchInput = useRef<HTMLInputElement>(null);
  const term = query.trim().toLowerCase();
  const isFiltered = category !== allCategories || term !== '';
  const filteredProjects = useMemo(
    () =>
      warehouseProjects.filter(
        (project) =>
          (category === allCategories || project.tags[0] === category) &&
          (term === '' ||
            [project.name, project.description, ...project.tags].some((value) => value.toLowerCase().includes(term))),
      ),
    [category, term],
  );
  const filterKey = `${category}\n${term}`;
  const [page, setPage] = useState({ filterKey, pageIndex: 0 });
  const pageIndex = page.filterKey === filterKey ? page.pageIndex : 0;
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

  // oxlint-disable-next-line react/incompatible-library -- TanStack Table returns mutable functions; this component opts out of compiler memoization.
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
  const clearFilters = (): void => {
    showQuery(queryParameter.fallback);
    showCategory(categoryParameter.fallback);
    void navigate({ search: '' }, { replace: true });
  };

  return (
    <PageContent className='space-y-3'>
      <PageHeader
        title='Parts'
        count={warehouseProjects.length}
        action={
          <SearchInput
            ref={searchInput}
            aria-label='Search parts'
            placeholder='Search parts…'
            value={query}
            keyboardShortcut='/'
            containerClassName='w-full sm:w-72'
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            onClear={() => {
              setQuery('');
            }}
          />
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='outline' aria-label={`Category: ${categoryLabel(category)}`}>
              {categoryLabel(category)} <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            <DropdownMenuRadioGroup value={category} onValueChange={setCategory}>
              {[allCategories, ...categories].map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {categoryLabel(value)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className='ml-auto flex items-center gap-2'>
          <p role='status' className='text-sm text-muted-foreground tabular-nums'>
            {isFiltered
              ? `${filteredProjects.length} of ${warehouseProjects.length} match names, descriptions or tags`
              : `${warehouseProjects.length} parts`}
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
            title={query.trim() ? `No parts match “${query.trim()}”` : 'No parts match this category'}
            description='Try another name or category.'
          >
            <Button variant='outline' size='sm' onClick={clearFilters}>
              Clear filters
            </Button>
          </PanelEmptyState>
        </div>
      ) : (
        <>
          <CommunityProjectGrid projects={table.getRowModel().rows.map((row) => row.original)} />
          <DataTablePagination
            table={table}
            pageSizeOptions={pageSizeOptions}
            withSelectedCount={false}
            itemName='part'
          />
        </>
      )}
    </PageContent>
  );
}
