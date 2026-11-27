import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Mutant, MutantResult } from '#mutants.js';
import { mutantEnv, mutantLine, runMutants } from '#mutants.js';
import { processSlots } from '#slots.js';

describe('mutantEnv', () => {
  it('should drop the fresh-seed request and keep the simulated behaviours', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables
    const env = { FORMAL_FRESH_TRACES: '20000', FORMAL_SIMULATED: 'out/simulated', PATH: '/bin' };

    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables
    expect(mutantEnv(env)).toEqual({ FORMAL_SIMULATED: 'out/simulated', PATH: '/bin' });
    expect(env.FORMAL_FRESH_TRACES).toBe('20000');
  });
});

describe('runMutants', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /** A project whose Lean mutants each edit `specs/lean/Model.lean`; the last one no longer matches. */
  const project = (count: number): { readonly root: string; readonly mutants: Mutant[] } => {
    const root = mkdtempSync(path.join(tmpdir(), 'formal-mutants-'));
    roots.push(root);
    mkdirSync(path.join(root, 'specs/lean'), { recursive: true });
    writeFileSync(
      path.join(root, 'specs/lean/Model.lean'),
      Array.from({ length: count }, (_unused, index) => `def rule${String(index)} := true`).join('\n'),
    );
    const mutants = Array.from({ length: count + 1 }, (_unused, index) => ({
      id: `M${String(index)}`,
      drift: `drift ${String(index)}`,
      file: 'specs/lean/Model.lean',
      find: `def rule${String(index)} := true`,
      replace: `def rule${String(index)} := false`,
    }));
    writeFileSync(path.join(root, 'specs/lean/mutants.json'), JSON.stringify(mutants));
    return { root, mutants };
  };

  it('should run mutants side by side within the slots and report them in mutants.json order', async () => {
    const { root, mutants } = project(8);
    const lines: string[] = [];
    const edits: string[] = [];
    let running = 0;
    let peak = 0;
    // Later mutants finish first, and M5 survives: the report must not follow the finishing order.
    const lean = async (mutant: Mutant, mutated: string): Promise<MutantResult> => {
      running += 1;
      peak = Math.max(peak, running);
      const index = Number(mutant.id.slice(1));
      await new Promise((resolve) => {
        setTimeout(resolve, (8 - index) * 3);
      });
      running -= 1;
      edits.push(mutated.split('\n')[index] ?? '');
      return index === 5 ? { id: mutant.id, verdict: 'survived' } : { id: mutant.id, verdict: 'caught', detail: 'x' };
    };

    const { results, failures } = await runMutants(
      { root, env: {} },
      { projectRoot: root, lean, log: (line) => lines.push(line), slots: processSlots(3) },
    );

    expect(peak).toBe(3);
    expect(edits.toSorted()).toEqual(
      Array.from({ length: 8 }, (_unused, index) => `def rule${String(index)} := false`),
    );
    expect(results.map((result) => `${result.id}:${result.verdict}`)).toEqual([
      'M0:caught',
      'M1:caught',
      'M2:caught',
      'M3:caught',
      'M4:caught',
      'M5:survived',
      'M6:caught',
      'M7:caught',
      'M8:stale',
    ]);
    expect(failures).toBe(2);
    expect(lines).toEqual(mutants.map((mutant, index) => mutantLine(mutant, results[index]!)));
  });

  it('should give the same verdicts and lines with one slot as with many', async () => {
    const { root } = project(6);
    const lean = async (mutant: Mutant): Promise<MutantResult> => ({
      id: mutant.id,
      verdict: Number(mutant.id.slice(1)) % 2 === 0 ? 'caught' : 'survived',
    });
    const serial: string[] = [];
    const parallel: string[] = [];

    await runMutants(
      { root, env: {} },
      { projectRoot: root, lean, log: (line) => serial.push(line), slots: processSlots(1) },
    );
    await runMutants(
      { root, env: {} },
      { projectRoot: root, lean, log: (line) => parallel.push(line), slots: processSlots(4) },
    );

    expect(parallel).toEqual(serial);
    expect(serial).toHaveLength(7);
  });
});
