import type { ActionFunction } from 'react-router';
import { readThemeCookie } from '#theme-cookie.js';
import { destroyThemeCookie } from '#theme-cookie.server.js';

/**
 * Move a theme chosen before the client-facts record into it, once per device (progressive loading P2). The choice
 * used to live in an `HttpOnly` cookie, which script cannot read; the client posts here once, takes the answer into the
 * record and the cookie is expired. Same-origin only, since the response expires a cookie. Delete this route once the
 * cookie's lifetime has passed for every visitor.
 */
export const action: ActionFunction = async ({ request }) => {
  if (request.headers.get('Origin') !== new URL(request.url).origin) {
    return new Response(undefined, { status: 403 });
  }
  const theme = await readThemeCookie(request);
  const hasCookie = /(?:^|;\s*)tau-theme=/u.test(request.headers.get('Cookie') ?? '');
  return Response.json(
    { theme },
    hasCookie ? { headers: { 'Set-Cookie': await destroyThemeCookie(request.url) } } : undefined,
  );
};
