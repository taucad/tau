/* oxlint-disable typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers return `any` */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRuntime } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { EvaluateResult, RenderResult, KernelExportResult } from '@taucad/runtime/kernel';
import type { KernelErrorResult } from '@taucad/runtime/types';
import { IngestEntryName } from '@taucad/telemetry';
import { observabilityMiddleware } from '#runtime/observability/observability.middleware.js';
import { reportToApi } from '#runtime/observability/report-to-api.js';

vi.mock('#runtime/observability/report-to-api.js', () => ({ reportToApi: vi.fn() }));

const reportUrl = 'https://api.test/ingest';
const evaluateInput = { entryPath: 'main.ts', parameters: {}, options: {} };
const renderInput = { view: 'model', mimeType: 'model/gltf-binary', options: {} };
const exportInput = { exportId: 'step', mimeType: 'model/step', extension: 'step', options: {} };
const evaluateResult: EvaluateResult = { success: true, data: { views: ['model'] }, issues: [] };
const renderResult: RenderResult = {
  success: true,
  data: { mimeType: 'model/gltf-binary', content: new Uint8Array([1, 2, 3]) },
  issues: [],
};
const exportResult: KernelExportResult = {
  success: true,
  data: [{ name: 'output.step', bytes: new Uint8Array([1]), mimeType: 'model/step' }],
  issues: [],
};
const services = (url = reportUrl) => createMockRuntime({ options: { reportUrl: url } });

const resolve = async () => resolveRuntimePluginDefinition('middleware', observabilityMiddleware());

