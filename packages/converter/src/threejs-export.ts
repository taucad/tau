import type { Object3D } from 'three';
import type { BaseExporter } from '#exporters/base.exporter.js';
import type { OutputFormat } from '#types.js';
import { ColladaExporter } from '#exporters/collada.exporter.js';
import { GltfExporter } from '#exporters/gltf.exporter.js';
import { ObjExporter } from '#exporters/obj.exporter.js';
import { PlyExporter } from '#exporters/ply.exporter.js';
import { StlExporter } from '#exporters/stl.exporter.js';
import { UsdzExporter } from '#exporters/usdz.exporter.js';

type ExportConfig = {
  exporter: BaseExporter<unknown>;
};

// Create and initialize exporters
const createGlbExporter = (): GltfExporter => {
  const exporter = new GltfExporter();
  exporter.initialize({ binary: true, onlyVisible: true });
  return exporter;
};

const createGltfExporter = (): GltfExporter => {
  const exporter = new GltfExporter();
  exporter.initialize({ binary: false, onlyVisible: true });
  return exporter;
};

const createObjectExporter = (): ObjExporter => {
  const exporter = new ObjExporter();
  exporter.initialize({});
  return exporter;
};

const createStlExporter = (): StlExporter => {
  const exporter = new StlExporter();
  exporter.initialize({ binary: true });
  return exporter;
};

const createPlyExporter = (): PlyExporter => {
  const exporter = new PlyExporter();
  exporter.initialize({ binary: true });
  return exporter;
};

const createUsdzExporter = (): UsdzExporter => {
  const exporter = new UsdzExporter();
  exporter.initialize({});
  return exporter;
};

const createColladaExporter = (): ColladaExporter => {
  const exporter = new ColladaExporter();
  exporter.initialize({});
  return exporter;
};

const exportConfigs = {
  glb: { exporter: createGlbExporter() },
  gltf: { exporter: createGltfExporter() },
  obj: { exporter: createObjectExporter() },
  stl: { exporter: createStlExporter() },
  ply: { exporter: createPlyExporter() },
  usdz: { exporter: createUsdzExporter() },
  dae: { exporter: createColladaExporter() },
} as const satisfies Partial<Record<OutputFormat, ExportConfig>>;

type ThreejsExportFormat = keyof typeof exportConfigs;

export const threejsExportFormats = Object.keys(exportConfigs) as ThreejsExportFormat[];

/**
 * Export a Three.js Object3D to the specified format.
 *
 * @param object - The Three.js Object3D to export.
 * @param format - The target export format.
 * @returns A promise that resolves to the exported data as a Uint8Array.
 */
export const exportThreeJs = async (object: Object3D, format: ThreejsExportFormat): Promise<Uint8Array> => {
  const config = exportConfigs[format];

  try {
    return await config.exporter.parseAsync(object);
  } catch (error) {
    throw new Error(`Failed to export ${format}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
