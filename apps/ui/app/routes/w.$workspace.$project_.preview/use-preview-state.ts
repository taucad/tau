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
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  const [snapPoint, setSnapPoint] = useState<number | string | null>(mobileDrawerSnapPoints[0]!);

  const handleDrawerChange = (value: boolean): void => {
    if (!value && activeTab !== 'model') {
      setActiveTab('model');
    }

    setDrawerOpen(value);
  };

  const handleTabChange = (value: string): void => {
    const tab = value as PreviewTab;
    setActiveTab(tab);

    if (!drawerOpen && tab !== 'model') {
      // When the drawer is closed and the new tab is not the model tab, open the drawer
      setDrawerOpen(true);
    } else if (drawerOpen && tab === 'model') {
      // When the drawer is open and the new tab is the model tab, close the drawer
      setDrawerOpen(false);
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
