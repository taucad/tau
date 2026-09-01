import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const runtimeRoot = resolve(root, 'packages/runtime');
const runtimePackage = JSON.parse(readFileSync(resolve(runtimeRoot, 'package.json'), 'utf8')) as {
  readonly exports: Readonly<Record<string, string>>;
};
const sourcePaths = Object.entries(runtimePackage.exports)
  .filter(([subpath]) => subpath !== './package.json')
  .map(([subpath, target]) => {
    if (!target.endsWith('.ts')) {
      throw new Error(`unsupported runtime export target ${subpath}: ${target}`);
    }
    return resolve(runtimeRoot, target);
  });
const program = ts.createProgram(sourcePaths, {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ESNext,
});
const checker = program.getTypeChecker();
const exported = [
  ...new Set(
    sourcePaths.flatMap((sourcePath) => {
      const file = program.getSourceFile(sourcePath);
      if (!file) {
        throw new Error(`missing public entrypoint: ${sourcePath}`);
      }
      const moduleSymbol = checker.getSymbolAtLocation(file);
      if (!moduleSymbol) {
        throw new Error(`public entrypoint has no module symbol: ${sourcePath}`);
      }
      return checker
        .getExportsOfModule(moduleSymbol)
        .map(({ name }) => name)
        .filter((name) => name !== 'default');
    }),
  ),
].toSorted();
const runtimeDocs = globSync('content/docs/runtime/**/*.mdx', { cwd: import.meta.dirname })
  .map((path) => readFileSync(resolve(import.meta.dirname, path), 'utf8'))
  .join('\n');
const hasWholeToken = (content: string, name: string): boolean => {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  return new RegExp(`(?:^|[^$\\p{ID_Continue}])${escaped}(?:$|[^$\\p{ID_Continue}])`, 'u').test(content);
};

// Static debt ledger: every entry needs public API prose during the rewrite wave.
// Remove a row as soon as its whole-token documentation lands.
const pendingApiReferenceMessage = 'TODO(rewrite wave): add this public export to the API reference.';

