import { useState } from 'react';

export const previewTabs = ['model', 'files', 'parameters', 'details'] as const;
export type PreviewTab = (typeof previewTabs)[number];

export const mobileDrawerSnapPoints: Array<number | string> = [0.5, 0.85];

export type PreviewState = {
  activeTab: PreviewTab;
  drawerOpen: boolean;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  activeSnapPoint: number | string | null;
  snapPoints: Array<number | string>;
  handleTabChange: (value: string) => void;
  handleDrawerChange: (value: boolean) => void;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  handleSnapChange: (value: number | string | null) => void;
};

/**
 * Custom hook to manage preview interface state for mobile layout
 */
export function usePreviewState(): PreviewState {
  const [activeTab, setActiveTab] = useState<PreviewTab>('model');
  // The drawer is open exactly while a panel other than the model is active.
  const drawerOpen = activeTab !== 'model';
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  const [snapPoint, setSnapPoint] = useState<number | string | null>(mobileDrawerSnapPoints[0]!);

  // Every collapse returns the drawer to its first snap point, so the next panel never reopens over the whole model.
  const handleTabChange = (value: string): void => {
    const tab = value as PreviewTab;
    setActiveTab(tab);

    if (tab === 'model') {
      setSnapPoint(mobileDrawerSnapPoints[0]!);
    }
  };

  const handleDrawerChange = (value: boolean): void => {
    if (!value) {
      handleTabChange('model');
    }
  };

  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  const handleSnapChange = (value: number | string | null): void => {
    setSnapPoint(value);
  };

  return {
    activeTab,
    drawerOpen,
    activeSnapPoint: snapPoint,
    snapPoints: mobileDrawerSnapPoints,
    handleTabChange,
    handleDrawerChange,
    handleSnapChange,
  };
}
