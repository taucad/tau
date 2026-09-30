import { defineMiddleware } from '@taucad/runtime/middleware';
import { z } from 'zod';
import { IngestEntryName } from '@taucad/telemetry';
import { reportToApi } from '#runtime/observability/report-to-api.js';

/** Reports evaluation, selected-view rendering, and export writing from the worker. */
export const observabilityMiddleware = defineMiddleware({
  id: 'observability',
  name: 'Observability',
  version: '3',
  mutates: false,
  optionsSchema: z.object({ reportUrl: z.string().optional().default('') }),

  async wrapEvaluate(input, next, { logger, options }) {
    if (!options.reportUrl) {
      return next(input);
    }
    const start = performance.now();
    try {
      const result = await next(input);
      const duration = performance.now() - start;
      const status = result.success ? 'success' : 'error';
      const detail = { status, phase: 'evaluate' };
      performance.measure(IngestEntryName.KERNEL_CREATE_GEOMETRY, { start, duration, detail });
      reportToApi({
        reportUrl: options.reportUrl,
        name: IngestEntryName.KERNEL_CREATE_GEOMETRY,
        duration,
        detail: { status },
      });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      const detail = { status: 'error', phase: 'evaluate', error: message };
      performance.measure(IngestEntryName.KERNEL_CREATE_GEOMETRY, { start, duration, detail });
      reportToApi({
        reportUrl: options.reportUrl,
        name: IngestEntryName.KERNEL_CREATE_GEOMETRY,
        duration,
        detail: { status: 'error' },
      });
      logger.error(`Kernel evaluation failed: ${message}`);
      throw error;
    }
  },

  async wrapRender(input, next, { logger, options }) {
    if (!options.reportUrl) {
      return next(input);
    }
    const start = performance.now();
    try {
      const result = await next(input);
      const duration = performance.now() - start;
      const status = result.success ? 'success' : 'error';
      const detail = { status, phase: 'render', view: input.view };
      performance.measure(IngestEntryName.KERNEL_CREATE_GEOMETRY, { start, duration, detail });
      reportToApi({
        reportUrl: options.reportUrl,
        name: IngestEntryName.KERNEL_CREATE_GEOMETRY,
        duration,
        detail: { status },
      });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      const detail = { status: 'error', phase: 'render', view: input.view, error: message };
      performance.measure(IngestEntryName.KERNEL_CREATE_GEOMETRY, { start, duration, detail });
      reportToApi({
        reportUrl: options.reportUrl,
        name: IngestEntryName.KERNEL_CREATE_GEOMETRY,
        duration,
        detail: { status: 'error' },
      });
      logger.error(`View rendering failed: ${message}`);
      throw error;
    }
  },

  async wrapWrite(input, next, { logger, options }) {
    if (!options.reportUrl) {
      return next(input);
    }
    const start = performance.now();
    try {
      const result = await next(input);
      const duration = performance.now() - start;
      const status = result.success ? 'success' : 'error';
      const detail = { status, exportFormat: input.extension };
      performance.measure(IngestEntryName.KERNEL_EXPORT_GEOMETRY, { start, duration, detail });
      reportToApi({ reportUrl: options.reportUrl, name: IngestEntryName.KERNEL_EXPORT_GEOMETRY, duration, detail });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      const detail = { status: 'error', exportFormat: input.extension, error: message };
      performance.measure(IngestEntryName.KERNEL_EXPORT_GEOMETRY, { start, duration, detail });
      reportToApi({
        reportUrl: options.reportUrl,
        name: IngestEntryName.KERNEL_EXPORT_GEOMETRY,
        duration,
        detail: { status: 'error', exportFormat: input.extension },
      });
      logger.error(`Geometry export failed: ${message}`);
      throw error;
    }
  },
});
