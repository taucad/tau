import type { PartialDeep } from 'type-fest';
import type { PanelState } from '#types/editor.types.js';

export const mergePanelState = (current: PanelState, update?: PartialDeep<PanelState>): PanelState => {
  const desktopLayout = update?.desktopLayout as Partial<PanelState['desktopLayout']> | undefined;
  return {
    desktopLayout: {
      chatOpen: desktopLayout?.chatOpen ?? current.desktopLayout.chatOpen,
      workbenchOpen: desktopLayout?.workbenchOpen ?? current.desktopLayout.workbenchOpen,
      chatWidth: desktopLayout?.chatWidth ?? current.desktopLayout.chatWidth,
      workbenchWidth: desktopLayout?.workbenchWidth ?? current.desktopLayout.workbenchWidth,
      compactAuxiliary: desktopLayout?.compactAuxiliary ?? current.desktopLayout.compactAuxiliary,
    },
    mobileActiveTab: update?.mobileActiveTab ?? current.mobileActiveTab,
    kernelPaneview: {
      ...current.kernelPaneview,
      ...(update?.kernelPaneview as PanelState['kernelPaneview'] | undefined),
    },
    modelPaneview: {
      ...current.modelPaneview,
      ...(update?.modelPaneview as PanelState['modelPaneview'] | undefined),
    },
    parametersPaneview: {
      ...current.parametersPaneview,
      ...(update?.parametersPaneview as PanelState['parametersPaneview'] | undefined),
    },
    consolePaneview: {
      ...current.consolePaneview,
      ...(update?.consolePaneview as PanelState['consolePaneview'] | undefined),
    },
  };
};
