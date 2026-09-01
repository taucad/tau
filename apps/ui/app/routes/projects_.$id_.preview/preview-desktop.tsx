import { memo, useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Box, FileCode, SlidersHorizontal } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '#components/ui/tabs.js';
import { Avatar, AvatarImage, AvatarFallback } from '#components/ui/avatar.js';
import { Separator } from '#components/ui/separator.js';
import { ProjectSettingsDialog } from '#routes/projects_.$id_.preview/project-settings-dialog.js';
import { downloadBlob } from '@taucad/utils/file';
import { toast } from '#components/ui/sonner.js';
import { cn } from '#utils/ui.utils.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useCadPreview } from '#hooks/use-cad-preview.js';
import { CadPreviewViewer, CadPreviewStatus } from '#components/cad-preview.js';
import { usePreviewProject } from '#routes/projects_.$id_.preview/preview-project-context.js';
import { PreviewDetails } from '#routes/projects_.$id_.preview/preview-details.js';
import { PreviewCodeActions } from '#routes/projects_.$id_.preview/preview-code-actions.js';
import { PreviewFiles } from '#routes/projects_.$id_.preview/preview-files.js';
import { PreviewParameters } from '#routes/projects_.$id_.preview/preview-parameters.js';
import { usePreviewFileList } from '#routes/projects_.$id_.preview/use-preview-file-list.js';

export const PreviewDesktop = memo(function (): React.JSX.Element {
  const navigate = useNavigate();
  const { id } = useParams();
  const { project, isStaticProject, staticProjectFiles } = usePreviewProject();
  const { geometries, jsonSchema, cadRef } = useCadPreview();
  const fileManager = useFileManager();
  const projectManager = useProjectManager();
  const files = usePreviewFileList();

  const hasParameters = Boolean(jsonSchema);

  const [isCloning, setIsCloning] = useState(false);
  const [activeTab, setActiveTab] = useState('3d');
  const [showParameters, setShowParameters] = useState(true);

  const handleDownloadZip = useCallback(async (): Promise<void> => {
    if (!project) {
      return;
    }

    toast.promise(
      async () => {
        const zipBlob = await fileManager.getZippedDirectory(`/projects/${project.id}`);
        return zipBlob;
      },
      {
        loading: 'Creating ZIP archive...',
        success(blob) {
          downloadBlob(blob, `${project.name}.zip`);
          return 'ZIP downloaded successfully';
        },
        error: 'Failed to create ZIP archive',
      },
    );
  }, [project, fileManager]);

  const handleEditOnline = useCallback(async () => {
    if (!isStaticProject || !staticProjectFiles || !project) {
      void navigate(`/projects/${id}`);
      return;
    }

    if (isCloning) {
      return;
    }

    setIsCloning(true);

    try {
      const createProject = await projectManager.createProject({
        project: {
          name: `${project.name} (Remixed)`,
          description: project.description,
          thumbnail: project.thumbnail,
          author: {
            name: 'You',
            avatar: '/avatar-sample.png',
          },
          tags: project.tags,
          assets: project.assets,
          forkedFrom: project.id,
        },
        files: staticProjectFiles,
      });

      await navigate(`/projects/${createProject.id}`);
    } catch (error) {
      console.error('Failed to remix project:', error);
      toast.error('Failed to remix project');
      setIsCloning(false);
    }
  }, [isStaticProject, staticProjectFiles, project, isCloning, id, projectManager, navigate]);

  const toggleParameters = useCallback(() => {
    setShowParameters((previous) => !previous);
  }, []);

  if (!project) {
    return (
      <div className='flex h-full items-center justify-center'>
        <p className='text-muted-foreground'>Loading project...</p>
      </div>
    );
  }

  return (
    <div className='-ml-2 hidden h-full flex-col md:flex'>
      {/* Header */}
      <div className='flex items-center justify-between border-b px-6 py-4'>
        <div className='flex items-center gap-4'>
          <Avatar className='size-10'>
            <AvatarImage src={project.author.avatar} alt={project.author.name} />
            <AvatarFallback>{project.author.name[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className='text-xl font-semibold'>
              {project.author.name} / {project.name}
            </h1>
            <p className='text-sm text-muted-foreground'>{project.description}</p>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <PreviewCodeActions
            isStaticProject={isStaticProject}
            isCloning={isCloning}
            onRemix={handleEditOnline}
            onDownloadZip={handleDownloadZip}
          />
          {isStaticProject ? null : <ProjectSettingsDialog />}
        </div>
      </div>

      {/* Tabs */}
      <div className='flex flex-1 flex-col overflow-hidden'>
        <Tabs value={activeTab} className='flex flex-1 flex-col gap-0 overflow-hidden' onValueChange={setActiveTab}>
          <div className='flex items-center justify-between border-b px-6'>
            <TabsList
              className="border-none bg-transparent p-0 [&_[data-slot='tabs-trigger']]:min-h-8"
              activeClassName='shadow-none border-b-2 rounded-none border-b-primary'
            >
              <TabsTrigger value='files'>
                <FileCode className='mr-2 size-4' />
                Files
              </TabsTrigger>
              <TabsTrigger value='3d'>
                <Box className='mr-2 size-4' />
                3D View
              </TabsTrigger>
            </TabsList>
            {activeTab === '3d' && hasParameters ? (
              <Button
                variant='ghost'
                size='sm'
                className={cn('gap-2', showParameters && 'text-primary')}
                onClick={toggleParameters}
              >
                <SlidersHorizontal className='size-4' />
                Parameters
              </Button>
            ) : null}
          </div>

          <div className='flex flex-1 overflow-hidden'>
            {/* Main Content */}
            <div className='flex-1 overflow-hidden'>
              <TabsContent
                enableAnimation={false}
                value='files'
                className='h-full overflow-auto p-6 data-[state=inactive]:hidden'
              >
                <PreviewFiles files={files} />
              </TabsContent>

              <TabsContent enableAnimation={false} value='3d' className='h-full data-[state=inactive]:hidden'>
                <div className='flex h-full'>
                  {/* 3D Viewer */}
                  <div className='relative min-w-0 flex-1'>
                    <CadPreviewStatus />
                    <CadPreviewViewer enableZoom enablePan className='h-full' />
                  </div>
                  {/* Parameters Panel */}
                  {hasParameters && showParameters ? (
                    <div className='h-full w-80 border-l bg-background'>
                      <PreviewParameters />
                    </div>
                  ) : null}
                </div>
              </TabsContent>
            </div>

            {/* Sidebar - About Section */}
            <div className='w-80 border-l bg-sidebar'>
              <PreviewDetails project={project} geometriesCount={geometries.length} cadRef={cadRef} />
              <Separator />
              <div className='hidden p-6'>
                <h3 className='mb-3 text-sm font-semibold'>Version Control</h3>
              </div>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
});
