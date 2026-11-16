import { redirect, RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { everyResponseHeaders, rootMiddleware } from '#app/middleware.server.js';

const url = new URL('https://tau.new/legal/privacy/');
const args = {
  request: new Request(url),
  url,
  params: {},
  pattern: '/legal/:document',
  context: new RouterContextProvider(),
};

describe('www root middleware (React Router 8 migration C1)', () => {
  it.each([
    { kind: 'document', response: () => new Response('<p>Page</p>', { headers: { 'Content-Type': 'text/html' } }) },
    { kind: '.data', response: () => new Response('[]', { headers: { 'Content-Type': 'text/x-script' } }) },
  ])('should send the every-response headers on a $kind response', async ({ response }) => {
    const answered = (await rootMiddleware(args, async () => response())) as Response;

    expect(
      Object.fromEntries(Object.keys(everyResponseHeaders).map((name) => [name, answered.headers.get(name)])),
    ).toEqual(everyResponseHeaders);
  });

  it('should send them on a thrown redirect, and keep a value a route set itself', async () => {
    const thrown = await Promise.resolve(
      rootMiddleware(args, async () => {
        // oxlint-disable-next-line @typescript-eslint/only-throw-error -- React Router's redirect is a thrown Response.
        throw redirect('/legal/terms/', { headers: { 'Referrer-Policy': 'same-origin' } });
      }),
    ).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect((thrown as Response).headers.get('Referrer-Policy')).toBe('same-origin');
  });
});
