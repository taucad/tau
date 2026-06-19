import { describe, expect, it } from 'vitest';
import { observability } from '#middleware.js';
import * as observabilityModule from '#middleware/observability.middleware.js';

describe('observability middleware registration', () => {
  it('exposes named middleware only from the implementation module', () => {
    expect(observabilityModule.observabilityMiddleware).toEqual(expect.any(Function));
    expect(Object.hasOwn(observabilityModule, 'default')).toBe(false);
  });

  it('returns a public MiddlewarePlugin registration with the observability id', () => {
    const plugin = observability();
    expect(plugin.id).toBe('observability');
  });

  it('keeps worker implementation details out of the public plugin shape', () => {
    const plugin = observability();
    expect(Object.keys(plugin)).toEqual(['id', 'options']);
    expect(`module${'Url'}` in plugin).toBe(false);
  });

  it('passes reportUrl option through to plugin options', () => {
    const plugin = observability({ reportUrl: 'https://api.test/ingest' });
    expect(plugin.options).toEqual({ reportUrl: 'https://api.test/ingest' });
  });

  it('works without options because reportUrl is optional', () => {
    const plugin = observability();
    expect(plugin.options).toBeUndefined();
  });
});
