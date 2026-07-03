import { describe, expect, it } from 'vitest';

import { parsePdfToMdArgs } from '#pdf-to-md.args.js';
import type { PdfToMdOptions } from '#pdf-to-md.args.js';

const parseRun = (argv: readonly string[]): PdfToMdOptions => {
  const parsed = parsePdfToMdArgs(argv);
  if (parsed.kind !== 'run') {
    throw new Error('expected run parser result');
  }

  return parsed.options;
};

describe('parsePdfToMdArgs', () => {
  it('should default to sync for every reference when no args are provided', () => {
    expect(parseRun([])).toEqual({
      command: 'sync',
      ids: [],
      group: undefined,
      force: false,
    });
  });

  it('should parse an explicit command with reference ids', () => {
    expect(parseRun(['convert', 'paper-a', 'paper-b'])).toEqual({
      command: 'convert',
      ids: ['paper-a', 'paper-b'],
      group: undefined,
      force: false,
    });
  });

  it('should treat leading non-command positionals as reference ids for sync', () => {
    expect(parseRun(['paper-a', 'paper-b'])).toEqual({
      command: 'sync',
      ids: ['paper-a', 'paper-b'],
      group: undefined,
      force: false,
    });
  });

  it('should parse long group options', () => {
    expect(parseRun(['download', '--group', 'vision']).group).toBe('vision');
    expect(parseRun(['download', '--group=world-models']).group).toBe('world-models');
  });

  it('should parse the short group option', () => {
    expect(parseRun(['validate', '-g', 'jepa'])).toEqual({
      command: 'validate',
      ids: [],
      group: 'jepa',
      force: false,
    });
  });

  it('should parse force', () => {
    expect(parseRun(['download', '--force', 'paper-a'])).toEqual({
      command: 'download',
      ids: ['paper-a'],
      group: undefined,
      force: true,
    });
  });

  it('should return help without building run options', () => {
    expect(parsePdfToMdArgs(['--help'])).toEqual({ kind: 'help' });
    expect(parsePdfToMdArgs(['-h'])).toEqual({ kind: 'help' });
  });

  it('should reject a missing group value', () => {
    expect(() => parsePdfToMdArgs(['--group'])).toThrow(/group/i);
  });

  it('should reject a blank group value', () => {
    expect(() => parsePdfToMdArgs(['--group='])).toThrow('--group requires a group name');
  });

  it('should reject group selection combined with explicit reference ids', () => {
    expect(() => parsePdfToMdArgs(['sync', 'paper-a', '--group', 'vision'])).toThrow(
      'use either explicit reference ids or --group, not both',
    );
  });

  it('should reject unknown options', () => {
    expect(() => parsePdfToMdArgs(['--unknown'])).toThrow(/unknown/i);
  });
});
