import { useCallback, useRef, useState } from 'react';
import { useResizeObserver } from '#hooks/use-resize-observer.js';
import { ProjectWorkspaceProvider } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { LayoutPriority } from 'allotment';
import { PanelBottom } from 'lucide-react';
import { Allotment } from '#components/panes/allotment.js';
import { Button } from '@taucad/ui/components/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from '@taucad/ui/components/drawer';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { ChatContextInsertionProvider } from '#components/chat/chat-context-insertion.js';
import { ViewerDockview } from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
import { WorkbenchDockview } from '#routes/w.$workspace.$project/chat-workbench-dockview.js';

/** One viewer/workbench composition for published examples and owned project previews. */
export function PreviewWorkbenchLayout({
  renderTopbar,
}: {
  readonly renderTopbar: (workbenchTrigger?: React.ReactNode) => React.ReactNode;
}): React.JSX.Element {
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);
  const { width } = useResizeObserver({ ref: rootRef });
  const compact = width === undefined ? isMobile : width < 768;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openWorkbench = useCallback(() => {
    setDrawerOpen(true);
  }, []);
  return (
    <div ref={rootRef} className='@container/preview flex h-full min-h-0 w-full flex-col overflow-hidden bg-sidebar'>
      <ProjectWorkspaceProvider workbenchMode='pane' onWorkbenchOpen={openWorkbench}>
        <ChatContextInsertionProvider>
          {compact ? (
            <>
              {/* The viewer's bottom edge belongs to its controls, so the workbench opens from the top bar. The drawer
                wraps only the bar and its content, so `useIsInsideDrawer` stays false in the viewer. */}
              <Drawer modal open={drawerOpen} onOpenChange={setDrawerOpen}>
                {renderTopbar(
                  <DrawerTrigger asChild>
                    <Button type='button' size='sm' variant='ghost' aria-label='Workbench' className='size-8 px-0'>
                      <PanelBottom className='size-3.5' aria-hidden />
                    </Button>
                  </DrawerTrigger>,
                )}
                <DrawerContent className='h-[min(78dvh,48rem)] bg-sidebar'>
                  <DrawerTitle className='sr-only'>Project workbench</DrawerTitle>
                  <DrawerDescription className='sr-only'>
                    Inspect parameters, files, exports, and details.
                  </DrawerDescription>
                  <div className='min-h-0 flex-1'>
                    <WorkbenchDockview profile='shared' />
                  </div>
                </DrawerContent>
              </Drawer>
              <section className='relative min-h-0 flex-1 bg-background'>
                <ViewerDockview profile='shared' />
              </section>
            </>
          ) : (
            <>
              {renderTopbar()}
              <section className='min-h-0 flex-1 p-2'>
                <Allotment
                  paneLabels={['Viewer', 'Workbench']}
                  separator={false}
                  proportionalLayout={false}
                  className='size-full overflow-hidden rounded-lg border border-border bg-background'
                >
                  <Allotment.Pane minSize={360} priority={LayoutPriority.High}>
                    <ViewerDockview profile='shared' />
                  </Allotment.Pane>
                  <Allotment.Pane minSize={300} preferredSize={380} priority={LayoutPriority.Low}>
                    <div className='size-full border-l border-border'>
                      <WorkbenchDockview profile='shared' />
                    </div>
                  </Allotment.Pane>
                </Allotment>
              </section>
            </>
          )}
        </ChatContextInsertionProvider>
      </ProjectWorkspaceProvider>
    </div>
  );
}
