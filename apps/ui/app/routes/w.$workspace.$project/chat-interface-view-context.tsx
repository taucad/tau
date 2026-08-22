import { createContext, useContext, useMemo, useCallback } from 'react';
import { useSelector } from '@xstate/react';
import { useProject } from '#hooks/use-project.js';

type ViewContextType = {
  isChatOpen: boolean;
  setIsChatOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  isFileTreeOpen: boolean;
  setIsFileTreeOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  isParametersOpen: boolean;
  setIsParametersOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  isEditorOpen: boolean;
  setIsEditorOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  isExplorerOpen: boolean;
  setIsExplorerOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  isKernelOpen: boolean;
  setIsKernelOpen: (value: boolean | ((current: boolean) => boolean)) => void;
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
  const { editorRef } = useProject();

  // Read panel open states from machine
  // (panelState is always initialized with defaultPanelState in the machine context)
  const openPanels = useSelector(editorRef, (state) => state.context.panelState.openPanels);

  // Create setters that dispatch to machine
  const setIsChatOpen = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const newValue = typeof value === 'function' ? value(openPanels.chat) : value;
      editorRef.send({ type: 'setPanelState', panelState: { openPanels: { chat: newValue } } });
    },
    [editorRef, openPanels.chat],
  );

  const setIsFileTreeOpen = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const newValue = typeof value === 'function' ? value(openPanels.files) : value;
      editorRef.send({ type: 'setPanelState', panelState: { openPanels: { files: newValue } } });
    },
    [editorRef, openPanels.files],
  );

  const setIsParametersOpen = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const newValue = typeof value === 'function' ? value(openPanels.parameters) : value;
      editorRef.send({ type: 'setPanelState', panelState: { openPanels: { parameters: newValue } } });
    },
    [editorRef, openPanels.parameters],
  );

  const setIsEditorOpen = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const newValue = typeof value === 'function' ? value(openPanels.editor) : value;
      editorRef.send({ type: 'setPanelState', panelState: { openPanels: { editor: newValue } } });
    },
    [editorRef, openPanels.editor],
  );

  const setIsExplorerOpen = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const newValue = typeof value === 'function' ? value(openPanels.explorer) : value;
      editorRef.send({ type: 'setPanelState', panelState: { openPanels: { explorer: newValue } } });
    },
    [editorRef, openPanels.explorer],
  );

  const setIsKernelOpen = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const newValue = typeof value === 'function' ? value(openPanels.kernel) : value;
      editorRef.send({ type: 'setPanelState', panelState: { openPanels: { kernel: newValue } } });
    },
    [editorRef, openPanels.kernel],
  );

  const setIsConverterOpen = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const newValue = typeof value === 'function' ? value(openPanels.converter) : value;
      editorRef.send({ type: 'setPanelState', panelState: { openPanels: { converter: newValue } } });
    },
    [editorRef, openPanels.converter],
  );

  const setIsDetailsOpen = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const newValue = typeof value === 'function' ? value(openPanels.details) : value;
      editorRef.send({ type: 'setPanelState', panelState: { openPanels: { details: newValue } } });
    },
    [editorRef, openPanels.details],
  );

  // Context value maintains same API for consumers
  const value = useMemo(
    () => ({
      isChatOpen: openPanels.chat,
      setIsChatOpen,
      isFileTreeOpen: openPanels.files,
      setIsFileTreeOpen,
      isParametersOpen: openPanels.parameters,
      setIsParametersOpen,
      isEditorOpen: openPanels.editor,
      setIsEditorOpen,
      isExplorerOpen: openPanels.explorer,
      setIsExplorerOpen,
      isKernelOpen: openPanels.kernel,
      setIsKernelOpen,
      isConverterOpen: openPanels.converter,
      setIsConverterOpen,
      isDetailsOpen: openPanels.details,
      setIsDetailsOpen,
    }),
    [
      openPanels,
      setIsChatOpen,
      setIsFileTreeOpen,
      setIsParametersOpen,
      setIsEditorOpen,
      setIsExplorerOpen,
      setIsKernelOpen,
      setIsConverterOpen,
      setIsDetailsOpen,
    ],
  );

  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}
