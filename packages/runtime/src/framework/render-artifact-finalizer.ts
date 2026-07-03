import type { GeometryGltf, GeometryResponse, GeometrySvg } from '@taucad/types';
import type { CreateGeometryOutput } from '#types/runtime-kernel.types.js';
import type { KernelIssue } from '#types/runtime.types.js';

export type RenderArtifactFinalizerInput<NativeHandle = unknown> = {
  readonly artifacts: readonly GeometryResponse[];
  readonly nativeHandle: NativeHandle;
  readonly issues?: readonly KernelIssue[];
};

export class RenderArtifactFinalizationError extends Error {
  public readonly issues: KernelIssue[];

  public constructor(issue: KernelIssue) {
    super(issue.message);
    this.name = 'RenderArtifactFinalizationError';
    this.issues = [issue];
  }
}

const createIssue = (code: KernelIssue['code'], message: string, details?: unknown): KernelIssue => ({
  code,
  message,
  details,
  type: 'runtime',
  severity: 'error',
});

const fail = (issue: KernelIssue): never => {
  throw new RenderArtifactFinalizationError(issue);
};

const normalizeGltf = (geometry: GeometryGltf): GeometryGltf => {
  if (!(geometry.content instanceof Uint8Array) || geometry.content.byteLength === 0) {
    fail(createIssue('GLTF_BYTES_INVALID', 'GLTF render output must contain non-empty Uint8Array bytes.'));
  }

  return {
    ...geometry,
    content:
      geometry.content.byteOffset === 0 && geometry.content.byteLength === geometry.content.buffer.byteLength
        ? geometry.content
        : new Uint8Array(geometry.content),
  };
};

const normalizeSvg = (geometry: GeometrySvg): GeometrySvg => {
  const content = geometry.content.trim();
  if (!content.startsWith('<svg') || !content.includes('</svg>')) {
    fail(createIssue('SVG_DOCUMENT_INVALID', 'SVG render output must be a complete SVG document.'));
  }
  return { ...geometry, content };
};

const normalizeGeometry = (geometry: GeometryResponse): GeometryResponse => {
  if (geometry.format === 'gltf') {
    return normalizeGltf(geometry);
  }
  if (geometry.format === 'svg') {
    return normalizeSvg(geometry);
  }
  return geometry;
};

export const finalizeRenderOutput = <NativeHandle>({
  artifacts,
  nativeHandle,
  issues,
}: RenderArtifactFinalizerInput<NativeHandle>): CreateGeometryOutput<NativeHandle> => {
  if (artifacts.length === 0) {
    fail(createIssue('NO_RENDER_GEOMETRY', 'Kernel render produced no public geometry artifact.'));
  }

  const formats = new Set(artifacts.map((artifact) => artifact.format));
  if (formats.size > 1) {
    fail(
      createIssue('MIXED_RENDER_OUTPUT_UNSUPPORTED', 'Kernel render produced mixed public geometry formats.', {
        formats: [...formats],
      }),
    );
  }

  if (artifacts.length > 1) {
    fail(
      createIssue('MULTI_RENDER_ARTIFACT_UNSUPPORTED', 'Kernel render produced multiple public geometry artifacts.', {
        format: artifacts[0]?.format,
        count: artifacts.length,
      }),
    );
  }

  return {
    geometry: normalizeGeometry(artifacts[0]!),
    nativeHandle,
    issues: issues === undefined ? undefined : [...issues],
  };
};
