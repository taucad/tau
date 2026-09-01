import { memo } from 'react';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { ChatInterfaceMobile } from '#routes/w.$workspace.$project/chat-interface-mobile.js';
import { ChatInterfaceDesktop } from '#routes/w.$workspace.$project/chat-interface-desktop.js';

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
