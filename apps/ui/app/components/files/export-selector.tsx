import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { FileExtension } from '@taucad/types';
import { Button } from '#components/ui/button.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { Popover, PopoverContent, PopoverTrigger } from '#components/ui/popover.js';
import { cn } from '#utils/ui.utils.js';
import { ExportFormatGrid } from '#components/files/export-format-grid.js';
import { useExportToDisk } from '#components/files/use-export-to-disk.js';
import { deriveAvailableFormats } from '#routes/projects_.$id/export-formats.utils.js';
import { sortGeometryUnitEntries } from '#routes/projects_.$id/geometry-unit.utils.js';
import type { cadMachine } from '#machines/cad.machine.js';

type GeometryUnitEntry = {
  entryFile: string;
  actor: ActorRefFrom<typeof cadMachine>;
};

export type ExportSelectorVariant = 'sub' | 'popover' | 'inline';

export type ExportSelectorProps = {
  /**
   * Single geometry unit mode: when provided, only the selected actor is exported.
   * Mutually exclusive with `geometryUnits`.
   */
  readonly cadActor?: ActorRefFrom<typeof cadMachine>;
  /**
   * Multi-geometry unit mode: when provided (and `cadActor` is absent), renders a geometry unit
   * picker plus a per-geometry-unit format grid.
   */
  readonly geometryUnits?: Map<string, ActorRefFrom<typeof cadMachine>>;
  /**
   * Base filename used when downloading the exported blob. The file extension is appended
   * automatically (`${filenameBase}.${format}`). Required so the component stays decoupled
   * from any project context.
   */
  readonly filenameBase: string;
  /**
   * Optional main entry file. Used in multi-geometry mode to mark the "Main" badge in the
   * picker and to seed the initial selection. Ignored in single-geometry mode.
   */
  readonly mainEntryFile?: string;
  readonly defaultEntryFile?: string;
  /**
   * Layout variant.
   * - `sub`: bare body, sized for a `DropdownMenuSubContent`/`ContextMenuSubContent`.
   * - `popover`: wraps in a `Popover`.
   * - `inline`: returns just the body, no wrapper.
   */
  readonly variant?: ExportSelectorVariant;
  /**
   * Optional callback fired after a successful export. Caller can use it to
   * close menus, show downstream UI, or extend the workflow.
   */
  readonly onExport?: (entryFile: string, format: FileExtension) => void;
  /** Trigger element when `variant === 'popover'`. */
  readonly children?: ReactNode;
  readonly className?: string;
};

// =============================================================================
// geometry unit picker (single-geometry-unit mode hides this entirely)
// =============================================================================

const cuGroupedItemsCache = new WeakMap<GeometryUnitEntry[], Array<{ name: string; items: GeometryUnitEntry[] }>>();

function getCuGroupedItems(entries: GeometryUnitEntry[]): Array<{ name: string; items: GeometryUnitEntry[] }> {
  let cached = cuGroupedItemsCache.get(entries);
  if (!cached) {
    cached = [{ name: '', items: entries }];
    cuGroupedItemsCache.set(entries, cached);
  }
  return cached;
}

const getCuValue = (entry: GeometryUnitEntry): string => entry.entryFile;

function GeometryUnitPicker({
  entries,
  selectedEntryFile,
  mainEntryFile,
  onSelect,
}: {
  readonly entries: GeometryUnitEntry[];
  readonly selectedEntryFile: string;
  readonly mainEntryFile: string | undefined;
  readonly onSelect: (entryFile: string) => void;
}) {
  if (entries.length <= 1) {
    return null;
  }

  const groupedItems = getCuGroupedItems(entries);
  const defaultValue = entries.find((entry) => entry.entryFile === selectedEntryFile);

  const renderLabel = useCallback(
    (item: GeometryUnitEntry, selectedItem: GeometryUnitEntry | undefined) => (
      <span className='flex w-full items-center justify-between gap-2'>
        <span className='flex min-w-0 items-center gap-2'>
          <FileExtensionIcon filename={item.entryFile} className='size-3.5 shrink-0' />
          <span className='flex min-w-0 flex-col'>
            <span className='truncate text-sm'>{item.entryFile}</span>
            {item.entryFile === mainEntryFile && <span className='text-[10px] text-muted-foreground'>Main</span>}
          </span>
        </span>
        {selectedItem?.entryFile === item.entryFile ? <Check className='size-3.5 shrink-0' /> : null}
      </span>
    ),
    [mainEntryFile],
  );

  return (
    <div>
      <p className='mb-1.5 text-xs font-medium text-muted-foreground'>File</p>
      <ComboBoxResponsive<GeometryUnitEntry>
        key={mainEntryFile}
        groupedItems={groupedItems}
        renderLabel={renderLabel}
        getValue={getCuValue}
        value={defaultValue}
        placeholder='Select file'
        searchPlaceHolder='Filter files...'
        title='Select geometry unit'
        description='Choose which file to export geometry from.'
        isSearchEnabled={entries.length > 5}
        popoverProperties={{ className: 'w-[min(100vw-2rem,280px)]' }}
        onSelect={onSelect}
      >
        <Button variant='outline' size='sm' className='w-full justify-between'>
          <span className='flex min-w-0 items-center gap-1.5'>
            <FileExtensionIcon filename={selectedEntryFile} className='size-3.5 shrink-0' />
            <span className='truncate'>{selectedEntryFile}</span>
          </span>
          <ChevronDown className='size-3 shrink-0 text-muted-foreground' />
        </Button>
      </ComboBoxResponsive>
    </div>
  );
}

