import { useProjectAvailability } from '#hooks/use-project-availability.js';
import { ProjectSyncPlaceholder } from '#routes/w.$workspace.$project/project-sync-placeholder.js';
import { z } from 'zod';
import { fileExtensions } from '@taucad/types/constants';
import { runtimeContentSchema } from '@taucad/runtime';
import { fileContentBytes } from '@taucad/fs-client/file-content-service';
import { ObservationService } from '@taucad/fs-client/observation-service';
import { useObservation } from '@taucad/fs-client/react/use-observation';
import { XIcon } from 'lucide-react';
import { useCallback, memo, useState, useMemo, useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { useSelector } from '@xstate/react';
import type { ExportFile, FileExtension } from '@taucad/types';
import { getActiveGroupValues } from '@taucad/types';
import { randomUuid } from '@taucad/utils/id';
import { compileExportConfigurationManifest } from '#components/machines/configuration-manifest.js';
import type { ParameterManifest } from '@taucad/parameters';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
} from '#components/ui/floating-panel.js';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { useProject } from '#hooks/use-project.js';
import { toast } from '#components/ui/sonner.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { awaitFreshRender } from '#machines/await-fresh-render.js';
import { selectCadFailureIssues } from '#machines/cad.machine.js';
import {
  bestRouteForActiveKernel,
  deriveAvailableFormats,
  exportDocumentWithValidatedInput,
} from '#utils/export-formats.utils.js';
import type { AppRuntimeExportRoute } from '#utils/export-formats.utils.js';
import { ExportPane, ExportSchemaForm as SharedExportSchemaForm } from '@taucad/workbench-panes/export/export-pane';
import type { ExportSchemaFormProps } from '@taucad/workbench-panes/export/export-pane';
import {
  defaultExportPreferences,
  runtimeContentFromRecord,
  sanitizeFormDelta,
} from '@taucad/workbench-panes/export/export-source';
import type {
  ExportEntryState,
  ExportFormatEntry,
  ExportOptionStore,
  ExportOutcome,
  ExportPreferences,
  ExportRequest,
  ExportSchema,
  ExportSource,
} from '@taucad/workbench-panes/export/export-source';
import type { ParameterCommit } from '@taucad/viewer/parameters/rjsf-context';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';
import { createExportArtifactZip, downloadExportArtifactSet } from '#utils/export-artifact-set.utils.js';
import { downloadBlob } from '@taucad/utils/file';
import { projectWorkspaceKeyCombinations } from '#routes/w.$workspace.$project/project-workspace-context.js';
import type { ParameterSetService } from '#services/parameter-set-service.js';
import { ProjectWorkbenchPanesHost } from '#routes/w.$workspace.$project/workbench-panes-host.js';

const toggleConverterKeyCombination = projectWorkspaceKeyCombinations.export;

const preferencesPath = '.tau/export/preferences.json';

const defaultPreferences: ExportPreferences = defaultExportPreferences;

// =============================================================================
// Provider configuration records
// =============================================================================

type ConfigurationParameterOwner = Readonly<{
  parameterService: ParameterSetService;
}>;

async function resolveExportConfigurationValues(
  input: Readonly<{
    parameterService: ParameterSetService;
    provider: string;
    configuration: string;
    resolved: ExportSchema;
    legacyValues: Record<string, unknown>;
    signal?: AbortSignal;
  }>,
): Promise<
  Readonly<{
    entryPath: string;
    manifest: ParameterManifest;
    target: ReturnType<ParameterSetService['target']>;
    values: Record<string, unknown>;
  }>
> {
  const { parameterService, provider, configuration, resolved, legacyValues, signal } = input;
  signal?.throwIfAborted();
  const compiled = await compileExportConfigurationManifest(provider, configuration, resolved);
  const admittedLegacyValues = sanitizeFormDelta(resolved.schema, legacyValues);
  signal?.throwIfAborted();
  const target = parameterService.target(compiled.entryPath, 'provider-configuration');
  const existing = await parameterService.readSettled(compiled.entryPath);
  signal?.throwIfAborted();
  let snapshot = await parameterService.resolveTarget(target, compiled.manifest);
  signal?.throwIfAborted();
  if (existing === undefined && Object.keys(admittedLegacyValues).length > 0) {
    try {
      await parameterService.replaceTargetValues(target, compiled.manifest, {
        values: admittedLegacyValues,
        expected: snapshot.identity,
      });
      snapshot =
        parameterService.snapshot(compiled.entryPath) ??
        (await parameterService.resolveTarget(target, compiled.manifest));
    } catch (error) {
      if (typeof error !== 'object' || error === null || Reflect.get(error, 'code') !== 'STALE_MANIFEST') {
        throw error;
      }
      snapshot = await parameterService.resolveTarget(target, compiled.manifest);
    }
  }
  const entry = parameterService.snapshot(compiled.entryPath)?.entry ?? snapshot.entry;
  return {
    ...compiled,
    target,
    values: { ...getActiveGroupValues(entry) },
  };
}

