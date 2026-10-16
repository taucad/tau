import Form from '@rjsf/core';
import type { IChangeEvent } from '@rjsf/core';
import { Check, ChevronDown, ChevronRight, Download, File as FileIcon, Info } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { useSelector } from '@xstate/react';
import type { RuntimeContentInput } from '@taucad/runtime';
import { getActiveGroupValues } from '@taucad/types';
import type { FileExtension, FileParameterEntry } from '@taucad/types';
import type { ParameterManifest } from '@taucad/parameters';
import { formatConfigurations } from '@taucad/types/constants';
import { Button } from '@taucad/ui/components/button';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { ComboBoxResponsive } from '@taucad/ui/components/combobox-responsive';
import { Label } from '@taucad/ui/components/label';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import type { LengthSymbol } from '@taucad/viewer/constants/length-units';
import type { ParameterEdit, RJSFContext } from '@taucad/viewer/parameters/rjsf-context';
import { rjsfFields } from '@taucad/viewer/parameters/rjsf-field-path';
import { templates as rjsfTemplates, widgets } from '@taucad/viewer/parameters/rjsf-theme';
import {
  mergeFormDefaults,
  normalizeRjsfFormData,
  resetRjsfField,
  rjsfDefaultFormStateBehavior,
  rjsfIdPrefix,
  rjsfIdSeparator,
} from '@taucad/viewer/parameters/rjsf-utils';
import { rjsfValidator } from '@taucad/viewer/parameters/rjsf-validator';
import { useWorkbenchPanesHost } from '#host/workbench-host.jsx';
import {
  compileExportConfigurationManifest,
  defaultExportPreferences,
  extractModifiedTopLevel,
  fillMissingBatchViewIds,
  groupExportFormatsByFidelity,
  resolveActiveSchema,
  runtimeContentFromRecord,
  sanitizeFormDelta,
} from '#export/export-source.js';
import type {
  ExportFormatEntry,
  ExportOptionBinding,
  ExportOptionStore,
  ExportPreferences,
  ExportPreferencesState,
  ExportSchema,
  ExportSource,
} from '#export/export-source.js';

// Shared static fields for export form context (no search; nested groups start collapsed)
const exportFormContextBase: Pick<RJSFContext, 'searchTerm' | 'allExpanded' | 'shouldShowField'> = {
  searchTerm: '',
  allExpanded: false,
  shouldShowField: () => true,
};

const transientEdit: ParameterEdit = { kind: 'transient' };

const noSubscription = (): (() => void) => () => undefined;

/** The form's backing: an authoritative record, or a manifest alone whose values live in the preferences. */
type FormSession =
  | Readonly<{ kind: 'authoritative'; binding: ExportOptionBinding }>
  | Readonly<{ kind: 'transient'; manifest: ParameterManifest }>;

/**
 * The parameter fields of the form context for a session: authoritative commits once the record settled, otherwise
 * transient edits against the session's manifest.
 *
 * @param session - The form's backing.
 * @param entry - The settled record, if any.
 * @returns The manifest, group and edit mode.
 */
function sessionContext(
  session: FormSession,
  entry: FileParameterEntry | undefined,
): Pick<RJSFContext, 'parameterManifest' | 'parameterGroup' | 'parameterEdit'> {
  if (session.kind === 'authoritative' && entry) {
    return {
      parameterManifest: session.binding.manifest,
      parameterGroup: entry.groups[entry.activeGroup],
      parameterEdit: {
        kind: 'authoritative',
        commit: { ...session.binding.commit, group: entry.activeGroup },
      },
    };
  }
  return {
    parameterManifest: session.kind === 'transient' ? session.manifest : session.binding.manifest,
    parameterEdit: transientEdit,
  };
}

/**
 * Props of {@link ExportSchemaForm}.
 *
 * @public
 */
