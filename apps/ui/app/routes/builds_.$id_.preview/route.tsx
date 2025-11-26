import { useParams, Link, useNavigate } from 'react-router';
import { useCallback, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { Download, Star, GitFork, FileCode, Eye, Code, ChevronDown, SlidersHorizontal, Loader2 } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import type { ExportFormat } from '@taucad/types';
import { fileExtensionFromExportFormat } from '@taucad/types/constants';
import { Button } from '#components/ui/button.js';
import type { Handle } from '#types/matches.types.js';
import { BuildProvider, useBuild } from '#hooks/use-build.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '#components/ui/tabs.js';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';
import { Badge } from '#components/ui/badge.js';
import { Avatar, AvatarImage, AvatarFallback } from '#components/ui/avatar.js';
import { Separator } from '#components/ui/separator.js';
import { GitConnector } from '#components/git/git-connector.js';
import { BuildSettingsDialog } from '#routes/builds_.$id_.preview/build-settings-dialog.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { downloadBlob } from '#utils/file.utils.js';
import { toast } from '#components/ui/sonner.js';
import { exportGeometryMachine } from '#machines/export-geometry.machine.js';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import { cn } from '#utils/ui.utils.js';
import { FileManagerProvider, useFileManager } from '#hooks/use-file-manager.js';

// Define provider component at module level for stable reference across HMR
function RouteProvider({ children }: { readonly children?: React.ReactNode }): React.JSX.Element {
  const { id } = useParams();
  return (
    <FileManagerProvider rootDirectory={`/builds/${id}`}>
      <BuildProvider buildId={id!}>{children}</BuildProvider>
    </FileManagerProvider>
  );
}

function ViewerStatus({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
  const { cadRef } = useBuild();
  const state = useSelector(cadRef, (state) => state.value);

  return ['buffering', 'rendering', 'booting', 'initializing'].includes(state) ? (
    <div
      {...props}
      className={cn(
        'absolute top-4 right-4 z-10 flex items-center gap-2 rounded-md border bg-background/70 px-2 py-1 backdrop-blur-sm',
        className,
      )}
    >
      <span className="font-mono text-sm text-muted-foreground capitalize">{state}...</span>
      <Loader2 className="size-4 animate-spin text-primary" />
    </div>
  ) : null;
}

export const handle: Handle = {
  breadcrumb() {
    // Const { buildRef, buildId } = useBuild();
    // const name = useSelector(buildRef, (state) => state.context.build?.name);
    const name = 'Preview';
    const buildId = '123';
    return (
      <Button asChild variant="ghost">
        <Link to={`/builds/${buildId}/preview`}>{name}</Link>
      </Button>
    );
  },
  providers: () => RouteProvider,
};

function BuildPreviewContent(): React.JSX.Element {
  const navigate = useNavigate();
  const { id } = useParams();
  const { buildRef, cadRef, gitRef, graphicsRef } = useBuild();
  const build = useSelector(buildRef, (state) => state.context.build);
  const geometries = useSelector(cadRef, (state) => state.context.geometries);
  const parameters = useSelector(cadRef, (state) => state.context.parameters);
  const defaultParameters = useSelector(cadRef, (state) => state.context.defaultParameters);
  const units = useSelector(graphicsRef, (state) => state.context.units);
  const jsonSchema = useSelector(cadRef, (state) => state.context.jsonSchema);
  const hasParameters = useSelector(cadRef, (state) => Boolean(state.context.jsonSchema));
  const fileManager = useFileManager();

  // Get files from file manager
  const files = useSelector(fileManager.fileManagerRef, (state) => {
    const fileTreeMap = state.context.fileTree;
    if (fileTreeMap.size === 0) {
      return [];
    }

    return [...fileTreeMap.values()].map((entry) => ({
      path: entry.path,
      name: entry.name,
      size: entry.size,
    }));
  });

  const [activeTab, setActiveTab] = useState('3d');
  const [showParameters, setShowParameters] = useState(true);

  // Create export geometry machine instance
  const exportActorRef = useActorRef(exportGeometryMachine, {
    input: { cadRef },
  });

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const fileExtension = fileExtensionFromExportFormat[format];
      const filename = `${build?.name ?? 'file'}.${fileExtension}`;
      toast.promise(
        new Promise<Blob>((resolve, reject) => {
          exportActorRef.send({
            type: 'requestExport',
            format,
            onSuccess(blob) {
              downloadBlob(blob, filename);
              resolve(blob);
            },
            onError(error) {
              reject(new Error(error));
            },
          });
        }),
        {
          loading: `Downloading ${filename}...`,
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
    },
    [exportActorRef, build?.name],
  );

  const handleDownloadZip = useCallback(async (): Promise<void> => {
    if (!build) {
      return;
    }

    toast.promise(
      async () => {
        const zipBlob = await fileManager.getZippedDirectory(`/builds/${build.id}`);
        return zipBlob;
      },
      {
        loading: 'Creating ZIP archive...',
        success(blob) {
          downloadBlob(blob, `${build.name}.zip`);
          return 'ZIP downloaded successfully';
        },
        error: 'Failed to create ZIP archive',
      },
    );
  }, [build, fileManager]);

  const handleEditOnline = useCallback(() => {
    void navigate(`/builds/${id}`);
  }, [navigate, id]);

  const handleParametersChange = useCallback(
    (newParameters: Record<string, unknown>) => {
      cadRef.send({ type: 'setParameters', parameters: newParameters });
    },
    [cadRef],
  );

  const toggleParameters = useCallback(() => {
    setShowParameters((previous) => !previous);
  }, []);

  const renderFileItem = useCallback(
    (index: number) => {
      const file = files[index];
      if (!file) {
        return undefined;
      }

      return (
        <div key={file.path} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0">
          <div className="flex items-center gap-3">
            <FileCode className="size-5 text-muted-foreground" />
            <span className="font-medium">{file.path}</span>
          </div>
          <span className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</span>
        </div>
      );
    },
    [files],
  );

  if (!build) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading build...</p>
      </div>
    );
  }

  return (
    <div className="-ml-2 flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-10">
            <AvatarImage src={build.author.avatar} alt={build.author.name} />
            <AvatarFallback>{build.author.name[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-semibold">
              {build.author.name} / {build.name}
            </h1>
            <p className="text-sm text-muted-foreground">{build.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Star className="mr-2 size-4" />
            Star {build.stars}
          </Button>
          <Button variant="outline" size="sm">
            <GitFork className="mr-2 size-4" />
            Fork {build.forks}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default">
                <Code className="mr-2 size-4" />
                Code
                <ChevronDown className="ml-2 size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEditOnline}>
                <FileCode className="mr-2 size-4" />
                Edit Online
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadZip}>
                <Download className="mr-2 size-4" />
                Download ZIP
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <BuildSettingsDialog />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Tabs value={activeTab} className="flex flex-1 flex-col gap-0 overflow-hidden" onValueChange={setActiveTab}>
          <div className="flex items-center justify-between border-b px-6">
            <TabsList
              className="border-none bg-transparent p-0 [&_[data-slot='tabs-trigger']]:min-h-8"
              activeClassName="shadow-none border-b-2 rounded-none border-b-primary"
            >
              <TabsTrigger value="files">
                <FileCode className="mr-2 size-4" />
                Files
              </TabsTrigger>
              <TabsTrigger value="3d">
                <Eye className="mr-2 size-4" />
                3D View
              </TabsTrigger>
            </TabsList>
            {activeTab === '3d' && hasParameters ? (
              <Button
                variant="ghost"
                size="sm"
                className={cn('gap-2', showParameters && 'text-primary')}
                onClick={toggleParameters}
              >
                <SlidersHorizontal className="size-4" />
                Parameters
              </Button>
            ) : null}
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Main Content */}
            <div className="flex-1 overflow-hidden">
              <TabsContent
                enableAnimation={false}
                value="files"
                className="h-full overflow-auto p-6 data-[state=inactive]:hidden"
              >
                {files.length > 0 ? (
                  <div className="h-full rounded-md border text-sm">
                    <Virtuoso
                      totalCount={files.length}
                      itemContent={renderFileItem}
                      className="h-full overflow-y-auto"
                    />
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground">No files available</p>
                )}
              </TabsContent>

              <TabsContent enableAnimation={false} value="3d" className="h-full data-[state=inactive]:hidden">
                <div className="flex h-full">
                  {/* 3D Viewer */}
                  <div className="relative flex-1">
                    <ViewerStatus />
                    {geometries.length > 0 ? (
                      <CadViewer geometries={geometries} />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <p className="text-muted-foreground">No geometry to display</p>
                      </div>
                    )}
                  </div>
                  {/* Parameters Panel */}
                  {hasParameters && showParameters ? (
                    <div className="w-80 border-l bg-background">
                      <div className="flex h-full flex-col">
                        <div className="border-b p-2">
                          <h3 className="text-sm font-semibold">Parameters</h3>
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <Parameters
                            parameters={parameters}
                            defaultParameters={defaultParameters}
                            jsonSchema={jsonSchema}
                            units={units}
                            emptyDescription="This model has no parameters"
                            onParametersChange={handleParametersChange}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </TabsContent>
            </div>

            {/* Sidebar - About Section */}
            <div className="w-80 border-l bg-sidebar p-6">
              <div className="space-y-6">
                {/* About */}
                <div>
                  <h3 className="mb-3 text-sm font-semibold">About</h3>
                  <p className="text-sm text-muted-foreground">{build.description || 'No description provided'}</p>
                </div>

                <Separator />

                {/* Tags */}
                {build.tags.length > 0 && (
                  <>
                    <div>
                      <h3 className="mb-3 text-sm font-semibold">Tags</h3>
                      <div className="flex flex-wrap gap-2">
                        {build.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {/* License */}
                <div>
                  <h3 className="mb-3 text-sm font-semibold">License</h3>
                  <p className="text-sm text-muted-foreground">MIT</p>
                </div>

                <Separator />

                {/* Downloads */}
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Downloads</h3>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      disabled={geometries.length === 0}
                      onClick={() => {
                        void handleExport('stl');
                      }}
                    >
                      <Download className="mr-2 size-4" />
                      Download STL
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      disabled={geometries.length === 0}
                      onClick={() => {
                        void handleExport('step');
                      }}
                    >
                      <Download className="mr-2 size-4" />
                      Download STEP
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      disabled={geometries.length === 0}
                      onClick={() => {
                        void handleExport('gltf');
                      }}
                    >
                      <Download className="mr-2 size-4" />
                      Download GLTF
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Git Integration */}
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Version Control</h3>
                  <GitConnector gitRef={gitRef} triggerVariant="button" triggerLabel="Connect Git" className="w-full" />
                </div>
              </div>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

export default function BuildPreview(): React.JSX.Element {
  return <BuildPreviewContent />;
}
