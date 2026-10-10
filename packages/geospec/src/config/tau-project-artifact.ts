import {
  parseProjectManifestBytes,
  projectManifestSchema,
  projectRelativePathSchema,
  serializeProjectManifest,
} from '@taucad/project-core';
import type { ProjectManifest } from '@taucad/project-core';
import type { RuntimeClient } from '@taucad/runtime/client';
import type { ExportFile, KernelIssue, KernelResult, RuntimeSourceSnapshotFile } from '@taucad/runtime/types';
import { resolveRuntimeExportIntent } from '#model/export-intent.js';
import type { RuntimeClientWithRoutes } from '#model/export-intent.js';
import type { GeometryExportIntent } from '#mesh/types.js';
import { resolveGeoSpecConfig } from '#config/validate.js';
import type { GeoSpecTauProjectDescriptor } from '#config/types.js';

/** Runtime surface required to snapshot and export one Tau project. @public */
export type GeoSpecTauProjectRuntime = RuntimeClientWithRoutes & Pick<RuntimeClient, 'shutdown' | 'snapshotSource'>;

/** Input for exporting one validated Tau project descriptor. @public */
export type ExportTauProjectArtifactOptions = {
  readonly descriptor: GeoSpecTauProjectDescriptor;
  /** Called twice so source discovery and export use separate runtime lifetimes. */
  readonly createRuntime: () => GeoSpecTauProjectRuntime | Promise<GeoSpecTauProjectRuntime>;
  readonly signal?: AbortSignal;
};

/** Finalized geometry bytes and the exact source/export metadata that produced them. @public */
export type GeoSpecTauProjectArtifact = {
  readonly format: 'step' | 'glb';
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly frame: {
    readonly coordinateSystem: 'z-up';
    readonly lengthUnit: 'millimeter';
    readonly sourceUnit: 'mm';
  };
  readonly source: {
    readonly manifestPath: string;
    readonly manifestBytes: Uint8Array<ArrayBuffer>;
    readonly manifest: ProjectManifest;
    readonly projectEntryPath: string;
    readonly entryPath: string;
    readonly kernelId: string;
    readonly files: readonly RuntimeSourceSnapshotFile[];
  };
  readonly export: {
    readonly options: Readonly<Record<string, unknown>>;
    readonly route: NonNullable<GeometryExportIntent['route']>;
  };
};

const failure = (
  code: KernelIssue['code'],
  message: string,
  options: {
    readonly details?: unknown;
    readonly priorIssues?: readonly KernelIssue[];
  } = {},
): KernelResult<never> => ({
  success: false,
  issues: [
    ...(options.priorIssues ?? []),
    {
      code,
      message,
      severity: 'error',
      type: 'runtime',
      ...(options.details === undefined ? {} : { details: options.details }),
    },
  ],
});

const equalBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

const joinProjectPath = (manifestPath: string, entryPath: string): string => {
  const separator = manifestPath.lastIndexOf('/');
  return projectRelativePathSchema.parse(
    separator === -1 ? entryPath : `${manifestPath.slice(0, separator)}/${entryPath}`,
  );
};

const usableArtifact = (format: 'step' | 'glb', artifact: ExportFile): boolean => {
  if (artifact.bytes.byteLength === 0) {
    return false;
  }
  return format === 'step' ? artifact.mimeType === 'application/step' : artifact.mimeType === 'model/gltf-binary';
};

/**
 * Export one Tau project from Runtime's coherent source snapshot.
 *
 * This helper preserves finalized bytes and provenance metadata. It does not
 * certify mathematical geometry or grant the runtime trusted-evaluator authority.
 *
 * @param options - Descriptor, fresh-runtime factory, and optional cancellation signal.
 * @returns Runtime-style success or failure with the exact finalized artifact.
 * @public
 */
