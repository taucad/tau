import { createContext, useCallback, useContext, useMemo } from 'react';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';

type ViewContextType = {
  isChatOpen: boolean;
  toggleChatOpen: () => void;
  isParametersOpen: boolean;
  toggleParametersOpen: () => void;
  isEditorOpen: boolean;
  toggleEditorOpen: () => void;
  isExplorerOpen: boolean;
  toggleExplorerOpen: () => void;
  isDetailsOpen: boolean;
  toggleDetailsOpen: () => void;
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
  const [isChatOpen, setIsChatOpen] = useCookie(cookieName.chatOpHistory, true);
  const [isParametersOpen, setIsParametersOpen] = useCookie(cookieName.chatOpParameters, true);
  const [isEditorOpen, setIsEditorOpen] = useCookie(cookieName.chatOpEditor, true);
  const [isExplorerOpen, setIsObjectTreeOpen] = useCookie(cookieName.chatOpModelExplorer, true);
  const [isDetailsOpen, setIsDetailsOpen] = useCookie(cookieName.chatOpDetails, true);
  const toggleChatOpen = useCallback(() => {
    setIsChatOpen((previous) => !previous);
  }, [setIsChatOpen]);

  const toggleParametersOpen = useCallback(() => {
    setIsParametersOpen((previous) => !previous);
  }, [setIsParametersOpen]);

  const toggleEditorOpen = useCallback(() => {
    setIsEditorOpen((previous) => !previous);
  }, [setIsEditorOpen]);

  const toggleExplorerOpen = useCallback(() => {
    setIsObjectTreeOpen((previous) => !previous);
  }, [setIsObjectTreeOpen]);

  const toggleDetailsOpen = useCallback(() => {
    setIsDetailsOpen((previous) => !previous);
  }, [setIsDetailsOpen]);

  const value = useMemo(
    () => ({ isChatOpen, isParametersOpen, toggleChatOpen, toggleParametersOpen, isEditorOpen, toggleEditorOpen, isExplorerOpen, toggleExplorerOpen, isDetailsOpen, toggleDetailsOpen }),
    [isChatOpen, isParametersOpen, toggleChatOpen, toggleParametersOpen, isEditorOpen, toggleEditorOpen, isExplorerOpen, toggleExplorerOpen, isDetailsOpen, toggleDetailsOpen],
  );

  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}
