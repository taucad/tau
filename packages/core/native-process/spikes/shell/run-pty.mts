/**
 * S2 driver: run the PTY probe once per launch strategy and write a receipt per strategy.
 *
 * Builds the same candidate shell grant the S0/S1 probe uses, then spawns `pty-probe.mts` with the
 * profile, pinned Bash and the strategy, capturing its JSON. Both strategies are tried so the
 * report can record which one reaches a real terminal through the sandbox on this row; neither being
 * able to is a failed S2, recorded with its diagnostics.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { BashIdentity, ShellGrant } from './lib.mts';
import { fixtureRoot, identity, isWindows, resolveBash, shellProfile, spikeDirectory, writeJson } from './lib.mts';

const evidenceDirectory = process.env['TAU_SPIKE_OUT'] ?? join(process.cwd(), 'out', 'research', 'shell-spike');
const row = process.env['TAU_SPIKE_ROW'] ?? `${process.platform}-${process.arch}`;

const root = fixtureRoot();
const project = join(root, 'project');
const home = join(root, 'home');
const temporary = join(root, 'tmp');
for (const directory of [project, home, temporary]) {
  mkdirSync(directory, { recursive: true });
}

const bash: BashIdentity = resolveBash();
const grant: ShellGrant = { project, home, temporary, toolchain: isWindows ? [] : ['/usr/bin', '/bin'] };
const profile = shellProfile(grant);

const probe = async (
  strategy: 'direct' | 'relay',
): Promise<{ strategy: string; checks: unknown[]; verdict: string }> => {
  const child = spawn(process.execPath, [join(spikeDirectory, 'pty-probe.mts')], {
    stdio: ['pipe', 'pipe', 'inherit'],
    windowsHide: true,
    env: { ...process.env },
  });
  child.stdin.end(JSON.stringify({ profile, bash: bash.path, cwd: project, strategy, home, temporary }));
  let out = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
  const exitCode = await new Promise<number | null>((resolveExit) => child.once('close', resolveExit));
  const line = out
    .split('\n')
    .filter((row2) => row2.startsWith('{'))
    .at(-1);
  if (!line) {
    return {
      strategy,
      checks: [
        {
          id: `s2.${strategy}`,
          expect: 'the PTY probe reports results',
          observed: `no JSON (exit ${exitCode})`,
          verdict: 'fail',
        },
      ],
      verdict: 'fail',
    };
  }
  const parsed = JSON.parse(line) as { strategy: string; checks: Array<{ verdict: string }>; transcriptTail: string };
  return { ...parsed, verdict: parsed.checks.every((c) => c.verdict === 'pass') ? 'pass' : 'fail' };
};

const strategies = isWindows ? (['direct', 'relay'] as const) : (['direct', 'relay'] as const);
const results: Record<string, unknown> = {};
let anyPass = false;
for (const strategy of strategies) {
  // eslint-disable-next-line no-await-in-loop -- one shared sandbox at a time keeps the probe honest.
  const result = await probe(strategy);
  results[strategy] = result;
  anyPass ||= result.verdict === 'pass';
  writeJson(join(evidenceDirectory, row, `s2-${strategy}.json`), {
    spike: 'S2',
    strategy,
    identity: identity(row, project, bash),
    ...result,
  });
}

process.stdout.write(`${JSON.stringify({ row, s2: results, verdict: anyPass ? 'pass' : 'fail' }, undefined, 2)}\n`);
process.exit(anyPass ? 0 : 1);
