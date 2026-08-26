import { defineMiddleware } from '@taucad/runtime/middleware';
import { z } from 'zod';
import { IngestEntryName } from '@taucad/telemetry';
import { reportToApi } from '#runtime/observability/report-to-api.js';

/**
 * Runtime middleware that collects kernel execution metrics.
 *
 * Hooks into createGeometry and exportGeometry to measure:
 * - Execution duration
 * - Success/failure status
 * - Export format (from exportGeometry input)
 *
 * When `reportUrl` is set, metrics are recorded via `performance.measure` and sent
 * directly from the worker to the API via fire-and-forget `fetch()`, bypassing the main thread.
 * When `reportUrl` is omitted or empty, the handler is invoked directly; errors propagate unchanged.
 */
export const observabilityMiddleware = defineMiddleware({
  id: 'observability',
  name: 'Observability',
  version: '2',
  mutates: false,
  optionsSchema: z.object({ reportUrl: z.string().optional().default('') }),

  async wrapCreateGeometry(input, handler, { logger, options }) {
    if (!options.reportUrl) {
      return handler(input);
    }

    const start = performance.now();

    try {
      const result = await handler(input);
      const duration = performance.now() - start;

      performance.measure(IngestEntryName.KERNEL_CREATE_GEOMETRY, {
        start,
        duration,
        detail: { status: 'success' },
      });

      reportToApi({
        reportUrl: options.reportUrl,
        name: IngestEntryName.KERNEL_CREATE_GEOMETRY,
        duration,
        detail: { status: 'success' },
      });

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      const message = error instanceof Error ? error.message : String(error);

      performance.measure(IngestEntryName.KERNEL_CREATE_GEOMETRY, {
        start,
        duration,
        detail: { status: 'error', error: message },
      });

      reportToApi({
        reportUrl: options.reportUrl,
        name: IngestEntryName.KERNEL_CREATE_GEOMETRY,
        duration,
        detail: { status: 'error' },
      });

      logger.error(`Geometry creation failed: ${message}`);
      throw error;
    }
  },

  async wrapExportGeometry(input, handler, { logger, options }) {
    if (!options.reportUrl) {
      return handler(input);
    }

    const start = performance.now();

    try {
      const result = await handler(input);
      const duration = performance.now() - start;

      performance.measure(IngestEntryName.KERNEL_EXPORT_GEOMETRY, {
        start,
        duration,
        detail: { status: 'success', exportFormat: input.format },
      });

      reportToApi({
        reportUrl: options.reportUrl,
        name: IngestEntryName.KERNEL_EXPORT_GEOMETRY,
        duration,
        detail: { status: 'success', exportFormat: input.format },
      });

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      const message = error instanceof Error ? error.message : String(error);

      performance.measure(IngestEntryName.KERNEL_EXPORT_GEOMETRY, {
        start,
        duration,
        detail: {
          status: 'error',
          exportFormat: input.format,
          error: message,
        },
      });

      reportToApi({
        reportUrl: options.reportUrl,
        name: IngestEntryName.KERNEL_EXPORT_GEOMETRY,
        duration,
        detail: { status: 'error', exportFormat: input.format },
      });

      logger.error(`Geometry export failed: ${message}`);
      throw error;
    }
  },
});