/**
 * The export option records the project's parameter service keeps under `provider-configuration/`.
 *
 * @param parameterService - The project's parameter service.
 * @returns The option store the shared Export pane binds its forms to.
 */
export function createParameterOptionStore(parameterService: ParameterSetService): ExportOptionStore {
  return {
    async open({ provider, configuration, resolved, legacyValues, signal }) {
      const compiled = await resolveExportConfigurationValues({
        parameterService,
        provider,
        configuration,
        resolved,
        legacyValues,
        signal,
      });
      const { entryPath, manifest, target } = compiled;
      const group = (): string => parameterService.snapshot(entryPath)?.entry.activeGroup ?? 'default';
      const commit: ParameterCommit = {
        target,
        group: group(),
        draft: (pointer) => parameterService.draft({ target, group: group(), pointer }),
        setDraft: (pointer, draft) => {
          parameterService.setDraft({ target, group: group(), pointer }, draft);
        },
        subscribeDrafts: parameterService.subscribeDrafts,
        commit: async (field) =>
          parameterService.commitValue(target, manifest, {
            group: group(),
            ...field,
          }),
        setValue: async (field) =>
          parameterService.submitValue(target, manifest, {
            group: group(),
            ...field,
          }),
      };
      return {
        manifest,
        commit,
        subscribe: (listener) => {
          const subscription = parameterService.actor(entryPath)?.subscribe(listener);
          return () => {
            subscription?.unsubscribe();
          };
        },
        getEntry: () =>
          parameterService.snapshot(entryPath) === undefined
            ? undefined
            : parameterService.actor(entryPath)?.getSnapshot().context.current?.entry,
        replaceValues: async (values) => {
          await parameterService.replaceTargetValues(target, manifest, {
            values,
          });
        },
      };
    },
  };
}

const reportError = (message: string): void => {
  toast.error(message);
};

/**
 * The shared export option form bound to the project's provider configuration records.
 *
 * @param props - The shared form's props, with the parameter owner its values are kept by.
 * @returns The form.
 */
export function ExportSchemaForm({
  parameterOwner,
  ...props
}: Omit<ExportSchemaFormProps, 'optionStore' | 'onError'> & {
  readonly parameterOwner: ConfigurationParameterOwner;
}): ReactElement {
  const { parameterService } = parameterOwner;
  const optionStore = useMemo(() => createParameterOptionStore(parameterService), [parameterService]);
  return <SharedExportSchemaForm {...props} optionStore={optionStore} onError={reportError} />;
}

// =============================================================================
// Formats and export
// =============================================================================

function routeProvider(route: AppRuntimeExportRoute): string {
  return route.transcoderId === undefined
    ? String(route.kernelId)
    : `${String(route.kernelId)}+${String(route.transcoderId)}`;
}

function routeSchema(capability: { schema: ExportSchema['schema']; defaults: unknown }): ExportSchema {
  return {
    schema: capability.schema,
    defaults:
      typeof capability.defaults === 'object' && capability.defaults !== null && !Array.isArray(capability.defaults)
        ? (capability.defaults as Record<string, unknown>)
        : {},
  };
}

/**
 * The active kernel's export formats with their option schemas.
 *
 * @param client - The entry's runtime client.
 * @param activeKernelId - The kernel the entry runs on.
 * @returns One entry per format, each reduced to its best route.
 */
