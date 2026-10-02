import { createKernelParameterDeclaration, defineKernel } from '@taucad/runtime/kernel';
import type { KernelServices } from '@taucad/runtime/kernel';
import type { DescribeResult } from '@taucad/runtime/types';

const delayedRenderDuration = 250;
const parameterDeclaration = createKernelParameterDeclaration(
  {},
  { type: 'object', properties: {} },
  {
    id: 'urn:taucad:test:browser-cancellation',
    name: 'BrowserCancellationParameters',
  },
);

const initialize = async (): Promise<Record<string, never>> => ({});
const resolve = async ({ entryPath }: { readonly entryPath: string }) => ({
  resolved: [entryPath],
  unresolved: [],
});
const describe = async (): Promise<DescribeResult> => ({
  success: true,
  data: { parameters: parameterDeclaration },
  issues: [],
});

const evaluateDelayed = async (_input: unknown, runtime: KernelServices) => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayedRenderDuration);
  });
  runtime.signal.throwIfAborted();
  return { handle: {} };
};

export const delayedBrowserCancellation = defineKernel({
  id: 'delayed-browser-cancellation',
  extensions: ['delay'],
  name: 'DelayedBrowserCancellationKernel',
  version: '1.0.0',
  views: {},
  exports: {},
  cancellation: 'cooperative',
  initialize,
  resolve,
  describe,
  evaluate: evaluateDelayed,
});

export const quarantinedBrowserCancellation = defineKernel({
  id: 'quarantined-browser-cancellation',
  extensions: ['quarantine'],
  name: 'QuarantinedBrowserCancellationKernel',
  version: '1.0.0',
  views: {},
  exports: {},
  initialize,
  resolve,
  describe,
  evaluate: evaluateDelayed,
});

export const blockingBrowserCancellation = defineKernel({
  id: 'blocking-browser-cancellation',
  extensions: ['block'],
  name: 'BlockingBrowserCancellationKernel',
  version: '1.0.0',
  views: {},
  exports: {},
  initialize,
  resolve,
  describe,
  async evaluate() {
    const startedAt = performance.now();
    while (performance.now() >= startedAt) {
      // Deliberately never yield: only Worker.terminate() can recover this test host.
    }
    throw new Error('Blocking browser recovery fixture unexpectedly resumed.');
  },
});
