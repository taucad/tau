import type { AppLoadContext, EntryContext } from 'react-router';
import { describe, it, expect } from 'vitest';

import handleRequest from '#entry.server.js';
import { canonicalProductionUrl } from '#lib/canonical-url.js';

const entryContext = {} as unknown as EntryContext;
const loadContext = {} as unknown as AppLoadContext;

describe('entry.server handleRequest', () => {
  it('should apply cross-origin isolation headers to the response (HEAD path)', async () => {
    const request = new Request('https://tau.example/', { method: 'HEAD' });
    const responseHeaders = new Headers();
    const response = await handleRequest(request, 200, responseHeaders, entryContext, loadContext);
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
  });

  it('offers the JS profiler off production only (OQ-P11)', async () => {
    const staging = new Headers();
    await handleRequest(
      new Request('https://tau.example/', { method: 'HEAD' }),
      200,
      staging,
      entryContext,
      loadContext,
    );
    expect(staging.get('Document-Policy')).toBe('js-profiling');

    const production = new Headers();
    await handleRequest(
      new Request(canonicalProductionUrl, { method: 'HEAD' }),
      200,
      production,
      entryContext,
      loadContext,
    );
    expect(production.get('Document-Policy')).toBeNull();
  });

  it('should mutate the supplied responseHeaders instance with COI headers', async () => {
    const request = new Request('https://tau.example/', { method: 'HEAD' });
    const responseHeaders = new Headers();
    await handleRequest(request, 200, responseHeaders, entryContext, loadContext);
    expect(responseHeaders.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(responseHeaders.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(responseHeaders.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
  });
});
