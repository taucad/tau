import { lazy, memo, Suspense, useSyncExternalStore } from 'react';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { PartThumbnailProvider } from '#providers/part-thumbnail-provider.js';
import { PartGalleryProvider } from '#components/geometry/cad/part-gallery.js';
import { WorkspaceOpening } from '#routes/w.$workspace.$project/workspace-frame.js';
import { TourHost } from '#components/tour/tour-host.js';
import {
  loadChatInterfaceDesktop,
  loadChatInterfaceMobile,
} from '#routes/w.$workspace.$project/chat-interface-layouts.js';

/* B-27, D-UI-16: each layout is its own chunk, so a phone never loads the
 * desktop shell (the dockview workbench and its panels) and a desktop never
 * loads the mobile drawer. The open warms the viewport's one beforehand
 * (`warmWorkspaceLayout`), through these same imports. */
const ChatInterfaceMobile = lazy(async () => {
  const module = await loadChatInterfaceMobile();
  return { default: module.ChatInterfaceMobile };
});

const ChatInterfaceDesktop = lazy(async () => {
  const module = await loadChatInterfaceDesktop();
  return { default: module.ChatInterfaceDesktop };
});

/** Nothing to subscribe to: the value only changes from the hydration pass to the first client render. */
const subscribeToNothing = (): (() => void) => {
  return () => undefined;
};

/**
 * Main chat interface component that routes between mobile and desktop layouts.
 *
 * D13: a phone paints the phone layout first. `useIsMobile` can only report
 * `false` while server rendering and hydrating, because no viewport is
 * measured there, so choosing a layout in that pass would mount (and fetch)
 * the desktop workbench on a phone and then swap. Until the client has
 * rendered once this draws nothing, and the workspace frame above it, whose
 * arrangement is CSS, shows through; a client mount — every mount below the
 * app's file-manager gate — picks the layout from its first render.
 */
export const ChatInterface = memo(function (): React.JSX.Element {
  const isMobile = useIsMobile();
  const isClientRender = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  /* Creating the element loads nothing; only rendering a lazy layout requests its chunk. */
  const layout = isMobile ? <ChatInterfaceMobile /> : <ChatInterfaceDesktop />;

  return (
    <PartThumbnailProvider>
      <PartGalleryProvider>
        {/* The product tour's anchors and live region; the tour itself is a chunk loaded only when it runs. */}
        <TourHost>
          <Suspense fallback={<WorkspaceOpening />}>{isClientRender ? layout : <WorkspaceOpening />}</Suspense>
        </TourHost>
      </PartGalleryProvider>
    </PartThumbnailProvider>
  );
});
