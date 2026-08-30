import { XIcon, Download, Info, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, memo, useState, useMemo, useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { RuntimeContentInput } from '@taucad/runtime';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { ExportFile, FileExtension } from '@taucad/types';
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
} from '#components/ui/floating-panel.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useProject } from '#hooks/use-project.js';
import { toast } from '#components/ui/sonner.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { Button } from '#components/ui/button.js';
import { Checkbox } from '#components/ui/checkbox.js';
import { Label } from '#components/ui/label.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { cn } from '#utils/ui.utils.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/ui/tooltip.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { sortGeometryUnitEntries } from '#routes/w.$workspace.$project/geometry-unit.utils.js';
import type { FormatEntry } from '#utils/export-formats.utils.js';
import {
  bestRouteForActiveKernel,
  deriveAvailableFormats,
  exportWithRuntimeValidatedInput,
  getFormatInfo,
} from '#utils/export-formats.utils.js';
import { groupExportFormatsByFidelity } from '#components/files/export-format-groups.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { widgets, templates as rjsfTemplates } from '#components/geometry/parameters/rjsf-theme.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';
import { rjsfIdPrefix, rjsfIdSeparator } from '#components/geometry/parameters/rjsf-utils.js';
import { deleteValueAtPath, extractModifiedProperties } from '#utils/object.utils.js';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';
import { createExportArtifactZip, downloadExportArtifactSet } from '#utils/export-artifact-set.utils.js';
import { downloadBlob } from '@taucad/utils/file';
import { projectWorkspaceKeyCombinations } from '#routes/w.$workspace.$project/project-workspace-context.js';

const toggleConverterKeyCombination = projectWorkspaceKeyCombinations.export;

// =============================================================================
// Types
// =============================================================================

type GeometryUnitEntry = {
  entryPath: string;
  actor: ActorRefFrom<typeof cadMachine>;
};

type ExportPreferences = {
  formatContent: Partial<Record<FileExtension, RuntimeContentInput>>;
  formatOptions: Partial<Record<FileExtension, Record<string, unknown>>>;
  selectedFormats: FileExtension[];
  shouldDownload: boolean;
  shouldSaveToProject: boolean;
  zipMultiple: boolean;
};

const preferencesPath = '.tau/export/preferences.json';

const defaultPreferences: ExportPreferences = {
  formatContent: {},
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

type ResolvedFormatSettings = {
  content?: ResolvedSchema;
  exportOptions?: ResolvedSchema;
};

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function schemaObject(schema: JSONSchema7 | boolean | undefined): JSONSchema7 | undefined {
  return schema && typeof schema === 'object' ? schema : undefined;
}

function modeForSchema(schema: JSONSchema7): string | undefined {
  const mode = schemaObject(schema.properties?.['mode']);
  if (!mode) {
    return undefined;
  }
  if (typeof mode.const === 'string') {
    return mode.const;
  }
  return mode.enum?.length === 1 && typeof mode.enum[0] === 'string' ? mode.enum[0] : undefined;
}

function unionBranches(schema: JSONSchema7): JSONSchema7[] {
  return [...(schema.anyOf ?? schema.oneOf ?? [])].flatMap((branch) => {
    const object = schemaObject(branch);
    return object ? [object] : [];
  });
}

function schemaDefaults(schema: JSONSchema7): Record<string, unknown> {
  if (!schema.properties) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(schema.properties).flatMap(([key, property]) => {
      const object = schemaObject(property);
      return object?.default === undefined ? [] : [[key, object.default]];
    }),
  );
}

