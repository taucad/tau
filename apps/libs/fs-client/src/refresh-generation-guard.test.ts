import { describe, it, expect } from 'vitest';
import { RefreshGenerationGuard } from '#refresh-generation-guard.js';

describe('RefreshGenerationGuard', () => {
  it('increments generations monotonically per path', () => {
    const guard = new RefreshGenerationGuard();
    expect(guard.begin('a.ts')).toBe(1);
    expect(guard.begin('a.ts')).toBe(2);
    expect(guard.begin('b.ts')).toBe(3);
  });

  it('marks stale generations when a newer begin ran', () => {
    const guard = new RefreshGenerationGuard();
    const first = guard.begin('a.ts');
    const second = guard.begin('a.ts');
    expect(guard.isCurrent('a.ts', second)).toBe(true);
    expect(guard.isCurrent('a.ts', first)).toBe(false);
  });

  it('reset clears current ownership without reusing old tokens', () => {
    const guard = new RefreshGenerationGuard();
    guard.begin('a.ts');
    guard.begin('b.ts');
    guard.reset('a.ts');
    expect(guard.begin('a.ts')).toBe(3);
    expect(guard.begin('b.ts')).toBe(4);
    guard.reset();
    expect(guard.begin('b.ts')).toBe(5);
  });

  it('never makes a pre-reset token current again', () => {
    const guard = new RefreshGenerationGuard();
    const stale = guard.begin('a.ts');
    guard.reset('a.ts');
    guard.begin('a.ts');
    expect(guard.isCurrent('a.ts', stale)).toBe(false);
  });
});