export type ExportSchemaFormProps = Readonly<{
  idPrefix: string;
  provider?: string;
  configuration?: string;
  /** The authoritative record behind the values; without it the values are the preferences' own. */
  optionStore?: ExportOptionStore | undefined;
  label: string;
  shouldShowLabel: boolean;
  className?: string;
  resolved: ExportSchema;
  /** The project's length display unit; model-length options convert to it. */
  lengthDisplaySymbol?: LengthSymbol;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  /** Report a failure to prepare or save; without it the form shows the failure in place. */
  onError?: ((message: string) => void) | undefined;
}>;

/**
 * One export route's option or content schema as an embedded parameter form.
 *
 * @param props - The schema, its values and where they are kept.
 * @returns The labelled form section, or its loading state while the values are prepared.
 * @public
 */
export function ExportSchemaForm({
  idPrefix,
  provider = 'runtime',
  configuration = idPrefix,
  optionStore,
  label,
  shouldShowLabel,
  className,
  resolved,
  lengthDisplaySymbol = 'mm',
  value,
  onChange,
  onError,
}: ExportSchemaFormProps): ReactElement {
  'use no memo';

  const legacyValueRef = useRef(value);
  useEffect(() => {
    legacyValueRef.current = value;
  }, [value]);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  const [session, setSession] = useState<FormSession>();
  const [failure, setFailure] = useState<string>();
  const report = useCallback((message: string) => {
    if (onErrorRef.current) {
      onErrorRef.current(message);
    } else {
      setFailure(message);
    }
  }, []);

  const binding = session?.kind === 'authoritative' ? session.binding : undefined;
  const parameterEntry = useSyncExternalStore<FileParameterEntry | undefined>(
    binding?.subscribe ?? noSubscription,
    () => binding?.getEntry(),
  );
  const isReady = session !== undefined && (session.kind === 'transient' || parameterEntry !== undefined);
  const authoritativeValue = getActiveGroupValues(parameterEntry);
  const effectiveValue = binding && parameterEntry ? authoritativeValue : value;
  const formData = useMemo(
    () => mergeFormDefaults(resolved.schema, resolved.defaults, effectiveValue),
    [effectiveValue, resolved.defaults, resolved.schema],
  );
  const activeResolved = useMemo(
    () => resolveActiveSchema(resolved.schema, formData, resolved.defaults),
    [resolved.defaults, resolved.schema, formData],
  );
  const activeFormData = useMemo(
    () =>
      sanitizeFormDelta(
        activeResolved.schema,
        mergeFormDefaults(activeResolved.schema, activeResolved.defaults, effectiveValue),
      ),
    [activeResolved, effectiveValue],
  );
  const currentFormDataRef = useRef(activeFormData);
  useEffect(() => {
    currentFormDataRef.current = activeFormData;
  }, [activeFormData]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Changing configuration invalidates the prior authority target immediately.
    setSession(undefined);
    setFailure(undefined);
    const controller = new AbortController();
    const prepare = async (): Promise<void> => {
      try {
        if (optionStore) {
          const opened = await optionStore.open({
            provider,
            configuration,
            resolved,
            legacyValues: legacyValueRef.current,
            signal: controller.signal,
          });
          controller.signal.throwIfAborted();
          setSession({ kind: 'authoritative', binding: opened });
        } else {
          const { manifest } = await compileExportConfigurationManifest(provider, configuration, resolved);
          controller.signal.throwIfAborted();
          setSession({ kind: 'transient', manifest });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          report(`${label} could not be prepared: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };
    // async-iife: bootstrap — the option store owns settlement beyond this form's view lifetime.
    void prepare();
    return () => {
      controller.abort();
    };
  }, [configuration, label, optionStore, provider, report, resolved]);

  useEffect(() => {
    if (binding && parameterEntry && JSON.stringify(authoritativeValue) !== JSON.stringify(value)) {
      onChange({ ...authoritativeValue });
    }
  }, [authoritativeValue, binding, onChange, parameterEntry, value]);

  const persistValues = useCallback(
    (next: Record<string, unknown>) => {
      if (!session) {
        return;
      }
      if (session.kind === 'transient') {
        onChange({ ...next });
        return;
      }
      if (!parameterEntry) {
        return;
      }
      const persist = async (): Promise<void> => {
        try {
          await session.binding.replaceValues(next);
          onChange({ ...next });
        } catch (error) {
          report(error instanceof Error ? error.message : 'Failed to update export settings.');
        }
      };
      // async-iife: bootstrap — the option store retains and drains this accepted operation.
      void persist();
    },
    [onChange, parameterEntry, report, session],
  );

  const handleChange = useCallback(
    (event: IChangeEvent<Record<string, unknown>>) => {
      const normalized = normalizeRjsfFormData(resolved.schema, event.formData ?? {}) as Record<string, unknown>;
      const nextResolved = resolveActiveSchema(resolved.schema, normalized, resolved.defaults);
      const complete = mergeFormDefaults(nextResolved.schema, nextResolved.defaults, normalized);
      const newData = fillMissingBatchViewIds(nextResolved.schema, complete);
      const sanitized = sanitizeFormDelta(nextResolved.schema, newData);
      currentFormDataRef.current = sanitized;
      const delta = Object.fromEntries(
        Object.entries(extractModifiedTopLevel(sanitized, nextResolved.defaults)).filter(
          ([key, entry]) => !Array.isArray(entry) || entry.length > 0 || Object.hasOwn(nextResolved.defaults, key),
        ),
      );
      const { mode } = sanitized;
      persistValues(typeof mode === 'string' && mode !== resolved.defaults['mode'] ? { ...delta, mode } : delta);
    },
    [persistValues, resolved.defaults, resolved.schema],
  );

  const resetSingleParameter = useCallback<RJSFContext['resetSingleParameter']>(
    (input) => {
      const reset = resetRjsfField({
        ...input,
        formData: currentFormDataRef.current,
      });
      if (reset !== undefined) {
        currentFormDataRef.current = reset;
        persistValues(extractModifiedTopLevel(reset, activeResolved.defaults));
      }
    },
    [activeResolved.defaults, persistValues],
  );

  if (!isReady) {
    return (
      <section aria-label={label} className={className}>
        {shouldShowLabel ? (
          <h4 className='px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground'>{label}</h4>
        ) : null}
        <p role={failure ? 'alert' : undefined} className='px-2.5 py-2 text-xs text-muted-foreground'>
          {failure ?? 'Loading checked settings…'}
        </p>
      </section>
    );
  }

  const formContext: RJSFContext = {
    ...exportFormContextBase,
    units: { length: { displaySymbol: lengthDisplaySymbol } },
    idPrefix,
    rootPresentation: 'embedded',
    defaultParameters: activeResolved.defaults,
    resetSingleParameter,
    ...sessionContext(session, parameterEntry),
  };

  return (
    <section aria-label={label} className={className}>
      {shouldShowLabel ? <h4 className='px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground'>{label}</h4> : null}
      {failure ? (
        <p role='alert' className='px-2.5 pt-2 text-xs text-destructive'>
          {failure}
        </p>
      ) : null}
      <Form
        schema={activeResolved.schema}
        formData={activeFormData}
        validator={rjsfValidator}
        widgets={widgets}
        fields={rjsfFields}
        templates={rjsfTemplates}
        idPrefix={idPrefix}
        idSeparator={rjsfIdSeparator}
        formContext={formContext}
        experimental_defaultFormStateBehavior={rjsfDefaultFormStateBehavior}
        onChange={handleChange}
        liveValidate='onChange'
        noHtml5Validate
      />
    </section>
  );
}

type FileIconComponent = NonNullable<ExportSource['FileIcon']>;

function PlainFileIcon({ className }: Readonly<{ filename: string; className?: string }>): ReactElement {
  return <FileIcon className={className} />;
}

type GeometryUnitEntry = {
  entryPath: string;
};

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
  FileIcon: EntryIcon,
}: {
  readonly entries: GeometryUnitEntry[];
  readonly selectedEntryPath: string;
  readonly mainEntryPath: string;
  readonly onSelect: (entryPath: string) => void;
  readonly FileIcon: FileIconComponent;
}) {
  const renderLabel = useCallback(
    (item: GeometryUnitEntry, selectedItem: GeometryUnitEntry | undefined) => (
      <span className='flex w-full items-center justify-between gap-2'>
        <span className='flex min-w-0 items-center gap-2'>
          <EntryIcon filename={item.entryPath} className='size-3.5 shrink-0' />
          <span className='flex min-w-0 flex-col'>
            <span className='truncate text-sm'>{item.entryPath}</span>
            {item.entryPath === mainEntryPath && <span className='text-[10px] text-muted-foreground'>Main</span>}
          </span>
        </span>
        {selectedItem?.entryPath === item.entryPath ? <Check className='size-3.5 shrink-0' /> : null}
      </span>
    ),
    [EntryIcon, mainEntryPath],
  );

  if (entries.length <= 1) {
    return (
      <div className='space-y-1.5'>
        <p className='text-xs font-medium text-muted-foreground'>File to export</p>
        <div className='flex h-8 min-w-0 items-center gap-1.5 rounded-lg border bg-background px-2 text-sm'>
          {selectedEntryPath ? <EntryIcon filename={selectedEntryPath} className='size-3.5 shrink-0' /> : null}
          <span className='truncate'>{selectedEntryPath === '' ? 'No source file' : selectedEntryPath}</span>
          {selectedEntryPath === mainEntryPath && selectedEntryPath ? (
            <span className='ml-auto shrink-0 text-[10px] text-muted-foreground'>Main</span>
          ) : null}
        </div>
      </div>
    );
  }

  const groupedItems = getCuGroupedItems(entries);
  const defaultValue = entries.find((entry) => entry.entryPath === selectedEntryPath);

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
        searchPlaceHolder='Filter files…'
        title='Select geometry unit'
        description='Choose which file to export geometry from.'
        isSearchEnabled={entries.length > 5}
        popoverProperties={{ className: 'w-[min(100vw-2rem,280px)]' }}
        onSelect={onSelect}
      >
        <Button variant='outline' size='sm' className='w-full justify-between'>
          <span className='flex min-w-0 items-center gap-1.5'>
            <EntryIcon filename={selectedEntryPath} className='size-3.5 shrink-0' />
            <span className='truncate'>{selectedEntryPath}</span>
          </span>
          <ChevronDown className='size-3 shrink-0 text-muted-foreground' />
        </Button>
      </ComboBoxResponsive>
    </div>
  );
}

function getFormatInfo(format: FileExtension): { name: string; description: string } | undefined {
  return format in formatConfigurations ? formatConfigurations[format] : undefined;
}

function FormatButton({
  format,
  isDirect,
  isSelected,
  onToggle,
  FileIcon: FormatIcon,
}: {
  readonly format: FileExtension;
  readonly isDirect: boolean;
  readonly isSelected: boolean;
  readonly onToggle: (format: FileExtension) => void;
  readonly FileIcon: FileIconComponent;
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
      <FormatIcon filename={`file.${format}`} className='size-3.5 shrink-0' />
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
  FileIcon: FormatIcon,
}: {
  readonly formats: readonly ExportFormatEntry[];
  readonly selectedFormats: FileExtension[];
  readonly onToggle: (format: FileExtension) => void;
  readonly FileIcon: FileIconComponent;
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
                  FileIcon={FormatIcon}
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

function ExportFormatSettings({
  entry,
  formatContent,
  formatOptions,
  optionStore,
  lengthDisplaySymbol,
  onError,
  onContentChange,
  onOptionsChange,
  FileIcon: FormatIcon,
}: {
  readonly entry: ExportFormatEntry;
  readonly formatContent: RuntimeContentInput;
  readonly formatOptions: Record<string, unknown>;
  readonly optionStore: ExportOptionStore | undefined;
  readonly lengthDisplaySymbol: LengthSymbol;
  readonly onError: ((message: string) => void) | undefined;
  readonly onContentChange: (format: FileExtension, content: RuntimeContentInput) => void;
  readonly onOptionsChange: (format: FileExtension, options: Record<string, unknown>) => void;
  readonly FileIcon: FileIconComponent;
}) {
  const { format, provider, content, exportOptions } = entry;
  const hasDualSchemas = Boolean(content && exportOptions);
  const isModified = Object.keys(formatContent).length > 0 || Object.keys(formatOptions).length > 0;

  return (
    <Collapsible defaultOpen className='overflow-hidden rounded-lg border border-border bg-background'>
      <CollapsibleTrigger className='group/collapsible flex h-8 w-full items-center justify-between rounded-lg px-2 text-left transition-colors duration-150 hover:bg-accent data-[state=open]:rounded-b-none data-[state=open]:bg-accent motion-reduce:transition-none'>
        <h3 className='flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-medium text-foreground'>
          <FormatIcon filename={`file.${format}`} className='size-3.5 shrink-0' />
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
        {content ? (
          <ExportSchemaForm
            idPrefix={`${rjsfIdPrefix}-${format}-content`}
            provider={provider}
            configuration={`export/${format}/content`}
            optionStore={optionStore}
            label='Content'
            shouldShowLabel={hasDualSchemas}
            resolved={content}
            lengthDisplaySymbol={lengthDisplaySymbol}
            value={{ ...formatContent }}
            onError={onError}
            onChange={(next) => {
              onContentChange(format, runtimeContentFromRecord(next));
            }}
          />
        ) : null}
        {exportOptions ? (
          <ExportSchemaForm
            idPrefix={`${rjsfIdPrefix}-${format}-options`}
            provider={provider}
            configuration={`export/${format}/options`}
            optionStore={optionStore}
            label='Format'
            shouldShowLabel={hasDualSchemas}
            className={cn(hasDualSchemas && 'border-t border-border/70')}
            resolved={exportOptions}
            lengthDisplaySymbol={lengthDisplaySymbol}
            value={formatOptions}
            onError={onError}
            onChange={(next) => {
              onOptionsChange(format, next);
            }}
          />
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function formatButtonLabel(selectedFormats: FileExtension[], isExporting: boolean, hasDestination: boolean): string {
  if (isExporting) {
    return 'Exporting…';
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

type ExportStatus = Readonly<{ tone: 'success' | 'error'; message: string }>;

function DestinationSection({
  hasDownload,
  hasProject,
  isDestinationFixed,
  shouldDownload,
  shouldSaveToProject,
  isZipOffered,
  isZipChosen,
  isExportDisabled,
  exportLabel,
  status,
  onDownloadToggle,
  onSaveToggle,
  onZipToggle,
  onExport,
}: {
  readonly hasDownload: boolean;
  readonly hasProject: boolean;
  readonly isDestinationFixed: boolean;
  readonly shouldDownload: boolean;
  readonly shouldSaveToProject: boolean;
  readonly isZipOffered: boolean;
  readonly isZipChosen: boolean;
  readonly isExportDisabled: boolean;
  readonly exportLabel: string;
  readonly status: ExportStatus | undefined;
  readonly onDownloadToggle: (checked: boolean | 'indeterminate') => void;
  readonly onSaveToggle: (checked: boolean | 'indeterminate') => void;
  readonly onZipToggle: (checked: boolean | 'indeterminate') => void;
  readonly onExport: () => void;
}): ReactElement {
  return (
    <section aria-label='Destination' className='overflow-hidden rounded-xl border border-border bg-card'>
      <h2 className='border-b px-3 py-2 text-[13px] font-medium text-foreground'>Destination</h2>
      <div className='divide-y divide-border'>
        {hasDownload ? (
          <div className='flex min-h-9 items-center gap-2 px-3 py-2 transition-colors hover:bg-accent/50'>
            <Checkbox
              id='download-to-disk'
              checked={shouldDownload}
              disabled={isDestinationFixed}
              onCheckedChange={onDownloadToggle}
            />
            <Label
              htmlFor='download-to-disk'
              className='flex-1 cursor-action rounded-sm text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
            >
              Download to disk
            </Label>
          </div>
        ) : null}

        {hasProject ? (
          <div className='flex min-h-9 items-center gap-2 px-3 py-2 transition-colors hover:bg-accent/50'>
            <Checkbox
              id='save-to-project'
              checked={shouldSaveToProject}
              disabled={isDestinationFixed}
              onCheckedChange={onSaveToggle}
            />
            <Label
              htmlFor='save-to-project'
              className='flex-1 cursor-action rounded-sm text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
            >
              Save to project
            </Label>
          </div>
        ) : null}

        {isZipOffered ? (
          <div className='flex min-h-9 items-center gap-2 px-3 py-2 transition-colors hover:bg-accent/50'>
            <Checkbox id='zip-multiple' checked={isZipChosen} onCheckedChange={onZipToggle} />
            <Label
              htmlFor='zip-multiple'
              className='flex-1 cursor-action rounded-sm text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
            >
              Zip multiple exports
            </Label>
          </div>
        ) : null}

        <div data-slot='export-action-footer' className='p-3'>
          <Button className='w-full whitespace-normal' size='sm' disabled={isExportDisabled} onClick={onExport}>
            <Download />
            <span className='min-w-0 wrap-break-word'>{exportLabel}</span>
          </Button>
          {status ? (
            <p
              role={status.tone === 'error' ? 'alert' : 'status'}
              className={cn('mt-2 text-xs', status.tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}
            >
              {status.message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * Preferences kept for as long as the pane is mounted, for a host that keeps none.
 *
 * @returns The preferences and their writer.
 */
function useMountedExportPreferences(): ExportPreferencesState {
  const [preferences, setPreferences] = useState<ExportPreferences>(defaultExportPreferences);
  return useMemo(() => [preferences, setPreferences, { retry: () => undefined }] as const, [preferences]);
}

/**
 * Props of {@link ExportPane}.
 *
 * @public
 */
export type ExportPaneProps = Readonly<{
  /** Whether the pane is on screen; the selected entry's geometry is claimed only while it is. Defaults to `true`. */
  isShown?: boolean;
}>;

/**
 * The Export pane body, drawn from the host's units and its {@link ExportSource}.
 *
 * @param props - Whether the pane is shown.
 * @returns The pane, or an empty slot when the host offers no export source.
 * @public
 */
export function ExportPane(props: ExportPaneProps = {}): React.JSX.Element {
  const host = useWorkbenchPanesHost();
  const source = host.export;
  return source ? <ExportPaneBody {...props} source={source} /> : <div data-slot='export-pane' />;
}

function ExportPaneBody({ isShown = true, source }: ExportPaneProps & { readonly source: ExportSource }): ReactElement {
  const host = useWorkbenchPanesHost();
  const units = host.useUnits();
  const { claimUnits } = host;
  const EntryIcon = source.FileIcon ?? PlainFileIcon;
  const mainEntryPath = units[0]?.entryPath ?? '';

  const cuEntries = useMemo<GeometryUnitEntry[]>(() => units.map(({ entryPath }) => ({ entryPath })), [units]);

  const [selectedEntryPath, setSelectedEntryPath] = useState(mainEntryPath);

  useEffect(() => {
    queueMicrotask(() => {
      setSelectedEntryPath(mainEntryPath);
    });
  }, [mainEntryPath]);

  useEffect(() => {
    if (!cuEntries.some((entry) => entry.entryPath === selectedEntryPath)) {
      queueMicrotask(() => {
        setSelectedEntryPath(mainEntryPath);
      });
    }
  }, [cuEntries, selectedEntryPath, mainEntryPath]);

  useEffect(() => {
    if (!isShown || !selectedEntryPath) {
      return undefined;
    }
    return claimUnits?.([selectedEntryPath]);
  }, [claimUnits, isShown, selectedEntryPath]);

  const mainGraphics = units[0]?.graphicsRef;
  const lengthDisplaySymbol = useSelector(mainGraphics, (state) => state?.context.displayUnits.length.symbol) ?? 'mm';

  const entryState = source.useEntry(selectedEntryPath);
  const availableFormats = entryState.formats ?? [];

  const usePreferences = source.usePreferences ?? useMountedExportPreferences;
  const [preferences, persistPreferences, preferenceHealth] = usePreferences();
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState<ExportStatus>();

  const { selectedFormats, zipMultiple, formatContent, formatOptions } = preferences;
  const offersDownload = source.destinations.includes('download');
  const offersProject = source.destinations.includes('project');
  const isDestinationFixed = source.destinations.length === 1;
  const shouldDownload = offersDownload && (isDestinationFixed || preferences.shouldDownload);
  const shouldSaveToProject = offersProject && (isDestinationFixed || preferences.shouldSaveToProject);

  const hasDestination = shouldDownload || shouldSaveToProject;

  const notify = useMemo(
    () =>
      source.notices ?? {
        success: (message: string) => {
          setStatus({ tone: 'success', message });
        },
        error: (message: string) => {
          setStatus({ tone: 'error', message });
        },
      },
    [source.notices],
  );

  const handleFormatToggle = useCallback(
    (format: FileExtension) => {
      const previous = preferences.selectedFormats;
      persistPreferences({
        ...preferences,
        selectedFormats: previous.includes(format) ? previous.filter((f) => f !== format) : [...previous, format],
      });
    },
    [preferences, persistPreferences],
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

  const knownFormats = entryState.formats;
  useEffect(() => {
    if (knownFormats === undefined) {
      return;
    }

    let changed = false;
    const nextOptions = { ...formatOptions };
    const nextContent = { ...formatContent };
    const entryOf = (format: string) => knownFormats.find((entry) => entry.format === format);

    for (const [format, options] of Object.entries(formatOptions)) {
      const entry = entryOf(format);
      if (!entry) {
        Reflect.deleteProperty(nextOptions, format);
        changed = true;
        continue;
      }
      const sanitized = sanitizeFormDelta(entry.exportOptions?.schema ?? {}, options);
      if (JSON.stringify(sanitized) !== JSON.stringify(options)) {
        nextOptions[format as FileExtension] = sanitized;
        changed = true;
      }
    }

    for (const [format, content] of Object.entries(formatContent)) {
      const entry = entryOf(format);
      if (!entry?.content) {
        Reflect.deleteProperty(nextContent, format);
        changed = true;
        continue;
      }
      const sanitized = runtimeContentFromRecord(sanitizeFormDelta(entry.content.schema, { ...content }));
      if (JSON.stringify(sanitized) !== JSON.stringify(content)) {
        nextContent[format as FileExtension] = sanitized;
        changed = true;
      }
    }

    if (changed) {
      persistPreferences({
        ...preferences,
        formatContent: nextContent,
        formatOptions: nextOptions,
      });
    }
  }, [formatContent, formatOptions, knownFormats, persistPreferences, preferences]);

  const handleDownloadToggle = useCallback(
    (checked: boolean | 'indeterminate') => {
      persistPreferences({ ...preferences, shouldDownload: checked === true });
    },
    [preferences, persistPreferences],
  );

  const handleSaveToggle = useCallback(
    (checked: boolean | 'indeterminate') => {
      persistPreferences({
        ...preferences,
        shouldSaveToProject: checked === true,
      });
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
    if (selectedFormats.length === 0 || !hasDestination) {
      return;
    }
    setIsExporting(true);
    setStatus(undefined);
    try {
      const { succeeded, failed } = await source.export({
        entryPath: selectedEntryPath,
        formats: selectedFormats,
        formatOptions,
        formatContent,
        download: shouldDownload,
        saveToProject: shouldSaveToProject,
        zipMultiple: shouldDownload && zipMultiple && source.canZip === true,
      });
      const label = (formats: readonly FileExtension[]) => formats.map((f) => f.toUpperCase()).join(', ');
      if (succeeded.length > 0) {
        notify.success(`Exported ${label(succeeded)}`);
      }
      if (failed.length > 0) {
        notify.error(`Failed to export ${label(failed)}`);
      }
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [
    formatContent,
    formatOptions,
    hasDestination,
    notify,
    selectedEntryPath,
    selectedFormats,
    shouldDownload,
    shouldSaveToProject,
    source,
    zipMultiple,
  ]);

  const formatsWithSchemas = useMemo(
    () =>
      selectedFormats.flatMap((format) => {
        const entry = availableFormats.find((candidate) => candidate.format === format);
        return entry && (entry.content !== undefined || entry.exportOptions !== undefined) ? [entry] : [];
      }),
    [availableFormats, selectedFormats],
  );

  return (
    <div data-slot='export-panel-body' className='flex size-full min-h-0 flex-col overflow-hidden bg-sidebar'>
      {preferenceHealth.error ? (
        <div
          role='alert'
          aria-label='Export settings unavailable'
          className='flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 text-xs'
        >
          <span>{preferenceHealth.error}</span>
          <Button variant='ghost' size='sm' aria-label='Retry export settings' onClick={preferenceHealth.retry}>
            Retry
          </Button>
        </div>
      ) : null}
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
                FileIcon={EntryIcon}
                onSelect={setSelectedEntryPath}
              />
            </div>
          </section>

          {entryState.hasGeometry ? (
            availableFormats.length > 0 ? (
              <>
                <section aria-label='Formats' className='overflow-hidden rounded-xl border border-border bg-card'>
                  <h2 className='border-b px-3 py-2 text-[13px] font-medium text-foreground'>Formats</h2>
                  <div className='p-3'>
                    <FormatGrid
                      formats={availableFormats}
                      selectedFormats={selectedFormats}
                      FileIcon={EntryIcon}
                      onToggle={handleFormatToggle}
                    />

                    {formatsWithSchemas.length > 0 ? (
                      <div className='mt-3 flex flex-col gap-2'>
                        {formatsWithSchemas.map((entry) => (
                          <ExportFormatSettings
                            key={entry.format}
                            entry={entry}
                            formatContent={formatContent[entry.format] ?? {}}
                            formatOptions={formatOptions[entry.format] ?? {}}
                            optionStore={source.optionStore}
                            lengthDisplaySymbol={lengthDisplaySymbol}
                            FileIcon={EntryIcon}
                            onError={source.notices?.error}
                            onContentChange={handleContentChange}
                            onOptionsChange={handleOptionsChange}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>

                <DestinationSection
                  hasDownload={offersDownload}
                  hasProject={offersProject}
                  isDestinationFixed={isDestinationFixed}
                  shouldDownload={shouldDownload}
                  shouldSaveToProject={shouldSaveToProject}
                  isZipOffered={source.canZip === true && shouldDownload && selectedFormats.length > 1}
                  isZipChosen={zipMultiple}
                  isExportDisabled={selectedFormats.length === 0 || isExporting || !hasDestination}
                  exportLabel={formatButtonLabel(selectedFormats, isExporting, hasDestination)}
                  status={status}
                  onDownloadToggle={handleDownloadToggle}
                  onSaveToggle={handleSaveToggle}
                  onZipToggle={handleZipToggle}
                  onExport={handleExport}
                />
              </>
            ) : (
              <PanelEmptyState
                icon={Info}
                title='Export formats are still loading'
                description={
                  <>
                    Formats for {selectedEntryPath === '' ? 'this file' : selectedEntryPath} will appear when its kernel
                    is ready.
                  </>
                }
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
                <>
                  Generate or compute geometry for {selectedEntryPath === '' ? 'this file' : selectedEntryPath} to
                  enable export options.
                </>
              }
              className='m-0 h-auto min-h-40 flex-1 rounded-xl border bg-card'
            />
          )}
        </div>
      </div>
    </div>
  );
}
