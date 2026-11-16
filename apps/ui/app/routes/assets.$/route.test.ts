import { RouterContextProvider } from 'react-router';
import { describe, it, expect } from 'vitest';
import { loader } from '#routes/assets.$/route.js';

const callLoader = async (pathname: string): Promise<Response> => {
  try {
    const request = new Request(`http://localhost:3000${pathname}`);
    await loader({
      request,
      url: new URL(request.url),
      pattern: '/assets/*',
      params: { '*': pathname.replace(/^\/assets\//u, '') },
      context: new RouterContextProvider(),
    });
    throw new Error('Loader did not throw');
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    throw error;
  }
};

describe('assets.$ loader', () => {
  it('throws a 404 Response for a missing chunk hash', async () => {
    const response = await callLoader('/assets/use-project-manager-DEADBEEF.js');

    expect(response.status).toBe(404);
    expect(response.statusText).toBe('Not Found');
    expect(response.headers.get('Content-Type')).toBe('text/plain');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('Asset not found: /assets/use-project-manager-DEADBEEF.js');
  });

  it('throws a 404 Response for a missing worker chunk', async () => {
    const response = await callLoader('/assets/file-manager.worker-XXXXXXXX.js');

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('/assets/file-manager.worker-XXXXXXXX.js');
  });

  it('returns a plain-text body so the browser does not try to parse it as JS', async () => {
    const response = await callLoader('/assets/anything.css');

    expect(response.headers.get('Content-Type')).toBe('text/plain');
    const body = await response.text();
    expect(body.startsWith('<')).toBe(false);
  });
});
