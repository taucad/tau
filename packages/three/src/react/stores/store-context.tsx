import React, { createContext, useContext, useRef } from 'react';
import { useStore } from 'zustand';
import { createViewerStore } from './viewer-store.js';
import { createMeasureStore } from './measure-store.js';
import { createSectionViewStore } from './section-view-store.js';
import type { ViewerStore, ViewerStoreOptions, ViewerState } from './viewer-store.js';
import type { MeasureStore, MeasureStoreOptions, MeasureState } from './measure-store.js';
import type { SectionViewStore, SectionViewStoreOptions, SectionViewState } from './section-view-store.js';

type CadStores = {
  viewerStore: ViewerStore;
  measureStore: MeasureStore;
  sectionViewStore: SectionViewStore;
};

const CadStoreContext = createContext<CadStores | undefined>(undefined);

type CadStoreProviderProperties = {
  readonly children: React.ReactNode;
  readonly viewerStore?: ViewerStore;
  readonly measureStore?: MeasureStore;
  readonly sectionViewStore?: SectionViewStore;
  readonly viewerOptions?: ViewerStoreOptions;
  readonly measureOptions?: MeasureStoreOptions;
  readonly sectionViewOptions?: SectionViewStoreOptions;
};

export function CadStoreProvider({
  children,
  viewerStore,
  measureStore,
  sectionViewStore,
  viewerOptions,
  measureOptions,
  sectionViewOptions,
}: CadStoreProviderProperties): React.JSX.Element {
  const storesRef = useRef<CadStores | undefined>(undefined);

  if (!storesRef.current) {
    storesRef.current = {
      viewerStore: viewerStore ?? createViewerStore(viewerOptions),
      measureStore: measureStore ?? createMeasureStore(measureOptions),
      sectionViewStore: sectionViewStore ?? createSectionViewStore(sectionViewOptions),
    };
  }

  return (
    <CadStoreContext.Provider value={storesRef.current}>
      {children}
    </CadStoreContext.Provider>
  );
}

function useCadStores(): CadStores {
  const stores = useContext(CadStoreContext);
  if (!stores) {
    throw new Error('useCadStores must be used within a CadStoreProvider');
  }

  return stores;
}

export function useViewerStore<T>(selector: (state: ViewerState) => T): T {
  const { viewerStore } = useCadStores();
  return useStore(viewerStore, selector);
}

export function useMeasureStore<T>(selector: (state: MeasureState) => T): T {
  const { measureStore } = useCadStores();
  return useStore(measureStore, selector);
}

export function useSectionViewStore<T>(selector: (state: SectionViewState) => T): T {
  const { sectionViewStore } = useCadStores();
  return useStore(sectionViewStore, selector);
}

export { CadStoreContext };
export type { CadStores };
