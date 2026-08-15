import { createEmptyGltfGeometry, defineKernel } from '@taucad/runtime/kernel';
import type { ExportGeometryResult, GetParametersResult, KernelPluginFactory } from '@taucad/runtime/types';

const delayedRenderDuration = 250;
const parameterResult: GetParametersResult = {
  success: true,
  data: { defaultParameters: {}, jsonSchema: { type: 'object', properties: {} } },
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

export const delayedBrowserCancellation: KernelPluginFactory<
  'delayed-browser-cancellation',
  Record<string, never>,
  Record<string, unknown>
> = defineKernel({
  // Pins `Render` for the annotation above; this kernel fulfils no native content.
  render: {},
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
    return { geometry: createEmptyGltfGeometry(), nativeHandle: null };
  },
  exportGeometry,
});

export const blockingBrowserCancellation: KernelPluginFactory<
  'blocking-browser-cancellation',
  Record<string, never>,
  Record<string, unknown>
> = defineKernel({
  // Pins `Render` for the annotation above; this kernel fulfils no native content.
  render: {},
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