describe('observabilityMiddleware', () => {
  let measureSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    measureSpy = vi.spyOn(performance, 'measure').mockReturnValue({
      name: '',
      entryType: 'measure',
      startTime: 0,
      duration: 0,
      detail: null,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- PerformanceMeasure interface method
      toJSON: () => ({}),
    } satisfies PerformanceMeasure);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('passes evaluate, render, and export through unchanged without a reporting URL', async () => {
    const middleware = await resolve();
    const runtime = services('');
    const evaluate = vi.fn(async () => evaluateResult);
    const render = vi.fn(async () => renderResult);
    const exportModel = vi.fn(async () => exportResult);
    expect(await middleware.wrapEvaluate!(evaluateInput, evaluate, runtime)).toBe(evaluateResult);
    expect(await middleware.wrapRender!(renderInput, render, runtime)).toBe(renderResult);
    expect(await middleware.wrapExport!(exportInput, exportModel, runtime)).toBe(exportResult);
    expect(evaluate).toHaveBeenCalledWith(evaluateInput);
    expect(render).toHaveBeenCalledWith(renderInput);
    expect(exportModel).toHaveBeenCalledWith(exportInput);
    expect(measureSpy).not.toHaveBeenCalled();
    expect(reportToApi).not.toHaveBeenCalled();
  });

  it('measures evaluation and selected-view rendering as distinct phases', async () => {
    const middleware = await resolve();
    const runtime = services();
    expect(await middleware.wrapEvaluate!(evaluateInput, async () => evaluateResult, runtime)).toBe(evaluateResult);
    expect(await middleware.wrapRender!(renderInput, async () => renderResult, runtime)).toBe(renderResult);
    expect(measureSpy).toHaveBeenCalledWith(
      IngestEntryName.KERNEL_CREATE_GEOMETRY,
      expect.objectContaining({
        start: expect.any(Number),
        duration: expect.any(Number),
        detail: { status: 'success', phase: 'evaluate' },
      }),
    );
    expect(measureSpy).toHaveBeenCalledWith(
      IngestEntryName.KERNEL_CREATE_GEOMETRY,
      expect.objectContaining({ detail: { status: 'success', phase: 'render', view: 'model' } }),
    );
    expect(reportToApi).toHaveBeenCalledWith({
      reportUrl,
      name: IngestEntryName.KERNEL_CREATE_GEOMETRY,
      duration: expect.any(Number),
      detail: { status: 'success' },
    });
  });

  it('reports the selected export extension and returns the export result', async () => {
    const middleware = await resolve();
    const result = await middleware.wrapExport!(exportInput, async () => exportResult, services());
    expect(result).toBe(exportResult);
    expect(measureSpy).toHaveBeenCalledWith(
      IngestEntryName.KERNEL_EXPORT_GEOMETRY,
      expect.objectContaining({ detail: { status: 'success', exportFormat: 'step' } }),
    );
    expect(reportToApi).toHaveBeenCalledWith({
      reportUrl,
      name: IngestEntryName.KERNEL_EXPORT_GEOMETRY,
      duration: expect.any(Number),
      detail: { status: 'success', exportFormat: 'step' },
    });
  });

  it('records resolved failures without changing their issues or logging an exception', async () => {
    const middleware = await resolve();
    const runtime = services();
    const failure: KernelErrorResult = {
      success: false,
      issues: [{ code: 'GEOMETRY_INVALID', message: 'invalid model', severity: 'error', type: 'kernel' }],
    };
    expect(await middleware.wrapEvaluate!(evaluateInput, async () => failure, runtime)).toBe(failure);
    expect(await middleware.wrapRender!(renderInput, async () => failure, runtime)).toBe(failure);
    expect(await middleware.wrapExport!(exportInput, async () => failure, runtime)).toBe(failure);
    expect(failure.issues[0]?.message).toBe('invalid model');
    expect(measureSpy).toHaveBeenCalledWith(
      IngestEntryName.KERNEL_CREATE_GEOMETRY,
      expect.objectContaining({ detail: { status: 'error', phase: 'evaluate' } }),
    );
    expect(measureSpy).toHaveBeenCalledWith(
      IngestEntryName.KERNEL_CREATE_GEOMETRY,
      expect.objectContaining({ detail: { status: 'error', phase: 'render', view: 'model' } }),
    );
    expect(measureSpy).toHaveBeenCalledWith(
      IngestEntryName.KERNEL_EXPORT_GEOMETRY,
      expect.objectContaining({ detail: { status: 'error', exportFormat: 'step' } }),
    );
    expect(reportToApi).toHaveBeenCalledWith({
      reportUrl,
      name: IngestEntryName.KERNEL_CREATE_GEOMETRY,
      duration: expect.any(Number),
      detail: { status: 'error' },
    });
    expect(reportToApi).toHaveBeenCalledWith({
      reportUrl,
      name: IngestEntryName.KERNEL_EXPORT_GEOMETRY,
      duration: expect.any(Number),
      detail: { status: 'error', exportFormat: 'step' },
    });
    expect(reportToApi).toHaveBeenCalledTimes(3);
    expect(runtime.logger.error).not.toHaveBeenCalled();
  });

  it('records and rethrows evaluation, render, and export failures with their phase', async () => {
    const middleware = await resolve();
    const runtime = services();
    const error = new Error('kernel crash');
    const reject = async () => {
      throw error;
    };
    await expect(middleware.wrapEvaluate!(evaluateInput, reject, runtime)).rejects.toBe(error);
    await expect(middleware.wrapRender!(renderInput, reject, runtime)).rejects.toBe(error);
    await expect(middleware.wrapExport!(exportInput, reject, runtime)).rejects.toBe(error);
    expect(measureSpy).toHaveBeenCalledWith(
      IngestEntryName.KERNEL_CREATE_GEOMETRY,
      expect.objectContaining({ detail: { status: 'error', phase: 'evaluate', error: 'kernel crash' } }),
    );
    expect(measureSpy).toHaveBeenCalledWith(
      IngestEntryName.KERNEL_CREATE_GEOMETRY,
      expect.objectContaining({ detail: { status: 'error', phase: 'render', view: 'model', error: 'kernel crash' } }),
    );
    expect(measureSpy).toHaveBeenCalledWith(
      IngestEntryName.KERNEL_EXPORT_GEOMETRY,
      expect.objectContaining({ detail: { status: 'error', exportFormat: 'step', error: 'kernel crash' } }),
    );
    expect(runtime.logger.error).toHaveBeenCalledWith('Kernel evaluation failed: kernel crash');
    expect(runtime.logger.error).toHaveBeenCalledWith('View rendering failed: kernel crash');
    expect(runtime.logger.error).toHaveBeenCalledWith('Geometry export failed: kernel crash');
    expect(reportToApi).toHaveBeenCalledTimes(3);
  });

  it('propagates rejection without telemetry or extra logging when reporting is disabled', async () => {
    const middleware = await resolve();
    const runtime = services('');
    const error = new Error('original');
    const reject = async () => {
      throw error;
    };
    await expect(middleware.wrapEvaluate!(evaluateInput, reject, runtime)).rejects.toBe(error);
    await expect(middleware.wrapRender!(renderInput, reject, runtime)).rejects.toBe(error);
    await expect(middleware.wrapExport!(exportInput, reject, runtime)).rejects.toBe(error);
    expect(runtime.logger.error).not.toHaveBeenCalled();
    expect(measureSpy).not.toHaveBeenCalled();
    expect(reportToApi).not.toHaveBeenCalled();
  });
});
