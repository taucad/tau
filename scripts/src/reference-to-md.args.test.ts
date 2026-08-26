import { describe, expect, it } from 'vitest';

import { parseReferenceArgs, referenceUsage } from '#reference-to-md.args.js';
import type { ReferenceCliOptions } from '#reference-to-md.args.js';

const parseRun = (argv: readonly string[]): ReferenceCliOptions => {
  const parsed = parseReferenceArgs(argv);
  if (parsed.kind !== 'run') {
    throw new Error('expected run parser result');
  }
  return parsed.options;
};

describe('parseReferenceArgs', () => {
  it('should default to syncing every matching reference', () => {
    expect(parseRun([])).toEqual({ command: 'sync', ids: [], group: undefined, force: false });
  });

  it('should parse commands, ids, groups, force, and help', () => {
    expect(parseRun(['convert', 'paper-a', 'paper-b'])).toEqual({
      command: 'convert',
      ids: ['paper-a', 'paper-b'],
      group: undefined,
      force: false,
    });
    expect(parseRun(['download', '--group=vision', '--force'])).toEqual({
      command: 'download',
      ids: [],
      group: 'vision',
      force: true,
    });
    expect(parseReferenceArgs(['--help'])).toEqual({ kind: 'help' });
  });

  it('should treat leading non-command positions as sync ids', () => {
    expect(parseRun(['paper-a'])).toEqual({ command: 'sync', ids: ['paper-a'], group: undefined, force: false });
  });

  it('should reject invalid group and option combinations', () => {
    expect(() => parseReferenceArgs(['--group='])).toThrow('--group requires a group name');
    expect(() => parseReferenceArgs(['sync', 'paper-a', '--group', 'vision'])).toThrow(
      'use either explicit reference ids or --group, not both',
    );
    expect(() => parseReferenceArgs(['--unknown'])).toThrow(/unknown/i);
  });
});

describe('referenceUsage', () => {
  it('should name the selected Nx target', () => {
    expect(referenceUsage('text-to-md')).toContain('scripts:text-to-md');
  });
});
