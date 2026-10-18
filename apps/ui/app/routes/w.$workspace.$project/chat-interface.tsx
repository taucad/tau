import { lazy, memo, Suspense } from 'react';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { PartThumbnailProvider } from '#providers/part-thumbnail-provider.js';
import { PartGalleryProvider } from '#components/geometry/cad/part-gallery.js';
import { WorkspaceSkeleton } from '#routes/w.$workspace.$project/workspace-skeleton.js';

/* B-27, D-UI-16: each layout is its own chunk, so a phone never loads the
 * desktop shell (the dockview workbench and its panels) and a desktop never
 * loads the mobile drawer. */
const ChatInterfaceMobile = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-interface-mobile.js');
  return { default: module.ChatInterfaceMobile };
});

const ChatInterfaceDesktop = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-interface-desktop.js');
  return { default: module.ChatInterfaceDesktop };
});

/**
 * Main chat interface component that routes between mobile and desktop layouts
 */
export const ChatInterface = memo(function (): React.JSX.Element {
  const isMobile = useIsMobile();

  return (
    <PartThumbnailProvider>
      <PartGalleryProvider>
        <Suspense fallback={<WorkspaceSkeleton />}>
          {isMobile ? <ChatInterfaceMobile /> : <ChatInterfaceDesktop />}
        </Suspense>
      </PartGalleryProvider>
    </PartThumbnailProvider>
  );
});
