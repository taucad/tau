import { createKernelParameterDeclaration, defineKernel } from '@taucad/runtime/kernel';
import type { ExportGeometryResult, GetParameterDeclarationsResult } from '@taucad/runtime/types';

const delayedRenderDuration = 250;
const parameterResult: GetParameterDeclarationsResult = {
  success: true,
  data: createKernelParameterDeclaration(
    {},
    { type: 'object', properties: {} },
    {
      id: 'urn:taucad:test:browser-cancellation',
      name: 'BrowserCancellationParameters',
    },
  ),
  issues: [],
};
const unsupportedExportResult: ExportGeometryResult = { success: false, issues: [] };

const initialize = async (): Promise<Record<string, never>> => ({});
const getDependencies = async ({ entryPath }: { readonly entryPath: string }) => ({
  resolved: [entryPath],
  unresolved: [],
});
const getParameters = async () => parameterResult;
const exportGeometry = async () => unsupportedExportResult;

export const delayedBrowserCancellation = defineKernel({
  id: 'delayed-browser-cancellation',
  extensions: ['delay'],
  name: 'DelayedBrowserCancellationKernel',
  version: '1.0.0',
  exportFormats: {},
  initialize,
  getDependencies,
  getParameters,
  async createGeometry(_input, runtime) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayedRenderDuration);
    });
    runtime.signal.throwIfAborted();
    // Ponytail: cancellation tests never inspect geometry; use a valid GLB if that changes.
    return { geometry: { format: 'gltf', content: new Uint8Array() }, nativeHandle: null };
  },
  exportGeometry,
});

export const blockingBrowserCancellation = defineKernel({
  id: 'blocking-browser-cancellation',
  extensions: ['block'],
  name: 'BlockingBrowserCancellationKernel',
  version: '1.0.0',
  exportFormats: {},
  initialize,
  getDependencies,
  getParameters,
  async createGeometry() {
    const startedAt = performance.now();
    while (performance.now() >= startedAt) {
      // Deliberately never yield: only Worker.terminate() can recover this test host.
    }
    throw new Error('Blocking browser recovery fixture unexpectedly resumed.');
  },
  exportGeometry,
});
