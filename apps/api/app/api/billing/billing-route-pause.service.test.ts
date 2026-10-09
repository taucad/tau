import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseRoutePauseArguments } from '#api/billing/billing-route-pause.service.js';

const complete = [
  '--environment',
  'staging',
  '--sku',
  'model:sonnet',
  '--reason',
  'Provider incident',
  '--actor',
  'op',
];

describe('parseRoutePauseArguments', () => {
  it('should parse a pause with every option', () => {
    expect(parseRoutePauseArguments(['pause-route', ...complete])).toEqual({
      command: 'pause-route',
      request: { environment: 'staging', sku: 'model:sonnet', reason: 'Provider incident', actor: 'op' },
    });
  });

  it('should parse a resume regardless of option order', () => {
    expect(
      parseRoutePauseArguments([
        'resume-route',
        '--actor',
        'op',
        '--reason',
        'Provider recovered',
        '--sku',
        'model:sonnet',
        '--environment',
        'staging',
      ]),
    ).toEqual({
      command: 'resume-route',
      request: { environment: 'staging', sku: 'model:sonnet', reason: 'Provider recovered', actor: 'op' },
    });
  });

  it('should refuse a command without an actor or a reason', () => {
    expect(() =>
      parseRoutePauseArguments(['pause-route', '--environment', 'staging', '--sku', 'model:sonnet', '--reason', 'x']),
    ).toThrow('Usage: pause-route --environment ENVIRONMENT --sku SKU --reason TEXT --actor TEXT');
    expect(() =>
      parseRoutePauseArguments(['resume-route', '--environment', 'staging', '--sku', 'model:sonnet', '--actor', 'op']),
    ).toThrow('Usage: resume-route --environment ENVIRONMENT --sku SKU --reason TEXT --actor TEXT');
  });

  it('should refuse unknown options and extra positionals', () => {
    expect(() => parseRoutePauseArguments(['pause-route', ...complete, '--force'])).toThrow("Unknown option '--force'");
    expect(() => parseRoutePauseArguments(['pause-route', 'now', ...complete])).toThrow('Usage: pause-route');
  });

  it('should refuse an unknown environment, a malformed SKU and a blank reason', () => {
    expect(() => parseRoutePauseArguments(['pause-route', ...complete.with(1, 'production')])).toThrow(ZodError);
    expect(() => parseRoutePauseArguments(['pause-route', ...complete.with(3, 'model sonnet')])).toThrow(ZodError);
    expect(() => parseRoutePauseArguments(['pause-route', ...complete.with(5, '   ')])).toThrow(ZodError);
  });

  it('should refuse any other subcommand', () => {
    expect(() => parseRoutePauseArguments(['sync', ...complete])).toThrow(
      'Route pause commands are pause-route and resume-route',
    );
  });
});
