import { createStore } from 'zustand/vanilla';

type AvailableSectionView = {
  id: 'xy' | 'xz' | 'yz';
  normal: [number, number, number];
  constant: number;
};

type SectionViewStoreOptions = {
  enableLines?: boolean;
  enableMesh?: boolean;
  availableSectionViews?: AvailableSectionView[];
};

type SectionViewState = {
  isActive: boolean;
  selectedPlaneId: 'xy' | 'xz' | 'yz' | undefined;
  rotation: [number, number, number];
  direction: 1 | -1;
  pivot: [number, number, number];
  enableLines: boolean;
  enableMesh: boolean;
  hoveredSectionViewId: string | undefined;
  planeName: 'cartesian' | 'face';
  availableSectionViews: AvailableSectionView[];
  setActive: (active: boolean) => void;
  selectPlane: (planeId: 'xy' | 'xz' | 'yz' | undefined) => void;
  setRotation: (rotation: [number, number, number]) => void;
  setPivot: (pivot: [number, number, number]) => void;
  toggleDirection: () => void;
  setDirection: (direction: 1 | -1) => void;
  setHoveredSectionView: (id: string | undefined) => void;
  setPlaneName: (name: 'cartesian' | 'face') => void;
  setEnableLines: (enabled: boolean) => void;
  setEnableMesh: (enabled: boolean) => void;
};

const DEFAULT_SECTION_VIEWS: AvailableSectionView[] = [
  { id: 'xy', normal: [0, 0, 1], constant: 0 },
  { id: 'xz', normal: [0, 1, 0], constant: 0 },
  { id: 'yz', normal: [1, 0, 0], constant: 0 },
];

export function createSectionViewStore(options?: SectionViewStoreOptions) {
  return createStore<SectionViewState>((set) => ({
    isActive: false,
    selectedPlaneId: undefined,
    rotation: [0, 0, 0],
    direction: 1,
    pivot: [0, 0, 0],
    enableLines: options?.enableLines ?? true,
    enableMesh: options?.enableMesh ?? true,
    hoveredSectionViewId: undefined,
    planeName: 'cartesian',
    availableSectionViews: options?.availableSectionViews ?? DEFAULT_SECTION_VIEWS,
    setActive: (active) => { set({ isActive: active }); },
    selectPlane: (planeId) => { set({ selectedPlaneId: planeId }); },
    setRotation: (rotation) => { set({ rotation }); },
    setPivot: (pivot) => { set({ pivot }); },
    toggleDirection: () => {
      set((state) => ({ direction: state.direction === 1 ? -1 : 1 }));
    },
    setDirection: (direction) => { set({ direction }); },
    setHoveredSectionView: (id) => { set({ hoveredSectionViewId: id }); },
    setPlaneName: (name) => { set({ planeName: name }); },
    setEnableLines: (enabled) => { set({ enableLines: enabled }); },
    setEnableMesh: (enabled) => { set({ enableMesh: enabled }); },
  }));
}

export type { AvailableSectionView, SectionViewStoreOptions, SectionViewState };
export type SectionViewStore = ReturnType<typeof createSectionViewStore>;