function resolveActiveSchema(
  schema: JSONSchema7,
  input: Record<string, unknown>,
  defaults: Record<string, unknown> = {},
): { schema: JSONSchema7; defaults: Record<string, unknown> } {
  const branches = unionBranches(schema);
  if (branches.length === 0) {
    return { schema, defaults };
  }

  const modes = branches.map((branch) => modeForSchema(branch)).filter((mode): mode is string => mode !== undefined);
  const requestedMode =
    typeof input['mode'] === 'string'
      ? input['mode']
      : typeof defaults['mode'] === 'string'
        ? defaults['mode']
        : modes[0];
  const branch = branches.find((candidate) => modeForSchema(candidate) === requestedMode) ?? branches[0]!;
  const { anyOf: _anyOf, oneOf: _oneOf, properties: rootProperties, required: rootRequired, ...root } = schema;
  const modeSchema = schemaObject(branch.properties?.['mode']);
  const properties = {
    ...rootProperties,
    ...branch.properties,
    mode: {
      ...modeSchema,
      title: 'Mode',
      enum: modes,
      default: requestedMode,
    },
  } satisfies JSONSchema7['properties'];
  const required = [...new Set([...(rootRequired ?? []), ...(branch.required ?? []), 'mode'])];
  const activeSchema: JSONSchema7 = { ...root, ...branch, properties, required };
  const activeDefaults = { ...defaults, ...schemaDefaults(branch), mode: requestedMode };
  return { schema: activeSchema, defaults: sanitizeFormDelta(activeSchema, activeDefaults) };
}

function resolveFormatSettings(
  format: FileExtension,
  client: AppRuntimeClient | undefined,
  activeKernelId: string | undefined,
): ResolvedFormatSettings | undefined {
  if (!client || !activeKernelId) {
    return undefined;
  }

  const route = bestRouteForActiveKernel(client, format, activeKernelId);
  if (!route || route.kernelId !== activeKernelId) {
    return undefined;
  }

  const exportOptions =
    Object.keys(route.exportOptions.schema).length > 0
      ? {
          schema: route.exportOptions.schema,
          defaults: isRecordObject(route.exportOptions.defaults) ? route.exportOptions.defaults : {},
        }
      : undefined;
  const content = route.content
    ? { schema: route.content.schema, defaults: isRecordObject(route.content.defaults) ? route.content.defaults : {} }
    : undefined;

  if (!exportOptions && !content) {
    return undefined;
  }
  return { content, exportOptions };
}

function sanitizeFormDelta(schema: JSONSchema7, input: Record<string, unknown>): Record<string, unknown> {
  const activeSchema = resolveActiveSchema(schema, input).schema;
  if (!activeSchema.properties) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => {
      const propertySchema = activeSchema.properties?.[key];
      if (propertySchema === true) {
        return true;
      }
      if (!propertySchema) {
        return false;
      }
      return validator.isValid(propertySchema, value, activeSchema);
    }),
  );
}

