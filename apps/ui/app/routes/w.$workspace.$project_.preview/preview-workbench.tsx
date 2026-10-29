import { PreviewParameterScope } from '#routes/w.$workspace.$project_.preview/preview-parameter-scope.js';
import { useCallback } from 'react';
import { Link } from 'react-router';
import { useSelector } from '@xstate/react';
import { ArrowLeft, Download, FileCode } from 'lucide-react';
import { WebglContextTrackerProvider } from '@taucad/viewer/hooks/use-webgl-context-tracker';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { Loader } from '@taucad/ui/components/loader';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { downloadBlob } from '@taucad/utils/file';
import { PreviewWorkbenchLayout } from '#components/share/preview-workbench-layout.js';
import { desktopTitlebarInset } from '#components/layout/page.js';
import { EditorDocumentSessionProvider } from '#hooks/use-editor-document-session.js';
import { ProjectProvider, useProject } from '#hooks/use-project.js';
import { useProjectKernelOptions } from '#hooks/use-project-kernel-options.js';
import { nativeKernelRequirementForEntryPath } from '#constants/available-kernel-configurations.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProjectUrl } from '#hooks/use-project-slug-route.js';
import { ProjectExportAction } from '#routes/w.$workspace.$project/project-export-action.js';
import { getFileTreeDownloadErrorMessage } from '#routes/w.$workspace.$project/file-tree-download-policy.js';
import { ProjectSettingsDialog } from '#routes/w.$workspace.$project_.preview/project-settings-dialog.js';
import { usePreviewProject } from '#routes/w.$workspace.$project_.preview/preview-project-context.js';
import { PreviewPhoneTopBar } from '#routes/w.$workspace.$project_.preview/preview-phone-top-bar.js';
import { toast } from '#components/ui/sonner.js';

/** Owned previews retain their rooted files and native-kernel selection, with a transient workbench arrangement. */
export function OwnedPreviewProviders({
  projectId,
  mainFile,
  children,
}: {
  readonly projectId: string;
  readonly mainFile: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const requirement = nativeKernelRequirementForEntryPath(mainFile);
  const selection = useProjectKernelOptions({ projectId, nativeKernelId: requirement?.runtimeKernelId });
  return (
    <WebglContextTrackerProvider>
      <PreviewParameterScope>
        {(previewParameterService) => (
          <ProjectProvider
            key={`${projectId}:${selection.key}`}
            projectId={projectId}
            profile='shared'
            previewParameterService={previewParameterService}
            kernelOptionsFactory={selection.kernelOptionsFactory}
          >
            <EditorDocumentSessionProvider>{children}</EditorDocumentSessionProvider>
          </ProjectProvider>
        )}
      </PreviewParameterScope>
    </WebglContextTrackerProvider>
  );
}

export function OwnedPreviewWorkbench(): React.JSX.Element {
  const { project } = usePreviewProject();
  const { projectRef } = useProject();
  const ready = useSelector(projectRef, (state) => state.matches('ready'));
  const error = useSelector(projectRef, (state) => state.context.error);
  const editorUrl = useProjectUrl(project?.id);
  const isMobile = useIsMobile();
  const fileManager = useFileManager();
  const downloadSource = useCallback(() => {
    if (!project) {
      return;
    }
    toast.promise(async () => fileManager.getZippedDirectory('', { versionedOnly: true }), {
      loading: 'Creating ZIP archive…',
      success(blob) {
        downloadBlob(blob, `${project.name}.zip`);
        return 'ZIP downloaded successfully';
      },
      error: (reason: unknown) => `Failed to create ZIP archive: ${getFileTreeDownloadErrorMessage(reason)}`,
    });
  }, [fileManager, project]);
  const renderTopbar = useCallback(
    (workbenchTrigger?: React.ReactNode) =>
      /* The layout hands a Workbench trigger while its container is compact. On a phone the bar is then the 48px phone
       * bar (HDR-12, D12); a wider viewport whose open sidebar narrows the container keeps this header and its trigger. */
      workbenchTrigger === undefined || !isMobile ? (
        <header
          data-slot='owned-preview-topbar'
          className='flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b px-2 py-2 @min-[640px]/preview:h-12 @min-[640px]/preview:flex-nowrap @min-[640px]/preview:gap-4 @min-[640px]/preview:px-4 @min-[640px]/preview:py-0'
        >
          <Button asChild size='sm' variant='ghost' className='@max-[768px]/preview:size-8 @max-[768px]/preview:px-0'>
            <Link to='/projects' aria-label='Projects'>
              <ArrowLeft className='size-3.5 @min-[768px]/preview:mr-1.5' aria-hidden />
              <span className='hidden @min-[768px]/preview:inline'>Projects</span>
            </Link>
          </Button>
          <h1 className='order-last w-full min-w-0 truncate text-center text-sm font-medium @min-[640px]/preview:order-none @min-[640px]/preview:w-auto @min-[640px]/preview:flex-1'>
            {project?.name}
          </h1>
          <div className='flex shrink-0 items-center gap-1 @min-[640px]/preview:gap-2'>
            {workbenchTrigger}
            <Button
              size='sm'
              variant='ghost'
              aria-label='Download source'
              className='@max-[768px]/preview:size-8 @max-[768px]/preview:px-0'
              onClick={downloadSource}
            >
              <Download className='size-3.5 @min-[768px]/preview:mr-1.5' aria-hidden />
              <span className='hidden @min-[768px]/preview:inline'>Download source</span>
            </Button>
            <ProjectExportAction
              className='h-8 px-2.5 text-xs @max-[768px]/preview:size-8 @max-[768px]/preview:px-0'
              labelClassName='hidden @min-[768px]/preview:inline'
            />
            <ProjectSettingsDialog />
            <Button asChild size='sm' variant='outline'>
              <Link to={editorUrl}>
                <FileCode className='size-3.5' aria-hidden />
                Edit
              </Link>
            </Button>
          </div>
        </header>
      ) : (
        <PreviewPhoneTopBar projectName={project?.name} editorUrl={editorUrl} onDownloadSource={downloadSource} />
      ),
    [downloadSource, editorUrl, isMobile, project?.name],
  );
  if (error) {
    return (
      <div role='alert' className='p-4 text-sm'>
        Could not open preview: {error.message}
      </div>
    );
  }
  if (!ready) {
    return (
      <div
        role='status'
        aria-label='Loading preview'
        aria-busy='true'
        className='flex h-full items-center justify-center'
      >
        <Loader />
      </div>
    );
  }
  return (
    // The route draws its own bar (`enablePageHeader: false`), so it keeps the shell's inset under the closed
    // sidebar's titlebar controls from `md` up, as the shell gives a headerless page.
    <div className={cn('size-full', desktopTitlebarInset)}>
      <PreviewWorkbenchLayout renderTopbar={renderTopbar} />
    </div>
  );
}