export const exportTauProjectArtifact = async (
  options: ExportTauProjectArtifactOptions,
): Promise<KernelResult<GeoSpecTauProjectArtifact>> => {
  const validated = resolveGeoSpecConfig({
    subjects: { selected: options.descriptor },
  }).subjects?.['selected'];
  if (!validated) {
    throw new TypeError('GeoSpec Tau descriptor is required.');
  }
  const descriptor = structuredClone(validated);
  const importedManifest = projectManifestSchema.safeParse(descriptor.manifest);
  if (!importedManifest.success) {
    throw new TypeError('GeoSpec Tau descriptor manifest must match the current Tau project schema.');
  }
  const entryPath = joinProjectPath(descriptor.manifestPath, importedManifest.data.assets.main.entryPath);

  const snapshotRuntime = await options.createRuntime();
  let snapshot: Awaited<ReturnType<GeoSpecTauProjectRuntime['snapshotSource']>>;
  let requestedIntent: ReturnType<typeof resolveRuntimeExportIntent> | undefined;
  try {
    await snapshotRuntime.connect();
    snapshot = await snapshotRuntime.snapshotSource({
      source: { path: entryPath },
      additionalPaths: [{ path: descriptor.manifestPath, required: true }],
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (snapshot.success) {
      requestedIntent = structuredClone(
        resolveRuntimeExportIntent({
          runtime: snapshotRuntime,
          format: descriptor.format,
        }),
      );
    }
  } finally {
    await snapshotRuntime.shutdown();
  }
  if (!snapshot.success) {
    return snapshot;
  }
  if (!requestedIntent) {
    throw new TypeError('Runtime export intent was not resolved from the successful source snapshot.');
  }
  if ('success' in requestedIntent) {
    return failure('KERNEL_CAPABILITY_MISSING', requestedIntent.diagnostics.map(({ message }) => message).join('\n'), {
      details: { diagnostics: requestedIntent.diagnostics },
      priorIssues: snapshot.issues,
    });
  }
  const requestedRoute = requestedIntent.provenance.route;
  const requestedFrame = requestedIntent.provenance.honored;
  if (
    requestedRoute?.kernelId !== snapshot.data.kernelId ||
    requestedRoute.targetFormat !== descriptor.format ||
    requestedFrame?.coordinateSystem !== 'z-up' ||
    requestedFrame.sourceUnit !== 'mm' ||
    (descriptor.format === 'glb' && requestedFrame.unit?.length !== 'millimeter')
  ) {
    return failure(
      'KERNEL_CAPABILITY_MISSING',
      'Runtime route did not honor the snapshotted provider and Z-up/mm export.',
      {
        details: {
          snapshotKernelId: snapshot.data.kernelId,
          route: requestedRoute,
          honored: requestedFrame,
        },
        priorIssues: snapshot.issues,
      },
    );
  }
  if (snapshot.data.entryPath !== entryPath || snapshot.data.unresolvedPaths.length > 0) {
    return failure('SOURCE_SNAPSHOT_INVALID', 'Runtime did not return the requested complete Tau source closure.', {
      details: {
        expectedEntryPath: entryPath,
        actualEntryPath: snapshot.data.entryPath,
        unresolvedPaths: snapshot.data.unresolvedPaths,
      },
      priorIssues: snapshot.issues,
    });
  }
  const manifestFiles = snapshot.data.files.filter(({ path }) => path === descriptor.manifestPath);
  if (manifestFiles.length !== 1) {
    return failure(
      'SOURCE_SNAPSHOT_INVALID',
      'Runtime source closure must contain exactly one requested Tau manifest.',
      {
        details: {
          manifestPath: descriptor.manifestPath,
          actualCount: manifestFiles.length,
        },
        priorIssues: snapshot.issues,
      },
    );
  }
  const manifestFile = manifestFiles[0]!;
  const parsedManifest = parseProjectManifestBytes(manifestFile.content);
  if (!parsedManifest.success) {
    return failure('SOURCE_SNAPSHOT_INVALID', 'Runtime source closure contains an invalid Tau manifest.', {
      details: parsedManifest.issue,
      priorIssues: snapshot.issues,
    });
  }
  if (!equalBytes(serializeProjectManifest(importedManifest.data), serializeProjectManifest(parsedManifest.data))) {
    return failure(
      'SOURCE_SNAPSHOT_CHANGED',
      'Imported Tau descriptor does not match the snapshotted manifest bytes.',
      {
        details: { manifestPath: descriptor.manifestPath },
        priorIssues: snapshot.issues,
      },
    );
  }
  if (joinProjectPath(descriptor.manifestPath, parsedManifest.data.assets.main.entryPath) !== snapshot.data.entryPath) {
    return failure('SOURCE_SNAPSHOT_CHANGED', 'Snapshotted Tau manifest selects a different main asset.', {
      details: { manifestPath: descriptor.manifestPath },
      priorIssues: snapshot.issues,
    });
  }

  const sourceFiles: Record<string, Uint8Array<ArrayBuffer>> = {};
  for (const file of snapshot.data.files) {
    if (sourceFiles[file.path] !== undefined) {
      return failure('SOURCE_SNAPSHOT_INVALID', 'Runtime source closure contains duplicate paths.', {
        details: { path: file.path },
        priorIssues: snapshot.issues,
      });
    }
    sourceFiles[file.path] = file.content;
  }

  const exportRuntime = await options.createRuntime();
  if (exportRuntime === snapshotRuntime) {
    throw new TypeError('createRuntime must return a fresh runtime for source replay.');
  }
  try {
    await exportRuntime.connect();
    const document = exportRuntime.open({
      source: { files: sourceFiles, entry: snapshot.data.entryPath },
      parameters: descriptor.parameters ?? {},
      watch: false,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const exported = await (async () => {
      try {
        return await document.export(descriptor.format, {
          options: requestedIntent.options,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
      } finally {
        document.close();
      }
    })();
    if (!exported.success) {
      return {
        success: false,
        issues: [...snapshot.issues, ...exported.issues],
      };
    }
    const actualIntent = resolveRuntimeExportIntent({
      runtime: exportRuntime,
      format: descriptor.format,
    });
    if ('success' in actualIntent) {
      return failure('KERNEL_CAPABILITY_MISSING', actualIntent.diagnostics.map(({ message }) => message).join('\n'), {
        details: { diagnostics: actualIntent.diagnostics },
        priorIssues: [...snapshot.issues, ...exported.issues],
      });
    }
    const actualRoute = actualIntent.provenance.route;
    const actualFrame = actualIntent.provenance.honored;
    if (
      actualRoute?.kernelId !== snapshot.data.kernelId ||
      actualRoute.targetFormat !== descriptor.format ||
      actualFrame?.coordinateSystem !== 'z-up' ||
      actualFrame.sourceUnit !== 'mm' ||
      (descriptor.format === 'glb' && actualFrame.unit?.length !== 'millimeter') ||
      JSON.stringify(actualRoute) !== JSON.stringify(requestedRoute) ||
      JSON.stringify(actualIntent.options) !== JSON.stringify(requestedIntent.options)
    ) {
      return failure(
        'KERNEL_CAPABILITY_MISSING',
        'Export runtime did not retain the requested source-bound route and Z-up/mm frame.',
        {
          details: {
            snapshotKernelId: snapshot.data.kernelId,
            requested: requestedIntent,
            actual: actualIntent,
          },
          priorIssues: [...snapshot.issues, ...exported.issues],
        },
      );
    }
    const files = [...exported.files];
    if (files.length !== 1) {
      return failure('EXPORT_ARTIFACT_SET_INVALID', 'Tau project export must produce exactly one usable artifact.', {
        details: { actualCount: files.length },
        priorIssues: [...snapshot.issues, ...exported.issues],
      });
    }
    const [artifact] = files;
    if (!artifact || !usableArtifact(descriptor.format, artifact)) {
      return failure(
        'EXPORT_ARTIFACT_SET_INVALID',
        'Tau project export did not produce the requested usable artifact.',
        {
          details: {
            format: descriptor.format,
            artifact: artifact && {
              name: artifact.name,
              mimeType: artifact.mimeType,
              byteLength: artifact.bytes.byteLength,
            },
          },
          priorIssues: [...snapshot.issues, ...exported.issues],
        },
      );
    }
    const { bytes, mimeType, name } = artifact;
    return {
      success: true,
      data: {
        format: descriptor.format,
        name,
        mimeType,
        bytes,
        frame: {
          coordinateSystem: 'z-up',
          lengthUnit: 'millimeter',
          sourceUnit: 'mm',
        },
        source: {
          manifestPath: descriptor.manifestPath,
          manifestBytes: manifestFile.content,
          manifest: parsedManifest.data,
          projectEntryPath: parsedManifest.data.assets.main.entryPath,
          entryPath: snapshot.data.entryPath,
          kernelId: snapshot.data.kernelId,
          files: snapshot.data.files,
        },
        export: { options: requestedIntent.options, route: actualRoute },
      },
      issues: [...snapshot.issues, ...exported.issues],
    };
  } finally {
    await exportRuntime.shutdown();
  }
};
