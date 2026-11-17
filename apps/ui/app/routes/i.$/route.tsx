import { redirect } from 'react-router';
import type { Route } from './+types/route.js';

/**
 * Splat route for /i/* - redirects to /import/*
 *
 * Handles path-based GitHub URLs like:
 * - /i/https://github.com/owner/repo → /import/https://github.com/owner/repo
 * - /i/https://github.com/owner/repo?ref=main → /import/https://github.com/owner/repo?ref=main
 */
export const loader = async ({ url, params }: Route.LoaderArgs): Promise<Response> => {
  const splatPath = params['*'];

  const redirectPath = `/import/${splatPath}`;
  return redirect(redirectPath + url.search);
};
