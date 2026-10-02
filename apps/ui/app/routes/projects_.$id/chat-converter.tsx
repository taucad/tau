import { XIcon, Download, Info, Check, ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import { useCallback, memo, useState, useMemo, useEffect, useRef } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { FileExtension } from '@taucad/types';
import { asBuffer, downloadBlob } from '@taucad/utils/file';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { IChangeEvent } from '@rjsf/core';
import deepmerge from 'deepmerge';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { useProject } from '#hooks/use-project.js';
import { toast } from '#components/ui/sonner.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { Button } from '#components/ui/button.js';
import { Checkbox } from '#components/ui/checkbox.js';
import { Label } from '#components/ui/label.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { cn } from '#utils/ui.utils.js';
import { toTitleCase } from '#utils/string.utils.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/ui/tooltip.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { sortGeometryUnitEntries } from '#routes/projects_.$id/geometry-unit.utils.js';
import type { FormatEntry } from '#routes/projects_.$id/export-formats.utils.js';
import { deriveAvailableFormats, getFormatInfo } from '#routes/projects_.$id/export-formats.utils.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { widgets, templates as rjsfTemplates } from '#components/geometry/parameters/rjsf-theme.js';
import { rjsfIdPrefix, rjsfIdSeparator } from '#components/geometry/parameters/rjsf-utils.js';
import { deleteValueAtPath, extractModifiedProperties } from '#utils/object.utils.js';
import JSZip from 'jszip';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';

const toggleConverterKeyCombination = {
  key: 'd',
  ctrlKey: true,
} satisfies KeyCombination;

export const ChatConverterTrigger = memo(function ({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <FloatingPanelTrigger
      icon={Download}
      tooltipContent={
        <div className='flex items-center gap-2'>
          {isOpen ? 'Close' : 'Open'} Exporter
          <KeyShortcut variant='tooltip'>{formatKeyCombination(toggleConverterKeyCombination)}</KeyShortcut>
        </div>
      }
      tooltipSide='left'
      className={isOpen ? 'text-primary' : undefined}
      onClick={onToggle}
    />
  );
});

// =============================================================================
// Types
// =============================================================================

type GeometryUnitEntry = {
  entryFile: string;
  actor: ActorRefFrom<typeof cadMachine>;
};

type ExportPreferences = {
  formatOptions: Partial<Record<FileExtension, Record<string, unknown>>>;
  selectedFormats: FileExtension[];
  shouldDownload: boolean;
  shouldSaveToProject: boolean;
  zipMultiple: boolean;
};

const preferencesPath = '.tau/export/preferences.json';

const defaultPreferences: ExportPreferences = {
  formatOptions: {},
  selectedFormats: [],
  shouldDownload: true,
  shouldSaveToProject: false,
  zipMultiple: false,
};

// =============================================================================
// Schema resolution
// =============================================================================

type ResolvedSchema = {
  schema: JSONSchema7;
  defaults: Record<string, unknown>;
};

function resolveFormatSchema(
  format: FileExtension,
  client: AppRuntimeClient | undefined,
  activeKernelId: string | undefined,
): ResolvedSchema | undefined {
  if (!client || !activeKernelId) {
    return undefined;
  }

  const route = client.bestRouteFor(format, activeKernelId);
  if (!route || route.kernelId !== activeKernelId) {
    return undefined;
  }

  if (Object.keys(route.schema).length === 0) {
    return undefined;
  }

  return { schema: route.schema, defaults: route.defaults };
}

// =============================================================================
// Sub-components
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

function GeometryUnitSelector({
  entries,
  selectedEntryFile,
  mainEntryFile,
  onSelect,
}: {
  readonly entries: GeometryUnitEntry[];
  readonly selectedEntryFile: string;
  readonly mainEntryFile: string;
  readonly onSelect: (entryFile: string) => void;
}) {
  // Hidden when a single geometry unit — no need for a selector
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
      <p className='mb-1.5 text-sm font-medium text-muted-foreground'>Select file to export</p>
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

function FormatButton({
  format,
  isDirect,
  isSelected,
  onToggle,
}: {
  readonly format: FileExtension;
  readonly isDirect: boolean;
  readonly isSelected: boolean;
  readonly onToggle: (format: FileExtension) => void;
}) {
  const info = getFormatInfo(format);

  const button = (
    <Button
      variant='outline'
      size='xs'
      className={cn(
        'justify-start uppercase',
        isSelected ? 'border-primary bg-primary/10 text-primary hover:bg-primary/15' : 'hover:border-primary/50',
      )}
      onClick={() => {
        onToggle(format);
      }}
    >
      <FileExtensionIcon filename={`file.${format}`} className='size-3.5 shrink-0' />
      <span className='flex-1 text-left'>{format}</span>
      {isSelected && <Check className='size-3 shrink-0' />}
    </Button>
  );

  if (!info) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side='bottom' className='max-w-56'>
        <p className='font-semibold'>{info.name}</p>
        <p className='mt-0.5 text-[10px] leading-snug text-white/70'>{info.description}</p>
        {!isDirect && <p className='mt-1 text-[10px] text-white/50 italic'>Transcoded</p>}
      </TooltipContent>
    </Tooltip>
  );
}

const formatGridCols = 'grid grid-cols-1 gap-1.5 @[10rem]:grid-cols-2 @[16rem]:grid-cols-3';

function FormatGrid({
  formats,
  selectedFormats,
  onToggle,
}: {
  readonly formats: FormatEntry[];
  readonly selectedFormats: FileExtension[];
  readonly onToggle: (format: FileExtension) => void;
}) {
  const meshFormats = formats.filter((f) => f.fidelity === 'mesh');
  const brepFormats = formats.filter((f) => f.fidelity === 'brep');

  return (
    <TooltipProvider>
      <div className='@container flex flex-col gap-3'>
        <p className='text-sm font-medium text-muted-foreground'>Select format to export</p>
        {meshFormats.length > 0 && (
          <div>
            <p className='mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase'>Mesh</p>
            <div className={formatGridCols}>
              {meshFormats.map(({ format, direct }) => (
                <FormatButton
                  key={format}
                  format={format}
                  isDirect={direct}
                  isSelected={selectedFormats.includes(format)}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </div>
        )}
        {brepFormats.length > 0 && (
          <div>
            <p className='mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase'>BREP</p>
            <div className={formatGridCols}>
              {brepFormats.map(({ format, direct }) => (
                <FormatButton
                  key={format}
                  format={format}
                  isDirect={direct}
                  isSelected={selectedFormats.includes(format)}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

type DownloadEntry = { filename: string; bytes: Uint8Array<ArrayBuffer> };

async function downloadExports(
  queue: DownloadEntry[],
  { zipMultiple, projectName }: { zipMultiple: boolean; projectName: string },
): Promise<void> {
  if (queue.length === 0) {
    return;
  }

  if (zipMultiple && queue.length > 1) {
    const zip = new JSZip();
    for (const { filename, bytes } of queue) {
      zip.file(filename, asBuffer(bytes));
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipFilename = `${projectName}-export.zip`;
    console.debug(`[Exporter] Downloading ZIP: ${zipFilename} (${zipBlob.size} bytes)`);
    downloadBlob(zipBlob, zipFilename);
  } else {
    for (const { filename, bytes } of queue) {
      const blob = new Blob([asBuffer(bytes)]);
      console.debug(`[Exporter] Downloading ${filename} (${blob.size} bytes)`);
      downloadBlob(blob, filename);
    }
  }
}

// Shared static fields for export form context (no search, always expanded)
const exportFormContextBase = {
  searchTerm: '',
  allExpanded: true,
  shouldShowField: () => true,
  units: { length: { symbol: 'mm' satisfies string, factor: 1 } },
};

function ExportFormatSettings({
  format,
  resolved,
  formatOptions,
  onOptionsChange,
}: {
  readonly format: FileExtension;
  readonly resolved: ResolvedSchema;
  readonly formatOptions: Record<string, unknown>;
  readonly onOptionsChange: (format: FileExtension, options: Record<string, unknown>) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const formData = useMemo(
    () => deepmerge(resolved.defaults, formatOptions) as Record<string, unknown>,
    [resolved.defaults, formatOptions],
  );

  const handleChange = useCallback(
    (event: IChangeEvent<Record<string, unknown>>) => {
      const newData = event.formData ?? {};
      const delta = extractModifiedProperties(newData, resolved.defaults);
      onOptionsChange(format, delta);
    },
    [format, resolved.defaults, onOptionsChange],
  );

  const resetSingleParameter = useCallback(
    (fieldPath: string[]) => {
      const updated = deleteValueAtPath(formatOptions, fieldPath);
      onOptionsChange(format, updated);
    },
    [format, formatOptions, onOptionsChange],
  );

  const formContext = useMemo(
    () => ({
      ...exportFormContextBase,
      defaultParameters: resolved.defaults,
      resetSingleParameter,
    }),
    [resolved.defaults, resetSingleParameter],
  );

  return (
    <Collapsible open={isOpen} className='border-t border-border/40 first:border-t-0' onOpenChange={setIsOpen}>
      <CollapsibleTrigger className='group/collapsible flex h-7 w-full items-center justify-between px-2 py-1 transition-colors hover:bg-muted/50'>
        <h3 className='flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
          <Settings2 className='size-3' />
          <span className='truncate'>{toTitleCase(format)} Options</span>
        </h3>
        <ChevronRight className='size-3 text-muted-foreground transition-transform duration-200 ease-in-out group-data-[state=open]/collapsible:rotate-90' />
      </CollapsibleTrigger>
      <CollapsibleContent
        className='px-0 py-0'
        style={
          {
            '--param-field-h': '1.5rem',
            '--param-field-radius': 'var(--radius-md)',
            '--param-field-color': 'var(--color-muted-foreground)',
            '--param-field-color-focus': 'var(--color-foreground)',
          } as React.CSSProperties
        }
      >
        <Form
          schema={resolved.schema}
          formData={formData}
          // @ts-expect-error -- RJSF generic type mismatch with strict TypeScript
          validator={validator}
          widgets={widgets}
          // @ts-expect-error -- RJSF generic type mismatch with strict TypeScript
          templates={rjsfTemplates}
          idPrefix={rjsfIdPrefix}
          idSeparator={rjsfIdSeparator}
          formContext={formContext}
          onChange={handleChange}
          liveValidate
          noHtml5Validate
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function ExportSettings({
  selectedFormats,
  client,
  activeKernelId,
  formatOptions,
  onOptionsChange,
}: {
  readonly selectedFormats: FileExtension[];
  readonly client: AppRuntimeClient | undefined;
  readonly activeKernelId: string | undefined;
  readonly formatOptions: Partial<Record<FileExtension, Record<string, unknown>>>;
  readonly onOptionsChange: (format: FileExtension, options: Record<string, unknown>) => void;
}) {
  const formatsWithSchemas = useMemo(() => {
    const result: Array<{ format: FileExtension; resolved: ResolvedSchema }> = [];
    for (const format of selectedFormats) {
      const resolved = resolveFormatSchema(format, client, activeKernelId);
      if (resolved) {
        result.push({ format, resolved });
      }
    }
    return result;
  }, [selectedFormats, client, activeKernelId]);

  if (formatsWithSchemas.length === 0) {
    return null;
  }

  return (
    <div className='rounded-md border border-border/50'>
      {formatsWithSchemas.map(({ format, resolved }) => (
        <ExportFormatSettings
          key={format}
          format={format}
          resolved={resolved}
          formatOptions={formatOptions[format] ?? {}}
          onOptionsChange={onOptionsChange}
        />
      ))}
    </div>
  );
}

function formatButtonLabel(selectedFormats: FileExtension[], isExporting: boolean, hasDestination: boolean): string {
  if (isExporting) {
    return 'Exporting...';
  }

  if (selectedFormats.length === 0) {
    return 'Select formats to export';
  }

  if (!hasDestination) {
    return 'Select a destination';
  }

  if (selectedFormats.length === 1) {
    return `Export ${selectedFormats[0]!.toUpperCase()}`;
  }

  return `Export ${selectedFormats.length} formats`;
}

// =============================================================================
// Preference persistence
// =============================================================================

function useExportPreferences(fileManager: ReturnType<typeof useFileManager>) {
  const [preferences, setPreferences] = useState<ExportPreferences>(defaultPreferences);
  const loadedRef = useRef(false);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { contentService } = fileManager;

  useEffect(() => {
    if (loadedRef.current || !contentService) {
      return;
    }
    loadedRef.current = true;

    // async-iife: bootstrap — hydrate export preferences from workspace JSON once
    void (async () => {
      try {
        const content = await fileManager.readFile(preferencesPath);
        if (content.byteLength > 0) {
          const decoded = new TextDecoder().decode(content);
          const parsed = JSON.parse(decoded) as Partial<ExportPreferences>;
          setPreferences((previous) => ({ ...previous, ...parsed }));
        }
      } catch {
        // File doesn't exist yet — use defaults
      }
    })();
  }, [contentService, fileManager]);

  useEffect(() => {
    return () => {
      if (writeTimerRef.current) {
        clearTimeout(writeTimerRef.current);
      }
    };
  }, []);

  const persistPreferences = useCallback(
    (next: ExportPreferences) => {
      setPreferences(next);

      if (writeTimerRef.current) {
        clearTimeout(writeTimerRef.current);
      }
      writeTimerRef.current = setTimeout(() => {
        // async-iife: bootstrap — debounced preference persist; timer already tracks lifecycle
        void (async () => {
          const content = new TextEncoder().encode(JSON.stringify(next, null, 2));
          try {
            await fileManager.writeFiles({ [preferencesPath]: { content } });
          } catch {
            // Persisting preferences is best-effort; ignore write failures
          }
        })();
      }, 100);
    },
    [fileManager],
  );

  return [preferences, persistPreferences] as const;
}

// =============================================================================
// Main component
// =============================================================================

export const ChatConverter = memo(function (properties: {
  readonly className?: string;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const { className, isExpanded = true, setIsExpanded } = properties;
  const { geometryUnits, mainEntryFile, projectRef } = useProject();
  const fileManager = useFileManager();
  const projectName = useSelector(projectRef, (state) => state.context.project?.name) ?? 'model';

  const cuEntries = useMemo<GeometryUnitEntry[]>(() => {
    const sorted = sortGeometryUnitEntries([...geometryUnits.entries()], mainEntryFile);
    return sorted.map(([entryFile, actor]) => ({ entryFile, actor }));
  }, [geometryUnits, mainEntryFile]);

  const [selectedEntryFile, setSelectedEntryFile] = useState(mainEntryFile);

  useEffect(() => {
    setSelectedEntryFile(mainEntryFile);
  }, [mainEntryFile]);

  useEffect(() => {
    if (!geometryUnits.has(selectedEntryFile)) {
      setSelectedEntryFile(mainEntryFile);
    }
  }, [geometryUnits, selectedEntryFile, mainEntryFile]);

  const selectedActor = geometryUnits.get(selectedEntryFile) ?? geometryUnits.get(mainEntryFile);

  const geometries = useSelector(selectedActor, (state) => state?.context.geometries ?? []);
  const capabilities = useSelector(selectedActor, (state) => state?.context.capabilities);
  const activeKernelId = useSelector(selectedActor, (state) => state?.context.activeKernelId);
  const kernelClient = useSelector(selectedActor, (state) => state?.context.kernelClient);

  const availableFormats = useMemo(
    () => deriveAvailableFormats(kernelClient, activeKernelId),
    // Capabilities is included so format list refreshes whenever the manifest mutates
    [kernelClient, activeKernelId, capabilities],
  );

  const [preferences, persistPreferences] = useExportPreferences(fileManager);
  const [isExporting, setIsExporting] = useState(false);

  const { selectedFormats, shouldDownload, shouldSaveToProject, zipMultiple, formatOptions } = preferences;

  const hasDestination = shouldDownload || shouldSaveToProject;

  const setSelectedFormats = useCallback(
    (updater: (previous: FileExtension[]) => FileExtension[]) => {
      persistPreferences({ ...preferences, selectedFormats: updater(preferences.selectedFormats) });
    },
    [preferences, persistPreferences],
  );

  const handleFormatToggle = useCallback(
    (format: FileExtension) => {
      setSelectedFormats((previous) =>
        previous.includes(format) ? previous.filter((f) => f !== format) : [...previous, format],
      );
    },
    [setSelectedFormats],
  );

  const handleOptionsChange = useCallback(
    (format: FileExtension, options: Record<string, unknown>) => {
      persistPreferences({
        ...preferences,
        formatOptions: { ...preferences.formatOptions, [format]: options },
      });
    },
    [preferences, persistPreferences],
  );

  const handleDownloadToggle = useCallback(
    (checked: boolean | 'indeterminate') => {
      persistPreferences({ ...preferences, shouldDownload: checked === true });
    },
    [preferences, persistPreferences],
  );

  const handleSaveToggle = useCallback(
    (checked: boolean | 'indeterminate') => {
      persistPreferences({ ...preferences, shouldSaveToProject: checked === true });
    },
    [preferences, persistPreferences],
  );

  const handleZipToggle = useCallback(
    (checked: boolean | 'indeterminate') => {
      persistPreferences({ ...preferences, zipMultiple: checked === true });
    },
    [preferences, persistPreferences],
  );

  const handleExport = useCallback(async () => {
    if (!kernelClient || selectedFormats.length === 0 || !hasDestination) {
      return;
    }

    console.debug('[Exporter] Starting export for formats:', selectedFormats);
    setIsExporting(true);

    const succeeded: FileExtension[] = [];
    const failed: FileExtension[] = [];
    const downloadQueue: DownloadEntry[] = [];

    try {
      /* oxlint-disable no-await-in-loop -- Sequential: each export depends on shared kernel state */
      for (const format of selectedFormats) {
        console.debug(`[Exporter] Exporting format: ${format}`);

        try {
          const options = formatOptions[format] ?? {};
          const result = await kernelClient.export(format, options);

          if (!result.success) {
            const message = result.issues[0]?.message ?? 'Export failed';
            console.debug(`[Exporter] Export result for ${format}: failed — ${message}`);
            failed.push(format);
            continue;
          }

          const { data } = result;
          console.debug(
            `[Exporter] Export result for ${format}: success, name=${data.name}, bytes=${data.bytes.byteLength}`,
          );

          if (shouldDownload) {
            downloadQueue.push({ filename: `${projectName}.${format}`, bytes: data.bytes });
          }

          if (shouldSaveToProject) {
            const exportPath = `exports/${data.name}`;
            console.debug(`[Exporter] Saving to project filesystem: ${exportPath}`);
            await fileManager.writeFiles({ [exportPath]: { content: data.bytes } });
          }

          succeeded.push(format);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Export failed';
          console.debug(`[Exporter] Export error for ${format}: ${message}`);
          failed.push(format);
        }
      }
      /* oxlint-enable no-await-in-loop */

      if (shouldDownload) {
        await downloadExports(downloadQueue, { zipMultiple, projectName });
      }

      if (succeeded.length > 0 && failed.length === 0) {
        const label = succeeded.map((f) => f.toUpperCase()).join(', ');
        toast.success(`Exported ${label}`);
      } else if (succeeded.length > 0) {
        toast.success(`Exported ${succeeded.map((f) => f.toUpperCase()).join(', ')}`);
        toast.error(`Failed to export ${failed.map((f) => f.toUpperCase()).join(', ')}`);
      } else {
        toast.error(`Failed to export ${failed.map((f) => f.toUpperCase()).join(', ')}`);
      }

      console.debug('[Exporter] Export complete', { succeeded, failed });
    } finally {
      setIsExporting(false);
    }
  }, [
    kernelClient,
    selectedFormats,
    formatOptions,
    projectName,
    shouldDownload,
    shouldSaveToProject,
    zipMultiple,
    fileManager,
    hasDestination,
  ]);

  const toggleConverterOpen = useCallback(() => {
    setIsExpanded?.((current) => !current);
  }, [setIsExpanded]);

  const { formattedKeyCombination: formattedConverterKeyCombination } = useKeybinding(
    toggleConverterKeyCombination,
    toggleConverterOpen,
  );

  return (
    <FloatingPanel isOpen={isExpanded} side='right' className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Exporter</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelClose
              icon={XIcon}
              tooltipContent={(isOpen) => (
                <div className='flex items-center gap-2'>
                  {isOpen ? 'Close' : 'Open'} Exporter
                  <KeyShortcut variant='tooltip'>{formattedConverterKeyCombination}</KeyShortcut>
                </div>
              )}
            />
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>

        <FloatingPanelContentBody className='p-2'>
          {geometries.length === 0 ? (
            <EmptyItems className='m-0'>
              <div className='mb-3 rounded-full bg-muted/50 p-2'>
                <Info className='size-6 text-muted-foreground' strokeWidth={1.5} />
              </div>
              <h3 className='mb-1 text-base font-medium'>No geometry to export</h3>
              <p className='text-muted-foreground'>Generate or compute geometry first to enable export options</p>
            </EmptyItems>
          ) : (
            <div className='flex flex-col gap-3 px-1'>
              <GeometryUnitSelector
                entries={cuEntries}
                selectedEntryFile={selectedEntryFile}
                mainEntryFile={mainEntryFile}
                onSelect={setSelectedEntryFile}
              />

              {availableFormats.length > 0 ? (
                <>
                  <FormatGrid
                    formats={availableFormats}
                    selectedFormats={selectedFormats}
                    onToggle={handleFormatToggle}
                  />

                  <ExportSettings
                    selectedFormats={selectedFormats}
                    client={kernelClient}
                    activeKernelId={activeKernelId}
                    formatOptions={formatOptions}
                    onOptionsChange={handleOptionsChange}
                  />

                  <div className='flex flex-col gap-2'>
                    <div className='flex items-center space-x-2'>
                      <Checkbox id='download-to-disk' checked={shouldDownload} onCheckedChange={handleDownloadToggle} />
                      <Label
                        htmlFor='download-to-disk'
                        className='cursor-pointer text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
                      >
                        Download to disk
                      </Label>
                    </div>

                    <div className='flex items-center space-x-2'>
                      <Checkbox id='save-to-project' checked={shouldSaveToProject} onCheckedChange={handleSaveToggle} />
                      <Label
                        htmlFor='save-to-project'
                        className='cursor-pointer text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
                      >
                        Save to project
                      </Label>
                    </div>

                    {shouldDownload && selectedFormats.length > 1 ? (
                      <div className='flex items-center space-x-2'>
                        <Checkbox id='zip-multiple' checked={zipMultiple} onCheckedChange={handleZipToggle} />
                        <Label
                          htmlFor='zip-multiple'
                          className='cursor-pointer text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
                        >
                          Zip multiple exports
                        </Label>
                      </div>
                    ) : null}
                  </div>

                  <Button
                    className='w-full whitespace-normal'
                    variant='outline'
                    size='sm'
                    disabled={selectedFormats.length === 0 || isExporting || !hasDestination}
                    onClick={handleExport}
                  >
                    <Download />
                    <span className='min-w-0 wrap-break-word'>
                      {formatButtonLabel(selectedFormats, isExporting, hasDestination)}
                    </span>
                  </Button>
                </>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  No export formats available. The kernel is still initializing.
                </p>
              )}
            </div>
          )}
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
});