export function deriveExportFormatEntries(client: AppRuntimeClient, activeKernelId: string): ExportFormatEntry[] {
  return deriveAvailableFormats(client, activeKernelId).flatMap(({ format, fidelity, direct }) => {
    const route = bestRouteForActiveKernel(client, format, activeKernelId);
    if (!route || route.kernelId !== activeKernelId) {
      return [];
    }
    return [
      {
        format,
        fidelity,
        direct,
        provider: routeProvider(route),
        ...(route.content ? { content: routeSchema(route.content) } : {}),
        ...(Object.keys(route.exportOptions.schema).length > 0
          ? { exportOptions: routeSchema(route.exportOptions) }
          : {}),
      },
    ];
  });
}

function useProjectExportEntry(entryPath: string): ExportEntryState {
  const { geometryUnits } = useProject();
  const selectedActor = geometryUnits.get(entryPath);
  const rendering = useSelector(selectedActor, (state) => state?.context.rendering);
  const evaluation = useSelector(selectedActor, (state) => state?.context.evaluation);
  const latestRenderingOutcome = useSelector(selectedActor, (state) => state?.context.latestRenderingOutcome);
  const hasGeometry =
    rendering?.success === true ||
    (latestRenderingOutcome === 'success' && evaluation?.success === true && evaluation.views.length === 0);
  const capabilities = useSelector(selectedActor, (state) => state?.context.capabilities);
  const activeKernelId = useSelector(selectedActor, (state) => state?.context.activeKernelId);
  const kernelClient = useSelector(selectedActor, (state) => state?.context.kernelClient);
  const formats = useMemo(
    () =>
      kernelClient && activeKernelId && capabilities !== undefined
        ? deriveExportFormatEntries(kernelClient, activeKernelId)
        : undefined,
    // Capabilities is included so format list refreshes whenever the manifest mutates
    [kernelClient, activeKernelId, capabilities],
  );
  return useMemo(() => ({ hasGeometry, formats }), [formats, hasGeometry]);
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

// =============================================================================
// Preference persistence
// =============================================================================

const exportPreferencesSchema = z.object({
  formatContent: z.partialRecord(z.enum(fileExtensions), runtimeContentSchema).optional(),
  formatOptions: z.partialRecord(z.enum(fileExtensions), z.record(z.string(), z.unknown())).optional(),
  selectedFormats: z.array(z.enum(fileExtensions)).optional(),
  shouldDownload: z.boolean().optional(),
  shouldSaveToProject: z.boolean().optional(),
  zipMultiple: z.boolean().optional(),
});

export function useExportPreferences(
  fileManager: ReturnType<typeof useFileManager>,
): readonly [ExportPreferences, (next: ExportPreferences) => void, { readonly error?: string; retry(): void }] {
  const { contentService, writeFiles } = fileManager;
  const service = useMemo(
    () =>
      contentService
        ? new ObservationService<ExportPreferences>({
            resource: preferencesPath,
            read: async (read) => {
              const result = await read.observe(contentService.observeContent(preferencesPath));
              return result.kind === 'orphaned'
                ? defaultPreferences
                : {
                    ...defaultPreferences,
                    ...exportPreferencesSchema.parse(
                      JSON.parse(new TextDecoder().decode(fileContentBytes({ path: preferencesPath, result }))),
                    ),
                  };
            },
            equal: (previous, next) => JSON.stringify(previous) === JSON.stringify(next),
          })
        : undefined,
    [contentService],
  );
  const snapshot = useObservation(service);
  const activeSource = useRef(service);
  useEffect(() => {
    activeSource.current = service;
    return () => {
      if (activeSource.current === service) {
        activeSource.current = undefined;
      }
    };
  }, [service]);
  const [local, setLocal] = useState<{
    service: ObservationService<ExportPreferences>;
    patch: Partial<ExportPreferences>;
  }>();
  const patch = local?.service === service ? local?.patch : undefined;
  const preferences = useMemo(() => ({ ...(snapshot.value ?? defaultPreferences), ...patch }), [snapshot.value, patch]);

  const [write, setWrite] = useState<{
    local: NonNullable<typeof local>;
    phase: 'pending' | 'saved' | 'failed';
    error?: string;
  }>();
  const retry = useCallback(() => {
    if (!service || activeSource.current !== service) {
      return;
    }
    service.refresh();
    setWrite((current) => (current?.local.service === service && current.phase === 'failed' ? undefined : current));
  }, [service]);
  useEffect(() => {
    if (!service || !local || local.service !== service || snapshot.status !== 'ready') {
      return undefined;
    }
    if (write?.local.service === service) {
      if (write.phase === 'pending') {
        return undefined;
      }
      if (write.local === local) {
        if (
          write.phase === 'saved' &&
          snapshot.value &&
          Object.entries(local.patch).every(
            ([key, value]) =>
              JSON.stringify(snapshot.value?.[key as keyof ExportPreferences]) === JSON.stringify(value),
          )
        ) {
          queueMicrotask(() => {
            setLocal((current) => (current === local ? undefined : current));
          });
        }
        return undefined;
      }
    }
    const captured = local;
    const timer = setTimeout(() => {
      setWrite({ local: captured, phase: 'pending' });
      const persist = async (): Promise<void> => {
        try {
          await writeFiles({
            [preferencesPath]: {
              content: new TextEncoder().encode(JSON.stringify(preferences, null, 2)),
            },
          });
          if (activeSource.current !== service) {
            return;
          }
          setWrite((current) => (current?.local === captured ? { local: captured, phase: 'saved' } : current));
          service.refresh();
        } catch (error) {
          if (activeSource.current !== service) {
            return;
          }
          setWrite((current) =>
            current?.local === captured
              ? {
                  local: captured,
                  phase: 'failed',
                  error: error instanceof Error ? error.message : 'Export preferences could not be saved.',
                }
              : current,
          );
        }
      };
      void persist();
    }, 100);
    return () => {
      clearTimeout(timer);
    };
  }, [local, preferences, service, snapshot.status, snapshot.value, write, writeFiles]);

  const persistPreferences = useCallback(
    (next: ExportPreferences) => {
      if (!service) {
        return;
      }
      const patch: Partial<ExportPreferences> = {};
      for (const key of [
        'formatContent',
        'formatOptions',
        'selectedFormats',
        'shouldDownload',
        'shouldSaveToProject',
        'zipMultiple',
      ] as const) {
        if (JSON.stringify(next[key]) !== JSON.stringify(preferences[key])) {
          Object.assign(patch, { [key]: next[key] });
        }
      }
      setLocal((current) => ({
        service,
        patch: {
          ...(current?.service === service ? current.patch : {}),
          ...patch,
        },
      }));
    },
    [preferences, service],
  );
  const error =
    snapshot.error ?? (write?.phase === 'failed' && write.local.service === service ? write.error : undefined);
  useEffect(() => {
    if (error) {
      toast.error(error, {
        action: {
          label: 'Retry',
          onClick: retry,
        },
      });
    }
  }, [error, retry]);
  return [
    preferences,
    persistPreferences,
    {
      error: error
        ? snapshot.error
          ? 'Export settings could not be loaded.'
          : 'Export settings could not be saved.'
        : undefined,
      retry,
    },
  ] as const;
}

// =============================================================================
// Main component
// =============================================================================

const exportNotices = {
  success: (message: string) => {
    toast.success(message);
  },
  error: reportError,
};

function useProjectExportPreferences(): ReturnType<typeof useExportPreferences> {
  return useExportPreferences(useFileManager());
}

/**
 * The Export pane's source over the project: formats from each entry's active kernel, exports run in the browser
 * against a fresh render, files downloaded or written to the project's `exports/`.
 *
 * @param input - Whether this profile may only download.
 * @returns The source.
 */
function useProjectExportSource({ downloadOnly }: { readonly downloadOnly: boolean }): ExportSource {
  const { geometryUnits, parameterService, projectRef, entriesRecord } = useProject();
  const fileManager = useFileManager();
  const projectName = useSelector(projectRef, (state) => state.context.project?.name) ?? 'model';
  const optionStore = useMemo(() => createParameterOptionStore(parameterService), [parameterService]);

  const exportEntry = useCallback(
    async (request: ExportRequest): Promise<ExportOutcome> => {
      const { entryPath, formats, formatOptions, formatContent, download, saveToProject, zipMultiple } = request;
      const selectedActor = geometryUnits.get(entryPath);
      if (!selectedActor?.getSnapshot().context.kernelClient) {
        return { succeeded: [], failed: [] };
      }

      const claimId = randomUuid();
      projectRef.send({
        type: 'claimGeometryUnit',
        claimId,
        entryPath,
        operationTimeout: entriesRecord?.entries[entryPath]?.renderTimeout,
      });

      const succeeded: FileExtension[] = [];
      const failed: FileExtension[] = [];
      const downloadQueue: DownloadEntry[] = [];

      try {
        const settled = await awaitFreshRender(selectedActor);
        const failedIssues = selectCadFailureIssues(settled);
        if (failedIssues) {
          throw new Error(failedIssues.map((issue) => issue.message).join('; ') || 'The selected CAD render failed');
        }
        if (settled.context.latestRenderingOutcome !== 'success') {
          throw new Error(`No current successful geometry is available for ${entryPath}`);
        }
        const freshKernelClient = settled.context.kernelClient;
        const freshDocument = settled.context.document;
        const freshKernelId = settled.context.activeKernelId;
        if (!freshKernelClient || !freshDocument) {
          throw new Error('The selected CAD runtime is unavailable');
        }
        /* oxlint-disable no-await-in-loop -- Sequential: each export depends on shared kernel state */
        for (const format of formats) {
          try {
            const route = bestRouteForActiveKernel(freshKernelClient, format, freshKernelId);
            if (!route || route.kernelId !== freshKernelId) {
              failed.push(format);
              continue;
            }

            const provider = routeProvider(route);
            const optionsResolved =
              Object.keys(route.exportOptions.schema).length === 0
                ? undefined
                : await resolveExportConfigurationValues({
                    parameterService,
                    provider,
                    configuration: `export/${format}/options`,
                    resolved: routeSchema(route.exportOptions),
                    legacyValues: sanitizeFormDelta(route.exportOptions.schema, formatOptions[format] ?? {}),
                  });
            const contentResolved = route.content
              ? await resolveExportConfigurationValues({
                  parameterService,
                  provider,
                  configuration: `export/${format}/content`,
                  resolved: routeSchema(route.content),
                  legacyValues: sanitizeFormDelta(route.content.schema, {
                    ...formatContent[format],
                  }),
                })
              : undefined;
            const options = sanitizeFormDelta(
              route.exportOptions.schema,
              optionsResolved?.values ?? formatOptions[format] ?? {},
            );
            const content = contentResolved
              ? runtimeContentFromRecord(sanitizeFormDelta(route.content!.schema, contentResolved.values))
              : undefined;
            const result = await exportDocumentWithValidatedInput(freshDocument, route, {
              ...(content && Object.keys(content).length > 0 ? { content } : {}),
              options,
            });

            if (!result.success) {
              failed.push(format);
              continue;
            }

            const files = [...result.files];

            if (download) {
              downloadQueue.push({ format, files });
            }

            if (saveToProject) {
              const prefix = formats.length === 1 ? 'exports' : `exports/${format}`;
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

        if (download) {
          await downloadExports(downloadQueue, { zipMultiple, projectName });
        }
        return { succeeded, failed };
      } finally {
        projectRef.send({ type: 'releaseGeometryUnit', claimId });
      }
    },
    [entriesRecord, fileManager, geometryUnits, parameterService, projectName, projectRef],
  );

  return useMemo(
    (): ExportSource => ({
      useEntry: useProjectExportEntry,
      export: exportEntry,
      destinations: downloadOnly ? ['download'] : ['download', 'project'],
      canZip: true,
      usePreferences: useProjectExportPreferences,
      optionStore,
      notices: exportNotices,
      FileIcon: FileExtensionIcon,
    }),
    [downloadOnly, exportEntry, optionStore],
  );
}

/** Exporters mount only after the first project checkout is reconciled. */
export function ConverterPanelBody(
  props: { readonly downloadOnly?: boolean; readonly isShown?: boolean } = {},
): ReactElement {
  const availability = useProjectAvailability();
  return availability === 'ready' ? (
    <ConverterPanelBodyContent {...props} />
  ) : (
    <ProjectSyncPlaceholder state={availability} />
  );
}

function ConverterPanelBodyContent({
  downloadOnly = false,
  isShown = true,
}: {
  readonly downloadOnly?: boolean;
  readonly isShown?: boolean;
} = {}): ReactElement {
  const source = useProjectExportSource({ downloadOnly });
  const sources = useMemo(() => ({ export: source }), [source]);
  return (
    <ProjectWorkbenchPanesHost sources={sources}>
      <ExportPane isShown={isShown} />
    </ProjectWorkbenchPanesHost>
  );
}

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
          <ConverterPanelBody isShown={isExpanded} />
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
});