function runtimeContentFromRecord(input: Record<string, unknown>): RuntimeContentInput {
  return {
    ...(typeof input['includeEdges'] === 'boolean' ? { includeEdges: input['includeEdges'] } : {}),
    ...(typeof input['includeTopology'] === 'boolean' ? { includeTopology: input['includeTopology'] } : {}),
  };
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

const getCuValue = (entry: GeometryUnitEntry): string => entry.entryPath;

function GeometryUnitSelector({
  entries,
  selectedEntryPath,
  mainEntryPath,
  onSelect,
}: {
  readonly entries: GeometryUnitEntry[];
  readonly selectedEntryPath: string;
  readonly mainEntryPath: string;
  readonly onSelect: (entryPath: string) => void;
}) {
  if (entries.length <= 1) {
    return (
      <div className='space-y-1.5'>
        <p className='text-xs font-medium text-muted-foreground'>File to export</p>
        <div className='flex h-8 min-w-0 items-center gap-1.5 rounded-lg border bg-background px-2 text-sm'>
          {selectedEntryPath ? <FileExtensionIcon filename={selectedEntryPath} className='size-3.5 shrink-0' /> : null}
          <span className='truncate'>{selectedEntryPath || 'No source file'}</span>
          {selectedEntryPath === mainEntryPath && selectedEntryPath ? (
            <span className='ml-auto shrink-0 text-[10px] text-muted-foreground'>Main</span>
          ) : null}
        </div>
      </div>
    );
  }

  const groupedItems = getCuGroupedItems(entries);
  const defaultValue = entries.find((entry) => entry.entryPath === selectedEntryPath);

  const renderLabel = useCallback(
    (item: GeometryUnitEntry, selectedItem: GeometryUnitEntry | undefined) => (
      <span className='flex w-full items-center justify-between gap-2'>
        <span className='flex min-w-0 items-center gap-2'>
          <FileExtensionIcon filename={item.entryPath} className='size-3.5 shrink-0' />
          <span className='flex min-w-0 flex-col'>
            <span className='truncate text-sm'>{item.entryPath}</span>
            {item.entryPath === mainEntryPath && <span className='text-[10px] text-muted-foreground'>Main</span>}
          </span>
        </span>
        {selectedItem?.entryPath === item.entryPath ? <Check className='size-3.5 shrink-0' /> : null}
      </span>
    ),
    [mainEntryPath],
  );

  return (
    <div className='space-y-1.5'>
      <p className='text-xs font-medium text-muted-foreground'>File to export</p>
      <ComboBoxResponsive<GeometryUnitEntry>
        key={mainEntryPath}
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
            <FileExtensionIcon filename={selectedEntryPath} className='size-3.5 shrink-0' />
            <span className='truncate'>{selectedEntryPath}</span>
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
      aria-pressed={isSelected}
      className={cn(
        'justify-start uppercase',
        isSelected && 'border-border bg-accent text-accent-foreground hover:bg-accent',
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
  const groups = groupExportFormatsByFidelity(formats);

  return (
    <TooltipProvider>
      <div className='@container flex flex-col gap-3'>
        {groups.map(({ name, items }) => (
          <div key={name}>
            <p className='mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase'>{name}</p>
            <div className={formatGridCols}>
              {items.map(({ format, direct }) => (
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
        ))}
      </div>
    </TooltipProvider>
  );
}

type DownloadEntry = { format: FileExtension; files: ExportFile[] };

async function downloadExports(
  queue: DownloadEntry[],
  { zipMultiple, projectName }: { zipMultiple: boolean; projectName: string },
): Promise<void> {
  if (queue.length === 0) {
    return;
  }

  if (zipMultiple && queue.length > 1) {
    const zipBlob = await createExportArtifactZip(queue.map(({ format, files }) => ({ directory: format, files })));
    downloadBlob(zipBlob, `${projectName}-export.zip`);
    return;
  }

  for (const { format, files } of queue) {
    // oxlint-disable-next-line no-await-in-loop -- Multiple browser downloads are intentionally serialized.
    await downloadExportArtifactSet(files, {
      singleFileName: `${projectName}.${format}`,
      archiveName: `${projectName}-${format}.zip`,
    });
  }
}

// Shared static fields for export form context (no search; nested groups start collapsed)
const exportFormContextBase: Pick<
  RJSFContext,
  'searchTerm' | 'allExpanded' | 'shouldShowField' | 'units' | 'displayDescriptors'
> = {
  searchTerm: '',
  allExpanded: false,
  shouldShowField: () => true,
  units: { length: { symbol: 'mm', factor: 1 } },
  displayDescriptors: {
    width: { descriptor: 'count', unit: 'px' },
    height: { descriptor: 'count', unit: 'px' },
    phi: { descriptor: 'angle', unit: 'deg' },
    theta: { descriptor: 'angle', unit: 'deg' },
    quality: { descriptor: 'count', unit: '' },
    margin: { descriptor: 'count', unit: '' },
  } as const,
};

function ExportSchemaForm({
  idPrefix,
  label,
  shouldShowLabel,
  className,
  resolved,
  value,
  onChange,
}: {
  readonly idPrefix: string;
  readonly label: string;
  readonly shouldShowLabel: boolean;
  readonly className?: string;
  readonly resolved: ResolvedSchema;
  readonly value: Record<string, unknown>;
  readonly onChange: (value: Record<string, unknown>) => void;
}) {
  const formData = useMemo(
    () => deepmerge(resolved.defaults, value) as Record<string, unknown>,
    [resolved.defaults, value],
  );
  const activeResolved = useMemo(
    () => resolveActiveSchema(resolved.schema, formData, resolved.defaults),
    [resolved.defaults, resolved.schema, formData],
  );
  const activeFormData = useMemo(
    () => sanitizeFormDelta(activeResolved.schema, deepmerge(activeResolved.defaults, value)),
    [activeResolved, value],
  );

  const handleChange = useCallback(
    (event: IChangeEvent<Record<string, unknown>>) => {
      const newData = event.formData ?? {};
      const nextResolved = resolveActiveSchema(resolved.schema, newData, resolved.defaults);
      const sanitized = sanitizeFormDelta(nextResolved.schema, newData);
      const delta = extractModifiedProperties(sanitized, nextResolved.defaults);
      const { mode } = sanitized;
      onChange(typeof mode === 'string' && mode !== resolved.defaults['mode'] ? { ...delta, mode } : delta);
    },
    [resolved.defaults, resolved.schema, onChange],
  );

  const resetSingleParameter = useCallback(
    (fieldPath: string[]) => {
      onChange(deleteValueAtPath(value, fieldPath));
    },
    [value, onChange],
  );

  const formContext = useMemo<RJSFContext>(
    () => ({
      ...exportFormContextBase,
      idPrefix,
      rootPresentation: 'embedded',
      defaultParameters: activeResolved.defaults,
      resetSingleParameter,
    }),
    [activeResolved.defaults, idPrefix, resetSingleParameter],
  );

  return (
    <section aria-label={label} className={className}>
      {shouldShowLabel ? <h4 className='px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground'>{label}</h4> : null}
      <Form
        schema={activeResolved.schema}
        formData={activeFormData}
        // @ts-expect-error -- RJSF generic type mismatch with strict TypeScript
        validator={validator}
        widgets={widgets}
        // @ts-expect-error -- RJSF generic type mismatch with strict TypeScript
        templates={rjsfTemplates}
        idPrefix={idPrefix}
        idSeparator={rjsfIdSeparator}
        formContext={formContext}
        onChange={handleChange}
        liveValidate
        noHtml5Validate
      />
    </section>
  );
}

function ExportFormatSettings({
  format,
  resolved,
  formatContent,
  formatOptions,
  onContentChange,
  onOptionsChange,
}: {
  readonly format: FileExtension;
  readonly resolved: ResolvedFormatSettings;
  readonly formatContent: RuntimeContentInput;
  readonly formatOptions: Record<string, unknown>;
  readonly onContentChange: (format: FileExtension, content: RuntimeContentInput) => void;
  readonly onOptionsChange: (format: FileExtension, options: Record<string, unknown>) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const hasDualSchemas = Boolean(resolved.content && resolved.exportOptions);
  const isModified = Object.keys(formatContent).length > 0 || Object.keys(formatOptions).length > 0;

  return (
    <Collapsible
      open={isOpen}
      className='overflow-hidden rounded-lg border border-border bg-background'
      onOpenChange={setIsOpen}
    >
      <CollapsibleTrigger className='group/collapsible flex h-8 w-full items-center justify-between rounded-lg px-2 text-left transition-colors duration-150 hover:bg-accent data-[state=open]:rounded-b-none data-[state=open]:bg-accent motion-reduce:transition-none'>
        <h3 className='flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-medium text-foreground'>
          <FileExtensionIcon filename={`file.${format}`} className='size-3.5 shrink-0' />
          <span className='truncate'>{format.toUpperCase()} options</span>
        </h3>
        <span className='mr-2 shrink-0 text-xs text-muted-foreground'>{isModified ? 'Modified' : 'Defaults'}</span>
        <ChevronRight className='size-3 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/collapsible:rotate-90 motion-reduce:transition-none' />
      </CollapsibleTrigger>
      <CollapsibleContent
        className='overflow-hidden border-t border-border px-0 py-0 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none'
        style={
          {
            '--param-field-h': '1.5rem',
            '--param-field-radius': 'var(--radius-md)',
            '--param-field-color': 'var(--color-muted-foreground)',
            '--param-field-color-focus': 'var(--color-foreground)',
          } as React.CSSProperties
        }
      >
        {resolved.content ? (
          <ExportSchemaForm
            idPrefix={`${rjsfIdPrefix}-${format}-content`}
            label='Content'
            shouldShowLabel={hasDualSchemas}
            resolved={resolved.content}
            value={{ ...formatContent }}
            onChange={(content) => {
              onContentChange(format, runtimeContentFromRecord(content));
            }}
          />
        ) : null}
        {resolved.exportOptions ? (
          <ExportSchemaForm
            idPrefix={`${rjsfIdPrefix}-${format}-options`}
            label='Format'
            shouldShowLabel={hasDualSchemas}
            className={cn(hasDualSchemas && 'border-t border-border/70')}
            resolved={resolved.exportOptions}
            value={formatOptions}
            onChange={(options) => {
              onOptionsChange(format, options);
            }}
          />
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ExportSettings({
  selectedFormats,
  client,
  activeKernelId,
  formatContent,
  formatOptions,
  onContentChange,
  onOptionsChange,
}: {
  readonly selectedFormats: FileExtension[];
  readonly client: AppRuntimeClient | undefined;
  readonly activeKernelId: string | undefined;
  readonly formatContent: Partial<Record<FileExtension, RuntimeContentInput>>;
  readonly formatOptions: Partial<Record<FileExtension, Record<string, unknown>>>;
  readonly onContentChange: (format: FileExtension, content: RuntimeContentInput) => void;
  readonly onOptionsChange: (format: FileExtension, options: Record<string, unknown>) => void;
}) {
  const formatsWithSchemas = useMemo(() => {
    const result: Array<{ format: FileExtension; resolved: ResolvedFormatSettings }> = [];
    for (const format of selectedFormats) {
      const resolved = resolveFormatSettings(format, client, activeKernelId);
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
    <div className='mt-3 flex flex-col gap-2'>
      {formatsWithSchemas.map(({ format, resolved }) => (
        <ExportFormatSettings
          key={format}
          format={format}
          resolved={resolved}
          formatContent={formatContent[format] ?? {}}
          formatOptions={formatOptions[format] ?? {}}
          onContentChange={onContentChange}
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

export const ConverterPanelBody = function (): ReactElement {
  const { geometryUnits, mainEntryPath, projectRef } = useProject();
  const fileManager = useFileManager();
  const projectName = useSelector(projectRef, (state) => state.context.project?.name) ?? 'model';

  const cuEntries = useMemo<GeometryUnitEntry[]>(() => {
    const sorted = sortGeometryUnitEntries([...geometryUnits.entries()], mainEntryPath);
    return sorted.map(([entryPath, actor]) => ({ entryPath, actor }));
  }, [geometryUnits, mainEntryPath]);

  const [selectedEntryPath, setSelectedEntryPath] = useState(mainEntryPath);

  useEffect(() => {
    setSelectedEntryPath(mainEntryPath);
  }, [mainEntryPath]);

  useEffect(() => {
    if (!geometryUnits.has(selectedEntryPath)) {
      setSelectedEntryPath(mainEntryPath);
    }
  }, [geometryUnits, selectedEntryPath, mainEntryPath]);

  const selectedActor = geometryUnits.get(selectedEntryPath) ?? geometryUnits.get(mainEntryPath);

  const geometry = useSelector(selectedActor, (state) => state?.context.geometry);
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

  const { selectedFormats, shouldDownload, shouldSaveToProject, zipMultiple, formatContent, formatOptions } =
    preferences;

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

  const handleContentChange = useCallback(
    (format: FileExtension, content: RuntimeContentInput) => {
      persistPreferences({
        ...preferences,
        formatContent: { ...preferences.formatContent, [format]: content },
      });
    },
    [preferences, persistPreferences],
  );

  useEffect(() => {
    if (!kernelClient || !activeKernelId) {
      return;
    }

    let changed = false;
    const nextOptions = { ...formatOptions };
    const nextContent = { ...formatContent };

    for (const [format, options] of Object.entries(formatOptions)) {
      const route = bestRouteForActiveKernel(kernelClient, format as FileExtension, activeKernelId);
      if (!route || route.kernelId !== activeKernelId) {
        Reflect.deleteProperty(nextOptions, format);
        changed = true;
        continue;
      }
      const sanitized = sanitizeFormDelta(route.exportOptions.schema, options);
      if (JSON.stringify(sanitized) !== JSON.stringify(options)) {
        nextOptions[format as FileExtension] = sanitized;
        changed = true;
      }
    }

    for (const [format, content] of Object.entries(formatContent)) {
      const route = bestRouteForActiveKernel(kernelClient, format as FileExtension, activeKernelId);
      if (!route?.content || route.kernelId !== activeKernelId) {
        Reflect.deleteProperty(nextContent, format);
        changed = true;
        continue;
      }
      const sanitized = runtimeContentFromRecord(sanitizeFormDelta(route.content.schema, { ...content }));
      if (JSON.stringify(sanitized) !== JSON.stringify(content)) {
        nextContent[format as FileExtension] = sanitized;
        changed = true;
      }
    }

    if (changed) {
      persistPreferences({ ...preferences, formatContent: nextContent, formatOptions: nextOptions });
    }
  }, [activeKernelId, capabilities, formatContent, formatOptions, kernelClient, persistPreferences, preferences]);

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

    setIsExporting(true);

    const succeeded: FileExtension[] = [];
    const failed: FileExtension[] = [];
    const downloadQueue: DownloadEntry[] = [];

    try {
      /* oxlint-disable no-await-in-loop -- Sequential: each export depends on shared kernel state */
      for (const format of selectedFormats) {
        try {
          const route = bestRouteForActiveKernel(kernelClient, format, activeKernelId);
          if (!route || route.kernelId !== activeKernelId) {
            failed.push(format);
            continue;
          }

          const options = sanitizeFormDelta(route.exportOptions.schema, formatOptions[format] ?? {});
          const content = route.content
            ? runtimeContentFromRecord(sanitizeFormDelta(route.content.schema, { ...formatContent[format] }))
            : undefined;
          const result = await exportWithRuntimeValidatedInput(kernelClient, route, {
            ...(content && Object.keys(content).length > 0 ? { content } : {}),
            exportOptions: options,
          });

          if (!result.success) {
            failed.push(format);
            continue;
          }

          const files = result.data;

          if (shouldDownload) {
            downloadQueue.push({ format, files });
          }

          if (shouldSaveToProject) {
            const prefix = selectedFormats.length === 1 ? 'exports' : `exports/${format}`;
            await fileManager.writeFiles(
              Object.fromEntries(files.map((file) => [`${prefix}/${file.name}`, { content: file.bytes }])),
            );
          }

          succeeded.push(format);
        } catch {
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
    } finally {
      setIsExporting(false);
    }
  }, [
    kernelClient,
    selectedFormats,
    formatOptions,
    formatContent,
    projectName,
    shouldDownload,
    shouldSaveToProject,
    zipMultiple,
    fileManager,
    hasDestination,
  ]);

  return (
    <div data-slot='export-panel-body' className='flex size-full min-h-0 flex-col overflow-hidden bg-sidebar'>
      <div
        data-slot='export-scroll-body'
        className='min-h-0 flex-1 scroll-shadows-y overflow-y-auto p-2 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'
      >
        <div className='flex min-h-full flex-col gap-2'>
          <section aria-label='Source' className='overflow-hidden rounded-xl border border-border bg-card'>
            <h2 className='border-b px-3 py-2 text-[13px] font-medium text-foreground'>Source</h2>
            <div className='p-3'>
              <GeometryUnitSelector
                entries={cuEntries}
                selectedEntryPath={selectedEntryPath}
                mainEntryPath={mainEntryPath}
                onSelect={setSelectedEntryPath}
              />
            </div>
          </section>

          {geometry ? (
            availableFormats.length > 0 ? (
              <>
                <section aria-label='Formats' className='overflow-hidden rounded-xl border border-border bg-card'>
                  <h2 className='border-b px-3 py-2 text-[13px] font-medium text-foreground'>Formats</h2>
                  <div className='p-3'>
                    <FormatGrid
                      formats={availableFormats}
                      selectedFormats={selectedFormats}
                      onToggle={handleFormatToggle}
                    />

                    <ExportSettings
                      selectedFormats={selectedFormats}
                      client={kernelClient}
                      activeKernelId={activeKernelId}
                      formatContent={formatContent}
                      formatOptions={formatOptions}
                      onContentChange={handleContentChange}
                      onOptionsChange={handleOptionsChange}
                    />
                  </div>
                </section>

                <section aria-label='Destination' className='overflow-hidden rounded-xl border border-border bg-card'>
                  <h2 className='border-b px-3 py-2 text-[13px] font-medium text-foreground'>Destination</h2>
                  <div className='divide-y divide-border'>
                    <div className='flex min-h-9 items-center gap-2 px-3 py-2 transition-colors hover:bg-accent/50'>
                      <Checkbox id='download-to-disk' checked={shouldDownload} onCheckedChange={handleDownloadToggle} />
                      <Label
                        htmlFor='download-to-disk'
                        className='flex-1 cursor-pointer text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
                      >
                        Download to disk
                      </Label>
                    </div>

                    <div className='flex min-h-9 items-center gap-2 px-3 py-2 transition-colors hover:bg-accent/50'>
                      <Checkbox id='save-to-project' checked={shouldSaveToProject} onCheckedChange={handleSaveToggle} />
                      <Label
                        htmlFor='save-to-project'
                        className='flex-1 cursor-pointer text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
                      >
                        Save to project
                      </Label>
                    </div>

                    {shouldDownload && selectedFormats.length > 1 ? (
                      <div className='flex min-h-9 items-center gap-2 px-3 py-2 transition-colors hover:bg-accent/50'>
                        <Checkbox id='zip-multiple' checked={zipMultiple} onCheckedChange={handleZipToggle} />
                        <Label
                          htmlFor='zip-multiple'
                          className='flex-1 cursor-pointer text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
                        >
                          Zip multiple exports
                        </Label>
                      </div>
                    ) : null}

                    <div data-slot='export-action-footer' className='p-3'>
                      <Button
                        className='w-full whitespace-normal'
                        size='sm'
                        disabled={selectedFormats.length === 0 || isExporting || !hasDestination}
                        onClick={handleExport}
                      >
                        <Download />
                        <span className='min-w-0 wrap-break-word'>
                          {formatButtonLabel(selectedFormats, isExporting, hasDestination)}
                        </span>
                      </Button>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <PanelEmptyState
                icon={Info}
                title='Export formats are still loading'
                description={<>Formats for {selectedEntryPath || 'this file'} will appear when its kernel is ready.</>}
                role='status'
                aria-label='Export formats are still loading'
                aria-busy='true'
                className='m-0 h-auto min-h-40 flex-1 rounded-xl border bg-card'
              />
            )
          ) : (
            <PanelEmptyState
              icon={Info}
              title='No geometry to export for this file'
              description={
                <>Generate or compute geometry for {selectedEntryPath || 'this file'} to enable export options.</>
              }
              className='m-0 h-auto min-h-40 flex-1 rounded-xl border bg-card'
            />
          )}
        </div>
      </div>
    </div>
  );
};

export const ChatConverter = memo(function (properties: {
  readonly className?: string;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const { className, isExpanded = true, setIsExpanded } = properties;
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
        <FloatingPanelContentBody className='p-0'>
          <ConverterPanelBody />
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
});
