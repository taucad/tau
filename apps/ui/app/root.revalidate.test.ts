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

  it('should keep the default for a new pathname, an explicit revalidation and a submission', () => {
    expect(shouldRevalidate(navigation('/community', '/projects'))).toBe(true);
    expect(shouldRevalidate(navigation('/community?q=gear', '/community?q=gear'))).toBe(true);
    expect(shouldRevalidate(navigation('/community', '/community?q=gear', 'POST'))).toBe(true);
  });
});
