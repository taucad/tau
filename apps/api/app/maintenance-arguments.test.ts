import { describe, expect, it } from 'vitest';
import { parseLfsIntegrityConcurrency } from '@taucad/api-git-mirror/maintenance/lfs-integrity';
import { optionalOperand, optionValue, requiredOperand } from '#maintenance-arguments.js';

const usage = 'Usage: revisions-maintenance <command>';

describe('maintenance command flags', () => {
  it('should read the value after a flag', () => {
    expect(optionValue(['restore', '--project', 'p-1'], 'project')).toBe('p-1');
    expect(optionValue(['restore'], 'project')).toBeUndefined();
  });

  it('should refuse a required flag that is absent, last or followed by another flag', () => {
    expect(requiredOperand(['restore', '--project', 'p-1'], 'project', usage)).toBe('p-1');
    expect(() => requiredOperand(['restore'], 'project', usage)).toThrow(/--project is required/u);
    expect(() => requiredOperand(['restore', '--project'], 'project', usage)).toThrow(/--project is required/u);
    expect(() => requiredOperand(['restore', '--project', '--confirm'], 'project', usage)).toThrow(
      /--project is required/u,
    );
  });

  it('should leave an absent optional flag unset but refuse one given without its value', () => {
    expect(optionalOperand(['relocate-lfs', '--confirm'], 'project', usage)).toBeUndefined();
    expect(() => optionalOperand(['relocate-lfs', '--confirm', '--project'], 'project', usage)).toThrow(
      /--project is required/u,
    );
  });

  it('should refuse lfs-integrity --concurrency without a value instead of using the default', () => {
    const concurrency = (args: readonly string[]): number =>
      parseLfsIntegrityConcurrency(optionalOperand(args, 'concurrency', usage));

    expect(concurrency(['lfs-integrity'])).toBe(8);
    expect(concurrency(['lfs-integrity', '--concurrency', '4'])).toBe(4);
    expect(() => concurrency(['lfs-integrity', '--concurrency'])).toThrow(/--concurrency is required/u);
  });
});
