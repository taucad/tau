import { createContext, useCallback, useContext, useMemo } from 'react';
import { LayoutGrid, MessageCircle, Rows, Settings2 } from 'lucide-react';
import { KeyShortcut } from '~/components/ui/key-shortcut.js';
import { useCookie } from '~/hooks/use-cookie.js';
import { useKeydown } from '~/hooks/use-keydown.js';
import type { KeyCombination } from '~/utils/keys.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { Button } from '~/components/ui/button.js';
import { cn } from '~/utils/ui.js';
import { ChatControls } from '~/routes/builds_.$id/chat-controls.js';
import { cookieName } from '~/constants/cookie.constants.js';

export type ViewMode = 'tabs' | 'split';

const toggleChatKeyCombination = {
  key: 'c',
  ctrlKey: true,
} satisfies KeyCombination;

const toggleParametersKeyCombination = {
  key: 'x',
  ctrlKey: true,
} satisfies KeyCombination;

const toggleViewModeKeyCombination = {
  key: 'z',
  ctrlKey: true,
} satisfies KeyCombination;

type ViewContextType = {
  viewMode: ViewMode;
  toggleViewMode: () => void;
  isChatOpen: boolean;
  toggleChatOpen: () => void;
  isParametersOpen: boolean;
  toggleParametersOpen: () => void;
};

const ViewContext = createContext<ViewContextType | undefined>(undefined);

export const useViewContext = (): ViewContextType => {
  const context = useContext(ViewContext);
  if (!context) {
    throw new Error('useViewContext must be used within a ViewContextProvider');
  }

  return context;
};

export function ViewContextProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const [isChatOpen, setIsChatOpen] = useCookie(cookieName.chatHistoryOpen, true);
  const [isParametersOpen, setIsParametersOpen] = useCookie(cookieName.chatParametersOpen, true);
  const [viewMode, setViewMode] = useCookie<ViewMode>(cookieName.chatViewMode, 'tabs');

  const toggleChatOpen = useCallback(() => {
    setIsChatOpen((previous) => !previous);
  }, [setIsChatOpen]);

  const toggleParametersOpen = useCallback(() => {
    setIsParametersOpen((previous) => !previous);
  }, [setIsParametersOpen]);

  const toggleViewMode = useCallback(() => {
    setViewMode((previous) => (previous === 'tabs' ? 'split' : 'tabs'));
  }, [setViewMode]);

  const value = useMemo(
    () => ({ viewMode, isChatOpen, isParametersOpen, toggleViewMode, toggleChatOpen, toggleParametersOpen }),
    [viewMode, isChatOpen, isParametersOpen, toggleViewMode, toggleChatOpen, toggleParametersOpen],
  );

  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

export function ChatInterfaceControls(): React.JSX.Element {
  const { toggleParametersOpen, toggleChatOpen, toggleViewMode, isChatOpen, isParametersOpen, viewMode } =
    useViewContext();

  const { formattedKeyCombination: formattedParametersKeyCombination } = useKeydown(
    toggleParametersKeyCombination,
    toggleParametersOpen,
  );

  const { formattedKeyCombination: formattedChatKeyCombination } = useKeydown(toggleChatKeyCombination, toggleChatOpen);

  const { formattedKeyCombination: formattedViewModeKeyCombination } = useKeydown(
    toggleViewModeKeyCombination,
    toggleViewMode,
  );

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="overlay"
            className="group text-muted-foreground"
            data-chat-open={isChatOpen}
            onClick={toggleChatOpen}
          >
            <MessageCircle
              className={cn(
                'transition-transform duration-200 ease-in-out',
                'group-data-[chat-open=true]:-rotate-90',
                'group-data-[chat-open=true]:text-primary',
              )}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isChatOpen ? 'Close' : 'Open'} Chat{' '}
          <KeyShortcut variant="tooltip" className="ml-1">
            {formattedChatKeyCombination}
          </KeyShortcut>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="overlay"
            size="icon"
            className={cn('group text-muted-foreground', 'hidden md:flex')}
            data-view-mode={viewMode}
            onClick={toggleViewMode}
          >
            <span className="relative size-4">
              <Rows className="absolute scale-0 rotate-90 transition-transform duration-200 ease-in-out group-data-[view-mode=tabs]:scale-100" />
              <LayoutGrid className="absolute scale-0 transition-transform duration-200 ease-in-out group-data-[view-mode=split]:scale-100" />
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Open {viewMode === 'tabs' ? 'Split' : 'Tabs'} View{' '}
          <KeyShortcut variant="tooltip" className="ml-1">
            {formattedViewModeKeyCombination}
          </KeyShortcut>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="overlay"
            className={cn(
              'group flex text-muted-foreground',
              // Hide on mobile when chat is open
              'data-[chat-open=true]:max-md:hidden',
            )}
            data-parameters-open={isParametersOpen}
            onClick={toggleParametersOpen}
          >
            <span className="size-4">
              <Settings2
                className={cn(
                  'transition-transform duration-200 ease-in-out',
                  'group-data-[parameters-open=true]:-rotate-90',
                  'group-data-[parameters-open=true]:text-primary',
                )}
              />
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isParametersOpen ? 'Close' : 'Open'} Parameters{' '}
          <KeyShortcut variant="tooltip" className="ml-1">
            {formattedParametersKeyCombination}
          </KeyShortcut>
        </TooltipContent>
      </Tooltip>
      <ChatControls />
    </>
  );
}
