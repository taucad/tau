import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSelector } from '@xstate/react';
import { fromPromise } from 'xstate';
import { Loader2, Download, Check, ChevronDown, ArrowUpRight } from 'lucide-react';
import { exportFromGlb } from '@taucad/converter';
import type { OutputFormat } from '@taucad/converter';
import type { Build } from '@taucad/types';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import { BuildProvider, useBuild } from '#hooks/use-build.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useBuildManager } from '#hooks/use-build-manager.js';
import { useChatManager } from '#hooks/use-chat-manager.js';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { HammerAnimation } from '#components/hammer-animation.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { toast } from '#components/ui/sonner.js';
import { downloadBlob } from '#utils/file.utils.js';
import qrcodeScad from '#routes/_index/qrcode.scad?raw';
import { encodeTextFile } from '#utils/filesystem.utils.js';

const heroBuildId = 'hero-qrcode-v2';

type Files = Record<string, { content: Uint8Array }>;
type HeroBuild = Build & { files: Files };

function createHeroBuild(fileContent: Uint8Array): HeroBuild {
  const mainFile = 'main.scad';
  return {
    id: heroBuildId,
    assets: {
      mechanical: {
        main: mainFile,
        parameters: {},
      },
    },
    name: 'QR Code Generator',
    description: 'A parametric QR code generator built with OpenSCAD',
    author: {
      name: 'Community',
      avatar: '/avatar-sample.png',
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ['openscad', 'parametric', 'qr-code'],
    stars: 0,
    forks: 0,
    thumbnail: '/tau-desktop.jpg',
    files: { [mainFile]: { content: fileContent } },
  };
}

function ViewerStatus({ className, ...properties }: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
  const { cadRef } = useBuild();
  const state = useSelector(cadRef, (snapshot) => snapshot.value);

  return ['buffering', 'rendering', 'booting', 'initializing'].includes(state) ? (
    <div
      {...properties}
      className={cn(
        'absolute top-4 left-4 z-10 flex items-center gap-2 rounded-md border bg-background/70 px-2 py-1 backdrop-blur-sm',
        className,
      )}
    >
      <span className="font-mono text-sm text-muted-foreground capitalize">{state}...</span>
      <Loader2 className="size-4 animate-spin text-primary" />
    </div>
  ) : null;
}

type HeroViewerContentProperties = {
  readonly files: Files;
};

type ExportFormatOption = {
  format: OutputFormat;
  label: string;
};

const exportFormatOptions: ExportFormatOption[] = [
  { format: 'stl', label: 'STL' },
  { format: 'step', label: 'STEP' },
  { format: 'obj', label: 'OBJ' },
  { format: 'gltf', label: 'GLTF' },
  { format: 'glb', label: 'GLB' },
  { format: 'dae', label: 'DAE' },
  { format: 'fbx', label: 'FBX' },
  { format: 'ply', label: 'PLY' },
];

function HeroViewerContent({ files }: HeroViewerContentProperties): React.JSX.Element {
  const navigate = useNavigate();
  const { cadRef, buildRef, graphicsRef } = useBuild();
  // Use the root FileManagerProvider (same pattern as project-grid.tsx)
  const { writeFiles } = useFileManager();
  const buildManager = useBuildManager();
  const chatManager = useChatManager();

  const [hasLoadedModel, setHasLoadedModel] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormatOption>(exportFormatOptions[0]!);
  const [isCreatingBuild, setIsCreatingBuild] = useState(false);
  const hasWrittenFilesRef = useRef(false);

  const geometries = useSelector(cadRef, (snapshot) => snapshot.context.geometries);
  const parameters = useSelector(cadRef, (snapshot) => snapshot.context.parameters);
  const defaultParameters = useSelector(cadRef, (snapshot) => snapshot.context.defaultParameters);
  const units = useSelector(graphicsRef, (snapshot) => snapshot.context.units);
  const jsonSchema = useSelector(cadRef, (snapshot) => snapshot.context.jsonSchema);
  const hasParameters = useSelector(cadRef, (snapshot) => Boolean(snapshot.context.jsonSchema));
  const cadStatus = useSelector(cadRef, (snapshot) => snapshot.value);

  // Get GLB data from geometries (same pattern as chat-converter.tsx)
  const getGlbData = useCallback((): Uint8Array => {
    const gltfGeometry = geometries.find((g) => g.format === 'gltf');
    if (!gltfGeometry) {
      throw new Error('No GLB geometry available. Model must be rendered first.');
    }

    return gltfGeometry.content;
  }, [geometries]);

  // Write files and load model on mount (matching project-grid.tsx pattern exactly)
  useEffect(() => {
    async function initializeAndLoadModel(): Promise<void> {
      // Write files to filesystem on first load (matching project-grid.tsx path format)
      if (!hasWrittenFilesRef.current) {
        const buildFiles: Record<string, { content: Uint8Array }> = {};
        for (const [path, file] of Object.entries(files)) {
          buildFiles[`/builds/${heroBuildId}/${path}`] = file;
        }

        await writeFiles(buildFiles);
        hasWrittenFilesRef.current = true;
      }

      // Load the CAD model after files are written
      if (!hasLoadedModel) {
        buildRef.send({ type: 'loadModel' });
        setHasLoadedModel(true);
      }
    }

    void initializeAndLoadModel();
  }, [files, writeFiles, buildRef, hasLoadedModel]);

  const handleParametersChange = useCallback(
    (newParameters: Record<string, unknown>) => {
      cadRef.send({ type: 'setParameters', parameters: newParameters });
    },
    [cadRef],
  );

  const handleExport = useCallback(() => {
    const { format } = selectedFormat;
    const filename = `qrcode.${format}`;

    toast.promise(
      (async () => {
        const glbData = getGlbData();
        const exportedFiles = await exportFromGlb(glbData, format);
        const file = exportedFiles[0];
        if (!file) {
          throw new Error('No file returned from export');
        }

        const blob = new Blob([file.data]);
        downloadBlob(blob, filename);
        return blob;
      })(),
      {
        loading: `Exporting ${filename}...`,
        success: `Downloaded ${filename}`,
        error(error) {
          let message = `Failed to download ${filename}`;
          if (error instanceof Error) {
            message = `${message}: ${error.message}`;
          }

          return message;
        },
      },
    );
  }, [selectedFormat, getGlbData]);

  const handleFormatSelect = useCallback((value: string) => {
    const option = exportFormatOptions.find((o) => o.format === value);
    if (option) {
      setSelectedFormat(option);
    }
  }, []);

  const handleContinueInEditor = useCallback(async () => {
    if (isCreatingBuild) {
      return;
    }

    setIsCreatingBuild(true);

    try {
      // Get the current parameters from the CAD context
      const currentParameters = cadRef.getSnapshot().context.parameters;

      // Create a new build with the current state
      const newBuild: Omit<Build, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'QR Code Generator',
        description: 'A parametric QR code generator built with OpenSCAD',
        thumbnail: '/tau-desktop.jpg',
        stars: 0,
        forks: 0,
        author: {
          name: 'Community',
          avatar: '/avatar-sample.png',
        },
        tags: ['openscad', 'parametric', 'qr-code'],
        assets: {
          mechanical: {
            main: 'main.scad',
            parameters: currentParameters,
          },
        },
        forkedFrom: heroBuildId,
      };

      // Create the build with the files
      const createdBuild = await buildManager.createBuild(newBuild, files);

      // Create the chat and get its ID
      const createdChat = await chatManager.createChat(createdBuild.id, {
        name: 'Initial chat',
        messages: [],
      });

      // Update the build with the correct lastChatId
      await buildManager.updateBuild(createdBuild.id, { lastChatId: createdChat.id });

      // Navigate to the new build
      await navigate(`/builds/${createdBuild.id}`);
    } catch (error: unknown) {
      console.error('Failed to create build:', error);
      toast.error('Failed to create build');
      setIsCreatingBuild(false);
    }
  }, [isCreatingBuild, cadRef, buildManager, chatManager, files, navigate]);

  const isLoading = ['initializing', 'booting'].includes(cadStatus);
  const canExport = geometries.length > 0;

  return (
    <div className="space-y-6">
      {/* Hero Text */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">See It in Action</h2>
        <p className="mt-2 text-muted-foreground">
          Tweak parameters, watch the model update instantly, then export to any format.
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">Try scanning the QR code with your phone!</p>
      </div>

      <div className="relative">
        {/* Continue in Editor Button - Top Right */}
        <Button
          variant="outline"
          size="sm"
          className="absolute -top-10 right-0 gap-1.5 bg-background/80 backdrop-blur-sm"
          disabled={isCreatingBuild}
          onClick={handleContinueInEditor}
        >
          <span>Continue in Editor</span>
          {isCreatingBuild ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpRight className="size-4" />}
        </Button>

        <div className="flex flex-col overflow-hidden rounded-xl border bg-sidebar md:h-[700px] md:flex-row">
          {/* 3D Viewer */}
          <div className="relative h-[350px] md:h-full md:flex-1">
            <ViewerStatus />

            {isLoading ? (
              <div className="flex size-full items-center justify-center">
                <HammerAnimation className="size-16" />
              </div>
            ) : geometries.length > 0 ? (
              <CadViewer
                enableGrid
                enableAxes
                geometries={geometries}
                className="size-full"
                stageOptions={{
                  zoomLevel: 1.2,
                }}
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <HammerAnimation className="size-16" />
              </div>
            )}
          </div>

          {/* Parameters Panel - Below on mobile, side on desktop */}
          {hasParameters ? (
            <div className="border-t bg-background md:w-80 md:border-t-0 md:border-l">
              <div className="flex h-full flex-col">
                <div className="border-b p-3">
                  <h3 className="text-sm font-semibold">Parameters</h3>
                  <p className="text-xs text-muted-foreground">Adjust the QR code settings</p>
                </div>
                <div className="h-[280px] overflow-hidden md:h-auto md:flex-1">
                  <Parameters
                    parameters={parameters}
                    defaultParameters={defaultParameters}
                    jsonSchema={jsonSchema}
                    units={units}
                    emptyDescription="Loading parameters..."
                    onParametersChange={handleParametersChange}
                  />
                </div>
                {/* Export Controls */}
                <div className="border-t p-3">
                  <div className="flex items-center gap-2">
                    <ComboBoxResponsive
                      title="Export Format"
                      description="Select a format to export the model"
                      groupedItems={[
                        {
                          name: 'Formats',
                          items: exportFormatOptions,
                        },
                      ]}
                      defaultValue={selectedFormat}
                      getValue={(item) => item.format}
                      renderLabel={(item, selected) => (
                        <div className="flex items-center gap-2">
                          <FileExtensionIcon filename={`file.${item.format}`} className="size-4" />
                          <span>{item.label}</span>
                          {selected?.format === item.format ? <Check className="ml-auto size-4" /> : null}
                        </div>
                      )}
                      className="min-w-0 flex-1"
                      isSearchEnabled={false}
                      onSelect={handleFormatSelect}
                    >
                      <Button variant="outline" size="sm" className="min-w-0 grow justify-start gap-2">
                        <FileExtensionIcon filename={`file.${selectedFormat.format}`} className="size-4 shrink-0" />
                        <span className="truncate">{selectedFormat.label}</span>
                        <ChevronDown className="ml-auto size-3 shrink-0 opacity-50" />
                      </Button>
                    </ComboBoxResponsive>
                    <Button
                      size="sm"
                      className="shrink-0"
                      disabled={!canExport}
                      title={canExport ? `Download as ${selectedFormat.label}` : 'Model not ready'}
                      onClick={handleExport}
                    >
                      <Download className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function HeroViewer(): React.JSX.Element {
  // Create the build data synchronously since we import the file directly
  const heroBuild = useMemo(() => createHeroBuild(encodeTextFile(qrcodeScad)), []);

  return (
    <BuildProvider
      buildId={heroBuildId}
      input={{ shouldLoadModelOnStart: false }}
      provide={{
        actors: {
          loadBuildActor: fromPromise(async () => {
            const { files, ...rest } = heroBuild;
            return rest;
          }),
        },
      }}
    >
      <HeroViewerContent files={heroBuild.files} />
    </BuildProvider>
  );
}
