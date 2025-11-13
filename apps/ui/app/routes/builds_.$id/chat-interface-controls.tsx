import { createContext, useContext, useMemo } from 'react';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';

type ViewContextType = {
  isChatOpen: boolean;
  setIsChatOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  isParametersOpen: boolean;
  setIsParametersOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  isEditorOpen: boolean;
  setIsEditorOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  isExplorerOpen: boolean;
  setIsExplorerOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  isConverterOpen: boolean;
  setIsConverterOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  isDetailsOpen: boolean;
  setIsDetailsOpen: (value: boolean | ((current: boolean) => boolean)) => void;
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
  const [isEditorOpen, setIsEditorOpen] = useCookie(cookieName.chatOpEditor, false);
  const [isExplorerOpen, setIsExplorerOpen] = useCookie(cookieName.chatOpModelExplorer, false);
  const [isConverterOpen, setIsConverterOpen] = useCookie(cookieName.chatOpConverter, false);
  const [isDetailsOpen, setIsDetailsOpen] = useCookie(cookieName.chatOpDetails, false);

  const value = useMemo(
    () => ({
      isChatOpen,
      setIsChatOpen,
      isParametersOpen,
      setIsParametersOpen,
      isEditorOpen,
      setIsEditorOpen,
      isExplorerOpen,
      setIsExplorerOpen,
      isConverterOpen,
      setIsConverterOpen,
      isDetailsOpen,
      setIsDetailsOpen,
    }),
    [
      isChatOpen,
      setIsChatOpen,
      isParametersOpen,
      setIsParametersOpen,
      isEditorOpen,
      setIsEditorOpen,
      isExplorerOpen,
      setIsExplorerOpen,
      isConverterOpen,
      setIsConverterOpen,
      isDetailsOpen,
      setIsDetailsOpen,
    ],
  );

  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}