const pendingApiReference: ReadonlySet<string> = new Set([
  'AnyKernelDefinition',
  'AnyPluginInstance',
  'BackendProvider',
  'BinaryContentDelivery',
  'BinaryFileContentMetadata',
  'BundlerRegistration',
  'BundlerRegistrations',
  'CollectExportFormats',
  'CollectFormatMap',
  'CollectKernelIds',
  'CollectRenderOptions',
  'CollectTranscodeMap',
  'CollectTranscoderTargets',
  'CompiledWasmModuleHandle',
  'ContentDependency',
  'ContentHookInputFor',
  'ContentKeysOf',
  'ContentRequestFor',
  'CoordinateSystemOptions',
  'CreateGeometryOutput',
  'ElectronRuntimeForkResolver',
  'ExpandPluginBundlers',
  'ExpandPluginKernels',
  'ExpandPluginMiddleware',
  'ExpandPluginTranscoders',
  'ExportContentFor',
  'ExportDependency',
  'ExportFormatsFor',
  'ExportGeometryRequest',
  'ExportOptionsFor',
  'ExtractNameResult',
  'FileContentKind',
  'FileContentMetadata',
  'FileExtension',
  'FileInput',
  'FileSystemBackend',
  'FileSystemBackendConfig',
  'FileSystemItem',
  'FilesystemRuntimeSource',
  'FrameContext',
  'GeometryGltf',
  'GeometryGltfTransport',
  'GeometryPoolHandle',
  'GeometryResponseTransport',
  'GeometrySvg',
  'GeometryTransport',
  'GeometryWebRtc',
  'GetDependenciesInput',
  'GetDependenciesResult',
  'GetParametersHandler',
  'GltfContentDelivery',
  'HashedGeometryResultTransport',
  'InitializeInput',
  'InitializeMemoryHandle',
  'InlineRuntimeSource',
  'JSONArray',
  'JSONObject',
  'JSONSchema7Definition',
  'JSONSchema7Type',
  'JSONSchema7TypeName',
  'JSONValue',
  'KERNEL_MODULES_KEY',
  'KernelDependency',
  'KernelLibraryTraceHandle',
  'KernelLibraryTraceMode',
  'KernelModules',
  'KernelPluginFactory',
  'KernelProvider',
  'KernelProviderId',
  'KernelRegistration',
  'KnownKernelProvider',
  'KnownSourceFormats',
  'KnownTargetFormats',
  'KnownTranscoderIds',
  'LogOptions',
  'LruMap',
  'MaterializedRender',
  'MergeExportMap',
  'MeshArtifactFinalizerInput',
  'MeshGeometryInput',
  'MeshGeometryOutput',
  'MeshGeometryRequest',
  'MeshGeometryResult',
  'MiddlewareRegistration',
  'MiddlewareRegistrations',
  'MimeType',
  'NativeBuildInput',
  'NativeBuildInputCarrier',
  'OnWorkerLog',
  'PluginCapabilities',
  'PluginFactory',
  'PluginInstance',
  'PluginMeta',
  'RenderArtifactFinalizationError',
  'RenderArtifactFinalizerInput',
  'RenderContentFor',
  'RenderId',
  'RenderOptionsDependency',
  'RenderOptionsFor',
  'RuntimeBinaryMaterialisedArgs',
  'RuntimeCapabilityRegistration',
  'RuntimeContentDeclaration',
  'RuntimeContentKey',
  'RuntimeContentUnsupportedError',
  'RuntimeErrorEventArgs',
  'RuntimeExportArgs',
  'RuntimeExportFileTransport',
  'RuntimeExportModelArgs',
  'RuntimeExportResultTransport',
  'RuntimeGeometryComputedArgs',
  'RuntimeHelloPayload',
  'RuntimeInitializeArgs',
  'RuntimeInitializeResult',
  'RuntimeKernelMessageArgs',
  'RuntimeLogOptions',
  'RuntimeLogger',
  'RuntimeModuleExports',
  'RuntimeOpenFileArgs',
  'RuntimeParametersResolvedArgs',
  'RuntimePluginDeclaration',
  'RuntimePluginPermissions',
  'RuntimePreviewIdentity',
  'RuntimeProgressArgs',
  'RuntimeSetOptionsArgs',
  'RuntimeSourceContent',
  'RuntimeSourceSnapshotArgs',
  'RuntimeStageAndRenderArgs',
  'RuntimeStateChangedArgs',
  'RuntimeTranscodeArgs',
  'RuntimeUpdateParametersArgs',
  'RuntimeWatchEvent',
  'RuntimeWatchRequest',
  'SignalBufferHandle',
  'StandardSchemaV1',
  'StandardSchemaV1FailureResult',
  'StandardSchemaV1InferInput',
  'StandardSchemaV1InferOutput',
  'StandardSchemaV1Issue',
  'StandardSchemaV1PathSegment',
  'StandardSchemaV1Props',
  'StandardSchemaV1Result',
  'StandardSchemaV1SuccessResult',
  'StandardSchemaV1Types',
  'StringKeyedObject',
  'TextFileContentMetadata',
  'Topic',
  'TopicOptions',
  'TopicSubscribeOptions',
  'TopicSubscription',
  'TranscodeInput',
  'TranscodeResult',
  'TranscoderDefinition',
  'TranscoderEdge',
  'TranscoderEdgeType',
  'TranscoderPlugin',
  'TranscoderPluginFactory',
  'TranscoderRuntime',
  'TransportCapabilities',
  'UnitOptions',
  'WebAssemblyException',
  'WireAbortReasonCode',
  'WorkerLog',
  'applyLibrarySourceMaps',
  'asBuffer',
  'assertRootedPath',
  'cadEdgeOverlayMaterialDefaults',
  'cadMaterialDefaults',
  'checkAbort',
  'classifyLibraryFrames',
  'compileWasmStreaming',
  'contentDefault',
  'convertRawIssuesToKernelIssues',
  'coordinateSystemSchema',
  'createExportFile',
  'createFrameClassifier',
  'createKernelLibraryTracer',
  'createKernelModuleRegistryExpression',
  'createKernelModuleShim',
  'defineLibraryTracePolicy',
  'demangleStackFrames',
  'deriveLocationFromFrames',
  'enrichIssueLocation',
  'exportFidelities',
  'extractDefaultParameters',
  'fileExtensionSet',
  'fileExtensions',
  'fileParameterEntrySchema',
  'finalizeMeshOutput',
  'getActiveGroupValues',
  'getModuleRegistry',
  'getParametersResultSchema',
  'getWebAssemblyExceptionConstructor',
  'gltfExportConventionSchema',
  'hashString',
  'isNode',
  'isPluginFactory',
  'isPluginInstance',
  'isRecordObject',
  'isSafeRelativePath',
  'isWebAssemblyException',
  'joinRelativePath',
  'jsonSchemaFromJson',
  'kittyCadBoundaryRepresentationExtension',
  'loadBinaryFile',
  'loadWasmBinary',
  'lookupExportFidelity',
  'lookupMimeType',
  'mimeTypes',
  'nativeBuildInputSymbol',
  'normalizeRuntimeContent',
  'packageName',
  'packageVersion',
  'parametersDirectory',
  'parseStackTrace',
  'preserveExportNames',
  'registerKernelModule',
  'resolveFileUrl',
  'resolveRootedPath',
  'resolveSourcePath',
  'resolveWasmUrl',
  'runtimeContentDefaults',
  'runtimeContentProperties',
  'runtimeContentSchema',
  'runtimePluginAbiVersionOf',
  'runtimeProtocolCallNames',
  'runtimeProtocolClientNotifyNames',
  'runtimeProtocolNotifyNames',
  'runtimeProtocolWorkerNotifyNames',
  'sha256Bytes',
  'sha256String',
  'signalSlot',
  'sourcePathMatchesExtensions',
  'tauCadTopologyExtension',
  'toVmEntryPath',
  'unitSchema',
  'validateRuntimeContentDeclarations',
  'withoutEmscriptenProcessListeners',
]);

describe('runtime API documentation coverage', () => {
  it('keeps exclusions limited to current public exports', () => {
    expect([...pendingApiReference].filter((name) => !exported.includes(name))).toEqual([]);
  });

  it.each(exported)('documents or explicitly excludes %s', (name) => {
    const documented = hasWholeToken(runtimeDocs, name);
    if (pendingApiReference.has(name)) {
      expect(documented, `${name}: ${pendingApiReferenceMessage} Remove the exclusion once documented.`).toBe(false);
      return;
    }

    expect(documented, `${name} is a public @taucad/runtime export but does not appear in the runtime MDX.`).toBe(true);
  });
});
