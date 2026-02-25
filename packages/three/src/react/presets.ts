type CadViewerPreset = {
  enableGrid: boolean;
  enableAxes: boolean;
  enableGizmo: boolean;
  enableZoom: boolean;
  enablePan: boolean;
  enableDamping: boolean;
  enableCentering: boolean;
  upDirection: 'x' | 'y' | 'z';
};

function createDefaultPreset(): CadViewerPreset {
  return {
    enableGrid: true,
    enableAxes: false,
    enableGizmo: false,
    enableZoom: true,
    enablePan: true,
    enableDamping: true,
    enableCentering: false,
    upDirection: 'z',
  };
}

function createMinimalPreset(): CadViewerPreset {
  return {
    enableGrid: false,
    enableAxes: false,
    enableGizmo: false,
    enableZoom: true,
    enablePan: true,
    enableDamping: false,
    enableCentering: false,
    upDirection: 'z',
  };
}

function createFullPreset(): CadViewerPreset {
  return {
    enableGrid: true,
    enableAxes: true,
    enableGizmo: true,
    enableZoom: true,
    enablePan: true,
    enableDamping: true,
    enableCentering: true,
    upDirection: 'z',
  };
}

export const presets = {
  default: createDefaultPreset,
  minimal: createMinimalPreset,
  full: createFullPreset,
} as const;

export type { CadViewerPreset };
