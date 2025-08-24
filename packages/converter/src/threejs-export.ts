import type { BaseExporter } from '#exporters/base.exporter.js';
import type { OutputFormat, OutputFile } from '#types.js';
import { GltfExporter } from '#exporters/gltf.exporter.js';
import { AssimpExporter } from '#exporters/assimp.exporter.js';
import { UsdzExporter } from '#exporters/usdz.exporter.js';

type ExportConfig = {
  exporter: BaseExporter<unknown>;
};

const exportConfigs = {
  '3ds': { exporter: new AssimpExporter().initialize({ format: '3ds' }) },
  dae: { exporter: new AssimpExporter().initialize({ format: 'dae' }) },
  fbx: { exporter: new AssimpExporter().initialize({ format: 'fbx' }) },
  glb: { exporter: new GltfExporter().initialize({ binary: true, onlyVisible: true }) },
  gltf: { exporter: new GltfExporter().initialize({ binary: false, onlyVisible: true }) },
  obj: { exporter: new AssimpExporter().initialize({ format: 'obj' }) },
  ply: { exporter: new AssimpExporter().initialize({ format: 'ply' }) },
  stl: { exporter: new AssimpExporter().initialize({ format: 'stl' }) },
  stp: { exporter: new AssimpExporter().initialize({ format: 'stp' }) },
  usdz: { exporter: new UsdzExporter().initialize({}) },
  x: { exporter: new AssimpExporter().initialize({ format: 'x' }) },
  x3d: { exporter: new AssimpExporter().initialize({ format: 'x3d' }) },
  
  // '3mf': { exporter: new AssimpExporter().initialize({ format: '3mf' }) }, // Fix assimp 3mf exporter
  // '3dm': { exporter: new AssimpExporter().initialize({ format: '3dm' }) }, // Integrate 3dm exporter into assimp
} as const satisfies Partial<Record<OutputFormat, ExportConfig>>;

export type ThreejsExportFormat = keyof typeof exportConfigs;

export const threejsExportFormats = Object.keys(exportConfigs) as ThreejsExportFormat[];

/**
 * Export GLB data to the specified format.
 *
 * @param glbData - The GLB data as Uint8Array to export.
 * @param format - The target export format.
 * @returns A promise that resolves to an array of exported files.
 */
export const exportThreeJs = async (glbData: Uint8Array, format: ThreejsExportFormat): Promise<OutputFile[]> => {
  const config = exportConfigs[format];

  try {
    return await config.exporter.parseAsync(glbData);
  } catch (error) {
    throw new Error(`Failed to export ${format}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
