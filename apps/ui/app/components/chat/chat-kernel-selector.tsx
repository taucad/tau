import { Heading } from '@taucad/ui/components/heading';
import { memo, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { KernelId, KernelPreference } from '@taucad/types/constants';
import { Badge } from '@taucad/ui/components/badge';
import type { ComboBoxSubView } from '@taucad/ui/components/combobox-responsive';
import { toast } from '@taucad/ui/components/sonner';
import { resolveKernel } from '@taucad/types/constants';
import { desktopBridge } from '#filesystem/desktop-bridge.js';
import { useFeature } from '#flags/use-feature.js';
import { kernelPickerLayout } from '#components/chat/kernel-picker-layout.js';
import type { KernelPickerRow } from '#components/chat/kernel-picker-layout.js';
import { AutoKernelGlyph } from '#components/chat/kernel-pill.js';
import { availableKernelConfigurations } from '#constants/available-kernel-configurations.js';
import { ComboBoxResponsive } from '@taucad/ui/components/combobox-responsive';
import { SvgIcon } from '@taucad/ui-kit/icons/svg-icon';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@taucad/ui/components/hover-card';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { KernelCommercialBadge } from '#cloud/kernel-commerce.js';

/* The glyph and check sit on the name's line (h-5), not the middle of the two-line row.
   Badges on that line are h-4 like the Pro badge: the line clips, so a taller badge loses its borders. */
function KernelRowBody({
  row,
  isSelected,
}: {
  readonly row: KernelPickerRow;
  readonly isSelected: boolean;
}): React.JSX.Element {
  return (
    <span className='flex w-full items-start justify-between gap-2'>
      <span className='flex min-w-0 flex-1 items-start gap-2'>
        <span className='flex h-5 shrink-0 items-center'>
          {row.id === 'auto' ? <AutoKernelGlyph /> : <SvgIcon id={row.id} aria-hidden className='size-4 shrink-0' />}
        </span>
        <span className='flex min-w-0 flex-col'>
          <span className='flex h-5 min-w-0 items-center gap-1.5 truncate leading-5'>
            {row.name}
            {row.id === 'auto' ? null : <KernelCommercialBadge kernelId={row.id} />}
            {row.unavailable ? (
              <Badge
                variant='outline'
                className='h-4 px-1.5 text-[10px] leading-none font-normal text-muted-foreground'
              >
                {row.unavailable.badge}
              </Badge>
            ) : null}
          </span>
          <span className='truncate text-xs text-muted-foreground'>{row.line}</span>
        </span>
      </span>
      {isSelected ? (
        <span className='flex h-5 shrink-0 items-center'>
          <Check aria-hidden className='size-4' />
        </span>
      ) : null}
    </span>
  );
}

/** The card a row shows on hover, to its right, as the model selector does; hidden on phones. */
function KernelRowCard({ row }: { readonly row: KernelPickerRow }): React.JSX.Element {
  if (row.id === 'auto') {
    return (
      <div className='space-y-2'>
        <div className='flex items-center gap-2'>
          <AutoKernelGlyph className='size-5' />
          <Heading level={4} variant='label'>
            Auto
          </Heading>
        </div>
        <p className='text-sm text-muted-foreground'>
          The agent picks a kernel for each new model from what you ask for: Replicad for precise parts, OpenSCAD for
          simple prints, PicoVoxel for lattices and organic forms, tscircuit for boards. It says which it chose and why.
        </p>
        <p className='text-xs text-muted-foreground'>
          A project keeps the kernel its model is written in. Pick a kernel here to decide yourself.
        </p>
      </div>
    );
  }
  const entry = resolveKernel(row.id);
  return (
    <div className='space-y-2'>
      <div className='flex items-center gap-2'>
        <SvgIcon id={row.id} aria-hidden className='size-5 shrink-0' />
        <Heading level={4} variant='label' className='flex items-center gap-1.5'>
          {entry.name}
          <KernelCommercialBadge kernelId={row.id} />
        </Heading>
      </div>
      <p className='text-sm text-muted-foreground'>{entry.longDescription}</p>
      <p className='text-xs text-muted-foreground'>Best for: {entry.recommended}</p>
      {row.unavailable ? <p className='text-xs text-foreground'>{row.unavailable.reason}</p> : null}
    </div>
  );
}

type KernelPreferenceSelectorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> & {
  readonly onSelect?: (preference: KernelPreference) => void;
  readonly onClose?: () => void;
  readonly children: ReactNode;
  readonly popoverProperties?: React.ComponentProps<typeof ComboBoxResponsive>['popoverProperties'];
};

/**
 * The kernel selector (automatic kernel selection blueprint D8, approved canvas): Auto and
 * the D8 groups at the top level, the rest under More as an in-place view, and a search that lists every level. A
 * kernel this host cannot run keeps its row and its reason; choosing it explains and selects nothing.
 */
export const KernelPreferenceSelector = memo(function ({
  onSelect,
  onClose,
  children,
  ...properties
}: KernelPreferenceSelectorProps): React.JSX.Element {
  const {
    kernel: { preference, setActivePreference },
  } = useChatComposer();
  const isSupplierOpen = useFeature('zooCloudDispatch');
  const [search, setSearch] = useState('');
  const { top, more } = useMemo(
    () =>
      kernelPickerLayout({
        host: desktopBridge() === undefined ? 'web' : 'desktop',
        withAuto: true,
        available: new Set<KernelId>(availableKernelConfigurations().map(({ id }) => id)),
        isSupplierOpen,
      }),
    [isSupplierOpen],
  );
  const rows = useMemo(() => [...top, ...more].flatMap(({ items }) => items), [top, more]);
  const subViews = useMemo<ReadonlyArray<ComboBoxSubView<KernelPickerRow>>>(
    () => [
      {
        id: 'more',
        title: 'More kernels',
        label: 'More kernels',
        groupedItems: more.map((group) => ({ ...group, items: [...group.items] })),
      },
    ],
    [more],
  );
  const handleSelect = useCallback(
    (id: string) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (row === undefined) {
        return;
      }
      if (row.unavailable) {
        toast.info(`${row.name} is not available here`, { description: row.unavailable.reason });
        return;
      }
      setActivePreference(row.id);
      onSelect?.(row.id);
    },
    [onSelect, rows, setActivePreference],
  );

  return (
    <ComboBoxResponsive<KernelPickerRow>
      {...properties}
      className="data-[slot='popover-content']:w-80"
      popoverProperties={properties.popoverProperties}
      title='Kernel'
      description='Choose Auto or one kernel for this chat.'
      searchPlaceHolder='Search kernels…'
      emptyListMessage='No kernels found.'
      groupedItems={top.map((group) => ({ ...group, items: [...group.items] }))}
      subViews={subViews}
      search={search}
      onSearchChange={setSearch}
      getValue={(row) => row.id}
      getKeywords={(row) => [row.name, row.line]}
      value={rows.find((row) => row.id === preference)}
      shouldCloseOnSelect={(id) => rows.find((row) => row.id === id)?.unavailable === undefined}
      renderLabel={(row, selected) => (
        <HoverCard openDelay={300}>
          <HoverCardTrigger asChild>
            <span className='flex w-full'>
              <KernelRowBody row={row} isSelected={selected?.id === row.id} />
            </span>
          </HoverCardTrigger>
          <HoverCardContent side='right' align='start' sideOffset={12} alignOffset={-4} className='w-72 max-md:hidden'>
            <KernelRowCard row={row} />
          </HoverCardContent>
        </HoverCard>
      )}
      onSelect={handleSelect}
      onClose={() => {
        setSearch('');
        onClose?.();
      }}
    >
      {children}
    </ComboBoxResponsive>
  );
});
