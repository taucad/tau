import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Download, Check, ChevronDown, ArrowUpRight } from 'lucide-react';
import { deriveExportFormatOptions } from '#routes/_index/hero-viewer.utils.js';
import type { ExportFormatOption } from '#routes/_index/hero-viewer.utils.js';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import { ModelViewer, RuntimeStatusOverlay } from '#components/model-viewer.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useProjectCreationLocationError } from '#hooks/use-project-creation-location-error.js';
import { useRuntime } from '@taucad/react';
import { parameterEntryPath } from '@taucad/types';
import type { Geometry } from '@taucad/types';
import { Button } from '#components/ui/button.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { toast } from '#components/ui/sonner.js';
import { encodeTextFile } from '#utils/filesystem.utils.js';
import { Loader } from '#components/ui/loader.js';
import type { Units } from '#components/geometry/parameters/rjsf-context.js';
import { downloadExportArtifactSet } from '#utils/export-artifact-set.utils.js';
import { createParameterEntry, serializeParameterEntry } from '#utils/parameter-config.utils.js';
import { projectUrl } from '#utils/project-url.utils.js';

type UseRuntimeOptions = Parameters<typeof useRuntime>[0];

/**
 * Configuration for a single live kernel demo (gear, QR, …). Wraps the shared
 * runtime-backed viewer + parameter panel + export + "Continue in Editor" flow
 * so each demo is just a runtime + source + copy.
 */
export type KernelDemoConfig = {
  /** In-process runtime client options (kernel, transport, middleware). */
  readonly clientOptions: UseRuntimeOptions['clientOptions'];
  /** Source files keyed by filename. */
  readonly files: Record<string, string>;
  /** Entry filename (e.g. `main.js`, `main.scad`). */
  readonly mainFile: string;
  /** Display units for the parameter panel. */
  readonly units: Units;
  /** Export filename stem (e.g. `gear`, `qrcode`). */
  readonly exportName: string;
  /** Expand the parameter panel on first paint. */
  readonly isInitialExpanded?: boolean;
  /** Project metadata used when forking into a real project. */
  readonly project: {
    readonly name: string;
    readonly description: string;
    readonly tags: readonly string[];
    readonly forkedFrom: string;
  };
  /** Optional live verification overlay, given the current geometry. */
  readonly renderVerification?: (geometry: Geometry | undefined) => React.ReactNode;
  /** Optional note under the viewer (e.g. the QR scan hint). */
  readonly note?: string;
};

