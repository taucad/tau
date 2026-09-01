import { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { Box, FileCode, SlidersHorizontal } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@taucad/ui/components/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@taucad/ui/components/avatar';
import { Separator } from '@taucad/ui/components/separator';
import { ProjectSettingsDialog } from '#routes/w.$workspace.$project_.preview/project-settings-dialog.js';
import { downloadBlob } from '@taucad/utils/file';
import { toast } from '#components/ui/sonner.js';
import { cn } from '@taucad/ui/utils/cn';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useCadPreview } from '#hooks/use-cad-preview.js';
import { CadPreviewViewer, CadPreviewStatus } from '#components/cad-preview.js';
import { usePreviewProject } from '#routes/w.$workspace.$project_.preview/preview-project-context.js';
import { PreviewDetails } from '#routes/w.$workspace.$project_.preview/preview-details.js';
import { PreviewCodeActions } from '#routes/w.$workspace.$project_.preview/preview-code-actions.js';
import { PreviewFiles } from '#routes/w.$workspace.$project_.preview/preview-files.js';
import { PreviewParameters } from '#routes/w.$workspace.$project_.preview/preview-parameters.js';
import { usePreviewFileList } from '#routes/w.$workspace.$project_.preview/use-preview-file-list.js';
import { useProjectUrl } from '#hooks/use-project-slug-route.js';

export const PreviewDesktop = memo(function (): React.JSX.Element {
  const navigate = useNavigate();
  const { project } = usePreviewProject();
  const { geometry, jsonSchema, cadRef } = useCadPreview();
  const fileManager = useFileManager();
  const files = usePreviewFileList();

  const hasParameters = Boolean(jsonSchema);
  // "Edit online" on an owned project's preview goes to its canonical editor URL.
  const editorUrl = useProjectUrl(project?.id);

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

  const handleEditOnline = useCallback(() => {
    void navigate(editorUrl);
  }, [editorUrl, navigate]);

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
  const author = project.author ?? { name: 'You', avatar: '/avatar-sample.png' };

  return (
    <div className='-ml-2 hidden h-full flex-col md:flex'>
      {/* Header */}
      <div className='flex items-center justify-between border-b px-6 py-4'>
        <div className='flex items-center gap-4'>
          <Avatar className='size-10'>
            <AvatarImage src={author.avatar} alt={author.name} />
            <AvatarFallback>{author.name[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className='text-xl font-semibold'>
              {author.name} / {project.name}
            </h1>
            <p className='text-sm text-muted-foreground'>{project.description}</p>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <PreviewCodeActions onEdit={handleEditOnline} onDownloadZip={handleDownloadZip} />
          <ProjectSettingsDialog />
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
              <PreviewDetails project={project} hasGeometry={Boolean(geometry)} cadRef={cadRef} />
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
