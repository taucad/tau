import type { ExportFile, FileExtension } from '@taucad/types';
import type { BaseExporter } from '#exporters/base.exporter.js';
import { GltfExporter } from '#exporters/gltf.exporter.js';
import { AssimpExporter } from '#exporters/assimp.exporter.js';
import type { SupportedExportFormat } from '#formats.js';

type ExportConfig = {
  exporter: BaseExporter<unknown>;
};

const exportConfigs = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- valid file format
  '3mf': { exporter: new AssimpExporter().initialize({ format: '3mf' }) },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- valid file format
  '3ds': { exporter: new AssimpExporter().initialize({ format: '3ds' }) },
  dae: { exporter: new AssimpExporter().initialize({ format: 'dae' }) },
  fbx: { exporter: new AssimpExporter().initialize({ format: 'fbx' }) },
  glb: { exporter: new GltfExporter().initialize({ binary: true }) },
  gltf: { exporter: new GltfExporter().initialize({ binary: false }) },
  // eslint-disable-next-line id-denylist -- obj is valid file format identifier
  obj: { exporter: new AssimpExporter().initialize({ format: 'obj' }) },
  ply: { exporter: new AssimpExporter().initialize({ format: 'ply' }) },
  stl: { exporter: new AssimpExporter().initialize({ format: 'stl' }) },
  // These formats are intentionally different. `step` is the most widely used extension,
  // whilst `stp` is the format supported by assimp.
  step: {
    exporter: new AssimpExporter().initialize({
      format: 'stp',
      targetExtension: 'step',
    }),
  },
  usda: { exporter: new AssimpExporter().initialize({ format: 'usda' }) },
  usdz: { exporter: new AssimpExporter().initialize({ format: 'usdz' }) },
  x: { exporter: new AssimpExporter().initialize({ format: 'x' }) },
  x3d: { exporter: new AssimpExporter().initialize({ format: 'x3d' }) },

  // '3dm': { exporter: new AssimpExporter().initialize({ format: '3dm' }) }, // Integrate 3dm exporter into assimp
} as const satisfies Record<SupportedExportFormat, ExportConfig> & Partial<Record<FileExtension, ExportConfig>>;

/**
 * Exports GLB data to the specified format.
 *
 * @param glbData - the GLB data as Uint8Array to export
 * @param format - the target export format
 * @param exportProperties - optional Assimp export properties (e.g. `{ '3MF_EXPORT_UNIT': 'centimeter' }`)
 * @returns A promise that resolves to an array of exported files.
 * @throws Error if the underlying exporter fails
 * @public
 */
export const exportFiles = async (
  glbData: Uint8Array<ArrayBuffer>,
  format: SupportedExportFormat,
  exportProperties?: Record<string, boolean | number | string>,
): Promise<ExportFile[]> => {
  const config = exportConfigs[format];

  try {
    return await config.exporter.parseAsync(glbData, { exportProperties });
  } catch (error) {
    throw new Error(`Failed to export ${format}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
