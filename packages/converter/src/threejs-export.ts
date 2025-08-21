import type { Object3D } from 'three';
import type { BaseExporter } from '#exporters/base.exporter.js';
import type { OutputFormat, OutputFile } from '#types.js';
import { DaeExporter } from '#exporters/dae.exporter.js';
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

// eslint-disable-next-line unicorn/prevent-abbreviations -- obj is a valid name
const createObjExporter = (): ObjExporter => {
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

const createDaeExporter = (): DaeExporter => {
  const exporter = new DaeExporter();
  exporter.initialize({});
  return exporter;
};

const exportConfigs = {
  glb: { exporter: createGlbExporter() },
  gltf: { exporter: createGltfExporter() },
  obj: { exporter: createObjExporter() },
  stl: { exporter: createStlExporter() },
  ply: { exporter: createPlyExporter() },
  usdz: { exporter: createUsdzExporter() },
  dae: { exporter: createDaeExporter() },
} as const satisfies Partial<Record<OutputFormat, ExportConfig>>;

export type ThreejsExportFormat = keyof typeof exportConfigs;

export const threejsExportFormats = Object.keys(exportConfigs) as ThreejsExportFormat[];

/**
 * Export a Three.js Object3D to the specified format.
 *
 * @param object - The Three.js Object3D to export.
 * @param format - The target export format.
 * @returns A promise that resolves to an array of exported files.
 */
export const exportThreeJs = async (object: Object3D, format: ThreejsExportFormat): Promise<OutputFile[]> => {
  const config = exportConfigs[format];

  try {
    return await config.exporter.parseAsync(object);
  } catch (error) {
    throw new Error(`Failed to export ${format}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