export function KernelDemo({
  clientOptions,
  files,
  mainFile,
  units,
  exportName,
  isInitialExpanded = false,
  project,
  renderVerification,
  note,
}: KernelDemoConfig): React.JSX.Element {
  const navigate = useNavigate();
  const projectManager = useProjectManager();
  const presentLocationError = useProjectCreationLocationError();

  const [currentParams, setCurrentParams] = useState<Record<string, unknown>>({});
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { geometry, status, defaultParameters, jsonSchema, exportGeometry, capabilities, setParameters } = useRuntime({
    clientOptions,
    // `files` is a wide `Record<string, string>`, so the runtime needs an
    // explicit entry point (it can't infer a single literal key).
    source: { files, entry: mainFile },
  });

  const hasParameters = Boolean(jsonSchema);

  type DemoExportFormatOption = ExportFormatOption;

  const exportFormatOptions = useMemo(() => deriveExportFormatOptions(capabilities), [capabilities]);

  const [selectedFormat, setSelectedFormat] = useState<DemoExportFormatOption | undefined>();
  const activeFormat = selectedFormat ?? exportFormatOptions[0];
  const canExport = status === 'ready' && Boolean(activeFormat);

  const handleParametersChange = useCallback(
    (newParameters: Record<string, unknown>) => {
      setCurrentParams(newParameters);
      setParameters({ ...defaultParameters, ...newParameters });
    },
    [defaultParameters, setParameters],
  );

  const handleExport = useCallback(() => {
    if (!activeFormat || isExporting) {
      return;
    }
    setIsExporting(true);

    // oxlint-disable-next-line tau-lint/no-async-iife -- export is async.
    void (async () => {
      try {
        const result = await exportGeometry(activeFormat.format);
        if (result.success) {
          const filename = `${exportName}.${activeFormat.format}`;
          await downloadExportArtifactSet(result.data, {
            singleFileName: filename,
            archiveName: `${exportName}-${activeFormat.format}.zip`,
          });
          toast.success(`Downloaded ${filename}`);
        } else {
          const message = result.issues[0]?.message ?? 'Export failed';
          toast.error(`Failed to export: ${message}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Export failed';
        toast.error(`Failed to export: ${message}`);
      } finally {
        setIsExporting(false);
      }
    })();
  }, [activeFormat, isExporting, exportGeometry, exportName]);

  const handleFormatSelect = useCallback(
    (value: string) => {
      const option = exportFormatOptions.find((o) => o.format === value);
      if (option) {
        setSelectedFormat(option);
      }
    },
    [exportFormatOptions],
  );

  const handleContinueInEditor = useCallback(async () => {
    if (isCreatingProject) {
      return;
    }

    setIsCreatingProject(true);

    try {
      const createProject = await projectManager.createProject({
        project: {
          name: project.name,
          description: project.description,
          tags: [...project.tags],
          assets: { main: { entryPath: mainFile } },
        },
        files: {
          [mainFile]: { content: encodeTextFile(files[mainFile] ?? '') },
          [parameterEntryPath(mainFile)]: {
            content: encodeTextFile(serializeParameterEntry(createParameterEntry(currentParams))),
          },
        },
      });

      await navigate(projectUrl(createProject.slugs));
    } catch (error) {
      console.error('Failed to create project:', error);
      if (!presentLocationError(error)) {
        toast.error('Failed to create project');
      }
      setIsCreatingProject(false);
    }
  }, [isCreatingProject, currentParams, projectManager, navigate, project, mainFile, files, presentLocationError]);

  return (
    <div className='flex flex-col overflow-hidden rounded-xl border bg-sidebar md:h-[560px] md:flex-row'>
      <div className='relative h-[300px] md:h-full md:flex-1'>
        <RuntimeStatusOverlay status={status} className='top-auto right-4 bottom-4' />

        <Button
          variant='outline'
          size='sm'
          className='absolute top-2 right-2 z-10 gap-1.5 bg-background/80 backdrop-blur-sm'
          disabled={isCreatingProject}
          onClick={handleContinueInEditor}
        >
          <span>Continue in Editor</span>
          {isCreatingProject ? <Loader className='size-4' /> : <ArrowUpRight className='size-4' />}
        </Button>

        {renderVerification ? (
          <div className='absolute top-2 left-2 z-10 flex flex-col gap-1.5'>{renderVerification(geometry)}</div>
        ) : null}

        <ModelViewer geometry={geometry} enablePan graphicsOptions={{ enableGrid: true, enableAxes: true }} />

        {note ? (
          <p className='absolute right-0 bottom-2 left-0 text-center text-xs text-muted-foreground'>{note}</p>
        ) : null}
      </div>

      {hasParameters ? (
        <div className='border-t bg-background md:w-80 md:border-t-0 md:border-l'>
          <div className='flex h-full flex-col'>
            <div className='border-b p-3'>
              <h3 className='text-sm font-semibold'>Parameters</h3>
              <p className='text-xs text-muted-foreground'>Adjust and watch it rebuild</p>
            </div>
            <div className='h-[280px] overflow-hidden md:h-auto md:flex-1'>
              <Parameters
                isInitialExpanded={isInitialExpanded}
                parameters={currentParams}
                defaultParameters={defaultParameters}
                jsonSchema={jsonSchema}
                units={units}
                emptyDescription='Loading parameters...'
                onParametersChange={handleParametersChange}
              />
            </div>
            <div className='border-t p-3'>
              <div className='flex items-center gap-2'>
                {exportFormatOptions.length > 0 && activeFormat ? (
                  <>
                    <ComboBoxResponsive
                      searchPlaceHolder='Search formats...'
                      title='Export Format'
                      description='Select a format to export the model'
                      groupedItems={[{ name: 'Formats', items: exportFormatOptions }]}
                      value={activeFormat}
                      getValue={(item) => item.format}
                      renderLabel={(item, selected) => (
                        <span className='flex w-full items-center justify-between'>
                          <span className='flex items-center gap-2'>
                            <FileExtensionIcon filename={`file.${item.format}`} className='size-4' />
                            <span>{item.label}</span>
                          </span>
                          {selected?.format === item.format ? <Check className='size-4' /> : null}
                        </span>
                      )}
                      className='min-w-0 flex-1'
                      isSearchEnabled={false}
                      onSelect={handleFormatSelect}
                    >
                      <Button variant='outline' size='sm' className='min-w-0 grow justify-start gap-2'>
                        <FileExtensionIcon filename={`file.${activeFormat.format}`} className='size-4 shrink-0' />
                        <span className='truncate'>{activeFormat.label}</span>
                        <ChevronDown className='ml-auto size-3 shrink-0 opacity-50' />
                      </Button>
                    </ComboBoxResponsive>
                    <Button
                      size='sm'
                      className='shrink-0'
                      disabled={!canExport || isExporting}
                      title={canExport ? `Download as ${activeFormat.label}` : 'Model not ready'}
                      onClick={handleExport}
                    >
                      {isExporting ? <Loader className='size-4' /> : <Download className='size-4' />}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
