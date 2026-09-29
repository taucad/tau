import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { apalacheCommand, compressTrace, parseApalacheOutput, parseTlcOutput, tlcCommand } from '#tlc.js';

const fixture = (name: string): string => readFileSync(path.join(import.meta.dirname, 'fixtures/tlc', name), 'utf8');

describe('parseTlcOutput', () => {
  it('should read pass, violation, deadlock, postcondition failure and assumption error', () => {
    expect({
      pass: parseTlcOutput(fixture('pass.out')),
      invariant: parseTlcOutput(fixture('invariant.out')),
      temporal: parseTlcOutput(fixture('temporal.out')),
      l6: parseTlcOutput(fixture('l6-reuse.out')),
      chatlog: parseTlcOutput(fixture('chatlog-deadlock.out')),
      postcondition: parseTlcOutput(fixture('postcondition.out')),
      assumption: parseTlcOutput(fixture('null-assumption.out')),
      simulation: parseTlcOutput(fixture('simulation.out')),
    }).toEqual({
      pass: 'pass',
      invariant: { violated: 'NoUnretiredLease' },
      temporal: { violated: 'CompletedRunEventuallySettled' },
      l6: { violated: 'NoReuseOfClosingLauncher' },
      chatlog: { rejected: { row: 6, rules: ['SequenceContiguous'] } },
      postcondition: { rejected: { row: 2, rules: [] } },
      assumption: {
        error: 'Error: Evaluating assumption line 6, col 8 to line 6, col 32 of module ProbeTrace failed.',
      },
      simulation: 'pass',
    });
  });

  it('should never pass output that states no verdict', () => {
    expect([parseTlcOutput(''), parseTlcOutput('TLC2 Version 2026.09.23\nStarting...')]).toEqual([
      { error: 'no verdict in TLC output' },
      { error: 'no verdict in TLC output' },
    ]);
  });
});

describe('tlcCommand', () => {
  it('should never pass -cleanup', () => {
    const { args } = tlcCommand({
      tools: {
        java: { bin: 'java', major: 25 },
        tlc: { jar: '/cache/tla2tools.jar', community: '/cache/CommunityModules-deps.jar' },
      },
      module: '/specs/AttachGeneration.tla',
      config: 'AttachGeneration.reuse.cfg',
      metadir: '/cache/tlc/run',
    });

    expect(args).not.toContain('-cleanup');
    expect(args).toEqual(
      expect.arrayContaining([
        '-Xmx1g',
        '-workers',
        '2',
        '-metadir',
        '/cache/tlc/run',
        '-noGenerateSpecTE',
        'AttachGeneration.tla',
      ]),
    );
  });
});

describe('compressTrace', () => {
  it('should print one line per step with only the changed variables', () => {
    const lines = compressTrace(fixture('chatlog-deadlock.out'));

    expect(lines[0]).toMatch(/^State 1 Initial: row=1; next=\[ type \|-> "run.lifecycle"/);
    expect(lines[1]).toMatch(/^State 2 Action: row=2; next=/);
    expect(lines.every((line) => !line.includes('broken={}') || line.startsWith('State 1'))).toBe(true);
  });
});

describe('parseApalacheOutput', () => {
  it('should read NoError and Error from recorded S4 runs, and never pass unreadable output', () => {
    expect([
      parseApalacheOutput(fixture('apalache-noerror.out')),
      parseApalacheOutput(fixture('apalache-error.out')),
      parseApalacheOutput('Parsing file X.tla'),
    ]).toEqual(['NoError', 'Error', { error: 'no outcome in Apalache output' }]);
  });
});

describe('apalacheCommand', () => {
  it('should cap the heap and keep Apalache output in the given directory', () => {
    const { args } = apalacheCommand(
      { java: { bin: 'java', major: 21 }, apalache: { jar: '/cache/apalache.jar' } },
      { args: ['check', '--length=0', 'MC.tla'], outDirectory: '/cache/run' },
    );

    expect(args).toEqual([
      '-Xmx1500m',
      '-XX:+UseG1GC',
      '-Djava.io.tmpdir=/cache/run',
      '-jar',
      '/cache/apalache.jar',
      'check',
      '--out-dir=/cache/run',
      '--run-dir=/cache/run/run',
      '--length=0',
      'MC.tla',
    ]);
  });
});
