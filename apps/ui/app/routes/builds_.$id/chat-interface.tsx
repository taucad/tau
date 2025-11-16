import { memo } from 'react';
import { useIsMobile } from '#hooks/use-mobile.js';
import { ChatInterfaceMobile } from '#routes/builds_.$id/chat-interface-mobile.js';
import { ChatInterfaceDesktop } from '#routes/builds_.$id/chat-interface-desktop.js';

/**
 * Main chat interface component that routes between mobile and desktop layouts
 */
export const ChatInterface = memo(function (): React.JSX.Element {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <ChatInterfaceMobile />;
  }

  return <ChatInterfaceDesktop />;
});
