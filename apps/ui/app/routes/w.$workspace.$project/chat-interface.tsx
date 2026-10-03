import { memo } from 'react';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { ChatInterfaceMobile } from '#routes/w.$workspace.$project/chat-interface-mobile.js';
import { ChatInterfaceDesktop } from '#routes/w.$workspace.$project/chat-interface-desktop.js';
import { PartThumbnailProvider } from '#providers/part-thumbnail-provider.js';
import { PartGalleryProvider } from '#components/geometry/cad/part-gallery.js';

/**
 * Main chat interface component that routes between mobile and desktop layouts
 */
export const ChatInterface = memo(function (): React.JSX.Element {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <PartThumbnailProvider>
        <PartGalleryProvider>
          <ChatInterfaceMobile />
        </PartGalleryProvider>
      </PartThumbnailProvider>
    );
  }

  return (
    <PartThumbnailProvider>
      <PartGalleryProvider>
        <ChatInterfaceDesktop />
      </PartGalleryProvider>
    </PartThumbnailProvider>
  );
});
