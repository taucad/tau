import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { describe, expect, it } from 'vitest';
import { shouldRevalidate } from '#root.js';

const navigation = (from: string, to: string, formMethod?: 'POST'): ShouldRevalidateFunctionArgs => ({
  currentUrl: new URL(from, 'https://tau.new'),
  nextUrl: new URL(to, 'https://tau.new'),
  currentParams: {},
  nextParams: {},
  formMethod,
  defaultShouldRevalidate: true,
});

describe('root shouldRevalidate', () => {
  it('should skip the root loader when only the query string changes', () => {
    expect(shouldRevalidate(navigation('/community', '/community?q=gear'))).toBe(false);
    expect(shouldRevalidate(navigation('/community?q=gea', '/community?q=gear&kernel=replicad'))).toBe(false);
  });

  it('should skip the root loader for a new pathname (U23)', () => {
    expect(shouldRevalidate(navigation('/community', '/projects'))).toBe(false);
  });

  /* A navigation to the URL the router already holds is a revalidation to React Router. On a project URL it was the
   * only thing that asked for the root's `.data`, which the static-shell rewrite answers with the shell's HTML: the
   * page could not decode it and the root error boundary replaced the app (launch audit N-3, Sentry TAU-UI-1X). */
  it.each([
    ['a project URL', '/w/home/bracket-v2?chat=chat_1'],
    ['a server-rendered page', '/community?q=gear'],
  ])('should skip the root loader for a navigation to the URL already shown, on %s', (_name, url) => {
    expect(shouldRevalidate(navigation(url, url))).toBe(false);
  });

  it('should keep the default for a submission', () => {
    expect(shouldRevalidate(navigation('/community', '/community?q=gear', 'POST'))).toBe(true);
    expect(shouldRevalidate(navigation('/community', '/community', 'POST'))).toBe(true);
  });
});
