import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { FileCode } from 'lucide-react';
import { Loader } from '#components/ui/loader.js';
import { Button } from '@taucad/ui/components/button';
import { Tabs, TabsContent } from '@taucad/ui/components/tabs';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@taucad/ui/components/drawer';
import { cn } from '@taucad/ui/utils/cn';
import { useCadPreview } from '#hooks/use-cad-preview.js';
import { CadPreviewViewer, CadPreviewStatus } from '#components/cad-preview.js';
import { usePreviewProject } from '#routes/w.$workspace.$project_.preview/preview-project-context.js';
import { usePreviewState } from '#routes/w.$workspace.$project_.preview/use-preview-state.js';
import { PreviewNav } from '#routes/w.$workspace.$project_.preview/preview-nav.js';
import { PreviewDetails } from '#routes/w.$workspace.$project_.preview/preview-details.js';
import { PreviewFiles } from '#routes/w.$workspace.$project_.preview/preview-files.js';
import { PreviewParameters } from '#routes/w.$workspace.$project_.preview/preview-parameters.js';
import { usePreviewFileList } from '#routes/w.$workspace.$project_.preview/use-preview-file-list.js';
import { useProjectUrl } from '#hooks/use-project-slug-route.js';

export const PreviewMobile = memo(function (): React.JSX.Element {
  const navigate = useNavigate();
  const { project } = usePreviewProject();
  const { geometry, cadRef } = useCadPreview();
  const files = usePreviewFileList();

  const { activeTab, drawerOpen, activeSnapPoint, snapPoints, handleTabChange, handleDrawerChange, handleSnapChange } =
    usePreviewState();

  const isModelTab = activeTab === 'model';
  // "Edit" on an owned project's preview goes to its canonical editor URL.
  const editorUrl = useProjectUrl(project?.id);

  const handleEdit = useCallback(() => {
    void navigate(editorUrl);
  }, [editorUrl, navigate]);

  if (!project) {
    return (
      <div className='flex h-full items-center justify-center'>
        <Loader className='size-16 text-primary' />
      </div>
    );
  }

  return (
    <div className={cn('absolute inset-0 size-full', '[--nav-height:calc(var(--spacing)*10)]', 'md:hidden')}>
      {/* Main viewer - always visible */}
      <div
        className='relative h-full transition-all duration-200 ease-linear'
        style={{
          paddingBottom: isModelTab ? '0' : `calc(${Number(activeSnapPoint) - 0.07} * 100dvh)`,
        }}
      >
        {/* 3D Viewer */}
        <div className='relative h-full'>
          <CadPreviewViewer enableZoom enablePan className='h-full' />
        </div>

        {/* Status Overlay */}
        <CadPreviewStatus className='top-[calc(var(--header-height)+var(--spacing)*4)] right-auto left-1/2 -translate-x-1/2' />

        {/* Floating Action Button */}
        <div
          className={cn(
            'absolute right-4 bottom-[calc(var(--nav-height)+var(--spacing)*4)] z-10',
            !isModelTab && 'hidden',
          )}
        >
          <Button variant='default' size='lg' className='rounded-full shadow-lg' onClick={handleEdit}>
            <FileCode className='mr-2 size-4' />
            Edit
          </Button>
        </div>
      </div>

      <Drawer
        handleOnly
        open={drawerOpen}
        snapPoints={snapPoints}
        activeSnapPoint={activeSnapPoint}
        setActiveSnapPoint={handleSnapChange}
        modal={false}
        onOpenChange={handleDrawerChange}
      >
        <DrawerTitle className='sr-only' id='drawer-title'>
          Preview Content
        </DrawerTitle>
        <DrawerDescription className='sr-only' id='drawer-description'>
          Preview content - use navigation tabs to switch between panels
        </DrawerDescription>

        <DrawerContent
          aria-labelledby='drawer-title'
          aria-describedby='drawer-description'
          className={cn(
            'flex-1 rounded-t-lg border-t bg-sidebar',
            'z-40',
            'data-[vaul-drawer-direction=bottom]:max-h-[100dvh]',
            'data-[vaul-drawer-direction=bottom]:mt-0',
            '[&_[data-slot=drawer-handle-indicator]]:bg-sidebar-primary/15',
          )}
          style={{
            height: '100%',
          }}
        >
          <Tabs
            value={activeTab}
            className='flex h-full flex-col p-0'
            style={{
              height: isModelTab ? '100dvh' : `calc(${Number(activeSnapPoint)} * 100dvh - var(--spacing)*12)`,
            }}
            onValueChange={handleTabChange}
          >
            <TabsContent enableAnimation={false} value='files' className='flex h-full flex-col overflow-hidden p-4'>
              <PreviewFiles files={files} />
            </TabsContent>
            <TabsContent enableAnimation={false} value='parameters' className='flex h-full flex-col overflow-hidden'>
              <PreviewParameters />
            </TabsContent>
            <TabsContent enableAnimation={false} value='model' className='flex h-full flex-col' />
            <TabsContent enableAnimation={false} value='details' className='flex h-full flex-col overflow-y-auto'>
              <PreviewDetails project={project} hasGeometry={Boolean(geometry)} cadRef={cadRef} />
            </TabsContent>
          </Tabs>
        </DrawerContent>
      </Drawer>

      {/* Navigation tabs */}
      <div className={cn('pointer-events-auto fixed right-0 bottom-0 left-0 z-50')}>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <PreviewNav className='h-(--nav-height)' />
        </Tabs>
      </div>
    </div>
  );
});
