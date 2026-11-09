import { expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/react';
import { tracingIntegrations } from '#lib/sentry-tracing.lib.js';

vi.mock('@sentry/react', async (importOriginal) => {
  const original = await importOriginal<typeof Sentry>();
  return { ...original, browserTracingIntegration: vi.fn(original.browserTracingIntegration) };
});

it('should leave resource-timing spans out of a traced page load (SB17 cost)', () => {
  tracingIntegrations('staging');

  expect(Sentry.browserTracingIntegration).toHaveBeenCalledWith({
    ignoreResourceSpans: ['resource.script', 'resource.css', 'resource.link', 'resource.img', 'resource.other'],
  });
});