// =============================================================================
// Body — selectable geometry unit + format grid + export action
// =============================================================================

function ExportSelectorBody({
  entries,
  selectedEntryFile,
  mainEntryFile,
  onEntryFileChange,
  selectedActor,
  filenameBase,
  onExport,
}: {
  readonly entries: GeometryUnitEntry[];
  readonly selectedEntryFile: string;
  readonly mainEntryFile: string | undefined;
  readonly onEntryFileChange: (entryFile: string) => void;
  readonly selectedActor: ActorRefFrom<typeof cadMachine> | undefined;
  readonly filenameBase: string;
  readonly onExport?: (entryFile: string, format: FileExtension) => void;
}): React.JSX.Element {
  const capabilities = useSelector(selectedActor, (state) => state?.context.capabilities);
  const activeKernelId = useSelector(selectedActor, (state) => state?.context.activeKernelId);
  const kernelClient = useSelector(selectedActor, (state) => state?.context.kernelClient);

  const availableFormats = useMemo(
    () => deriveAvailableFormats(kernelClient, activeKernelId),
    [kernelClient, activeKernelId, capabilities],
  );

  const { exportToDisk, isExporting } = useExportToDisk(filenameBase);

  const handleSelectFormat = useCallback(
    async (format: FileExtension) => {
      if (!selectedActor) {
        return;
      }
      await exportToDisk(selectedActor, format);
      onExport?.(selectedEntryFile, format);
    },
    [selectedActor, exportToDisk, onExport, selectedEntryFile],
  );

  return (
    <div className='flex flex-col gap-3'>
      <GeometryUnitPicker
        entries={entries}
        selectedEntryFile={selectedEntryFile}
        mainEntryFile={mainEntryFile}
        onSelect={onEntryFileChange}
      />
      {availableFormats.length > 0 ? (
        <ExportFormatGrid formats={availableFormats} isExporting={isExporting} onSelectFormat={handleSelectFormat} />
      ) : (
        <p className='text-xs text-muted-foreground'>No export formats available. The kernel is still initializing.</p>
      )}
    </div>
  );
}

// =============================================================================
// Public component
// =============================================================================

/**
 * Picks an export format and immediately downloads the result.
 *
 * Single-geometry unit mode: pass `cadActor` to lock the selector to one geometry unit.
 * Multi-geometry unit mode: pass `geometryUnits` (and optionally `mainEntryFile`) to
 * allow the user to pick which geometry unit to export.
 *
 * Variants:
 * - `sub`: bare body sized for `DropdownMenuSubContent`/`ContextMenuSubContent`.
 * - `popover`: wrapped in a `Popover` whose trigger is `children`.
 * - `inline`: just the body — caller controls layout.
 */
export function ExportSelector({
  cadActor,
  geometryUnits,
  filenameBase,
  mainEntryFile,
  defaultEntryFile,
  variant = 'inline',
  onExport,
  children,
  className,
}: ExportSelectorProps): React.JSX.Element {
  const entries = useMemo<GeometryUnitEntry[]>(() => {
    if (cadActor) {
      // Single-geometry unit mode — derive a synthetic entry from the actor. The picker
      // will be hidden because length === 1.
      const entryFile = defaultEntryFile ?? mainEntryFile ?? filenameBase;
      return [{ entryFile, actor: cadActor }];
    }
    if (geometryUnits) {
      const sorted = sortGeometryUnitEntries([...geometryUnits.entries()], mainEntryFile ?? '');
      return sorted.map(([entryFile, actor]) => ({ entryFile, actor }));
    }
    return [];
  }, [cadActor, geometryUnits, defaultEntryFile, mainEntryFile, filenameBase]);

  const initialEntryFile = defaultEntryFile ?? mainEntryFile ?? entries[0]?.entryFile ?? '';
  const [selectedEntryFile, setSelectedEntryFile] = useState(initialEntryFile);

  useEffect(() => {
    if (!entries.some((entry) => entry.entryFile === selectedEntryFile)) {
      setSelectedEntryFile(entries[0]?.entryFile ?? initialEntryFile);
    }
  }, [entries, selectedEntryFile, initialEntryFile]);

  const selectedActor = entries.find((entry) => entry.entryFile === selectedEntryFile)?.actor ?? entries[0]?.actor;

  const body = (
    <ExportSelectorBody
      entries={entries}
      selectedEntryFile={selectedEntryFile}
      mainEntryFile={mainEntryFile}
      onEntryFileChange={setSelectedEntryFile}
      selectedActor={selectedActor}
      filenameBase={filenameBase}
      onExport={onExport}
    />
  );

  if (variant === 'popover') {
    return (
      <Popover>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent className={cn('w-72 p-3', className)}>{body}</PopoverContent>
      </Popover>
    );
  }

  if (variant === 'sub') {
    return <div className={cn('w-64 p-2', className)}>{body}</div>;
  }

  return <div className={className}>{body}</div>;
}
