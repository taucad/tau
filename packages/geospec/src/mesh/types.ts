import type { KernelIssueCode } from '#support/types.js';
import type { GeoSpecUnit } from '#geometry-unit.js';

/**
 * Numeric 3D vector.
 *
 * @public
 */
export type Vec3 = readonly [number, number, number];

/**
 * Geometry file formats supported by the P0 mesh loader.
 *
 * @public
 */
export type MeshFileFormat = 'glb' | 'gltf' | 'mesh-buffer';

/**
 * Geometry file formats a GeoSpec export intent can name.
 *
 * @public
 */
export type GeometryFileFormat = MeshFileFormat | 'step' | 'stp';

/**
 * Runtime export intent recorded when GeoSpec obtains evidence from a CAD
 * runtime instead of a direct geometry file.
 *
 * @public
 */
export type GeometryExportIntent = {
  requested: {
    format: GeometryFileFormat;
    coordinateSystem?: 'y-up' | 'z-up';
    unit?: {
      length?: 'meter' | 'millimeter';
    };
    tessellation?: {
      linearTolerance?: number;
      angularToleranceDegrees?: number;
    };
  };
  honored?: {
    format: GeometryFileFormat;
    coordinateSystem?: 'y-up' | 'z-up';
    unit?: {
      length?: 'meter' | 'millimeter';
    };
    tessellation?: {
      linearTolerance?: number;
      angularToleranceDegrees?: number;
    };
    sourceUnit?: GeoSpecUnit;
  };
  route?: {
    kernelId?: string;
    sourceFormat?: string;
    targetFormat?: string;
    transcoderId?: string;
    fidelity?: 'mesh' | 'brep' | (string & {});
    direct: boolean;
  };
};

/**
 * Diagnostic emitted by GeoSpec loaders, analyzers, and matchers.
 *
 * @public
 */
export type GeometryDiagnostic = {
  code: KernelIssueCode | (string & {});
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  spatial?: {
    min?: Vec3;
    max?: Vec3;
    center?: Vec3;
  };
  details?: unknown;
};
