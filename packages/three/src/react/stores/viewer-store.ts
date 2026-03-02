import { createStore } from 'zustand/vanilla';

type ViewerStoreOptions = {
  enableGrid?: boolean;
  enableAxes?: boolean;
  enableMatcap?: boolean;
  enablePostProcessing?: boolean;
  enableSurfaces?: boolean;
  enableLines?: boolean;
  enableGizmo?: boolean;
  fieldOfView?: number;
  upDirection?: 'x' | 'y' | 'z';
  environmentPreset?: 'studio' | 'neutral' | 'soft' | 'performance';
  gridSizes?: { smallSize: number; largeSize: number };
  theme?: 'light' | 'dark';
  accentColor?: string;
  sceneRadius?: number;
};

type ViewerState = {
  enableGrid: boolean;
  enableAxes: boolean;
  enableMatcap: boolean;
  enablePostProcessing: boolean;
  enableSurfaces: boolean;
  enableLines: boolean;
  enableGizmo: boolean;
  fieldOfView: number;
  upDirection: 'x' | 'y' | 'z';
  environmentPreset: 'studio' | 'neutral' | 'soft' | 'performance';
  gridSizes: { smallSize: number; largeSize: number };
  theme: 'light' | 'dark';
  accentColor: string;
  sceneRadius: number;
  setFieldOfView: (angle: number) => void;
  setUpDirection: (direction: 'x' | 'y' | 'z') => void;
  setGridSizes: (sizes: { smallSize: number; largeSize: number }) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setAccentColor: (color: string) => void;
  setSceneRadius: (radius: number) => void;
  setEnableGrid: (enabled: boolean) => void;
  setEnableAxes: (enabled: boolean) => void;
  setEnableMatcap: (enabled: boolean) => void;
  setEnablePostProcessing: (enabled: boolean) => void;
  setEnableSurfaces: (enabled: boolean) => void;
  setEnableLines: (enabled: boolean) => void;
  setEnableGizmo: (enabled: boolean) => void;
  setEnvironmentPreset: (preset: 'studio' | 'neutral' | 'soft' | 'performance') => void;
};

export function createViewerStore(options?: ViewerStoreOptions) {
  return createStore<ViewerState>((set) => ({
    enableGrid: options?.enableGrid ?? false,
    enableAxes: options?.enableAxes ?? false,
    enableMatcap: options?.enableMatcap ?? false,
    enablePostProcessing: options?.enablePostProcessing ?? false,
    enableSurfaces: options?.enableSurfaces ?? true,
    enableLines: options?.enableLines ?? true,
    enableGizmo: options?.enableGizmo ?? false,
    fieldOfView: options?.fieldOfView ?? 50,
    upDirection: options?.upDirection ?? 'z',
    environmentPreset: options?.environmentPreset ?? 'studio',
    gridSizes: options?.gridSizes ?? { smallSize: 10, largeSize: 100 },
    theme: options?.theme ?? 'light',
    accentColor: options?.accentColor ?? '#3b82f6',
    sceneRadius: options?.sceneRadius ?? 0,
    setFieldOfView: (angle) => { set({ fieldOfView: angle }); },
    setUpDirection: (direction) => { set({ upDirection: direction }); },
    setGridSizes: (sizes) => { set({ gridSizes: sizes }); },
    setTheme: (theme) => { set({ theme }); },
    setAccentColor: (color) => { set({ accentColor: color }); },
    setSceneRadius: (radius) => { set({ sceneRadius: radius }); },
    setEnableGrid: (enabled) => { set({ enableGrid: enabled }); },
    setEnableAxes: (enabled) => { set({ enableAxes: enabled }); },
    setEnableMatcap: (enabled) => { set({ enableMatcap: enabled }); },
    setEnablePostProcessing: (enabled) => { set({ enablePostProcessing: enabled }); },
    setEnableSurfaces: (enabled) => { set({ enableSurfaces: enabled }); },
    setEnableLines: (enabled) => { set({ enableLines: enabled }); },
    setEnableGizmo: (enabled) => { set({ enableGizmo: enabled }); },
    setEnvironmentPreset: (preset) => { set({ environmentPreset: preset }); },
  }));
}

export type { ViewerStoreOptions, ViewerState };
export type ViewerStore = ReturnType<typeof createViewerStore>;
