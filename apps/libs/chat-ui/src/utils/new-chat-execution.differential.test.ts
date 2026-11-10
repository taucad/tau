// @vitest-environment node
/**
 * Differential test of the new-chat default against the Lean model `specs/lean/NewChatExecution.lean` (FM-R10).
 *
 * The corpus is regenerated from its seed and byte-compared with the committed `specs/lean/corpus/<corpus>.trace`;
 * `resolveNewChatExecution` and `tauModelReadiness` then answer every query, and their lines must equal the Lean
 * goldens `<corpus>.expected`. `ui:formal:lean` regenerates the goldens with the oracle and fails on stale ones, so
 * this test needs no Lean. `FORMAL_UPDATE=1` rewrites the traces; the oracle's header is the line-format reference.
 *
 * Ids map to strings one way: model `n` is `m<n>`, host `n` is `h<n>`, level `n` is `reasoningLevels[n]`, and
 * external selection `n` is agent `a<n>` on the desktop host.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CadAgentExecution, TauAgentExecution } from '@taucad/chat';
import { reasoningLevels } from '@taucad/chat/constants';
import { resolveNewChatExecution, tauModelReadiness } from '#utils/new-chat-execution.js';
import type { ModelCatalog } from '#utils/new-chat-execution.js';

const corpusDirectory = fileURLToPath(new URL('../../specs/lean/corpus/', import.meta.url));
const updating = process.env['FORMAL_UPDATE'] === '1';

// ponytail: mulberry32; a new generator rewrites the corpus.
/* eslint-disable no-bitwise -- mulberry32 is bit mixing */
const randomOf = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};
/* eslint-enable no-bitwise -- end of mulberry32 */

type Tau = readonly [model: number, host: number | undefined, effort: number | undefined];
type Case = {
  readonly catalog: 'loading' | 'unavailable' | ReadonlyArray<readonly [id: number, recommended: boolean]>;
  readonly lastTau: Tau;
  readonly last: undefined | { readonly tau: Tau } | { readonly acp: number };
  readonly probe: number;
};

const optionText = (value: number | undefined): string => (value === undefined ? '-' : String(value));
const tauText = ([model, host, effort]: Tau): string => `${model} ${optionText(host)} ${optionText(effort)}`;

const tauExecution = ([model, host, effort]: Tau): TauAgentExecution => ({
  kind: 'tau',
  model: `m${model}`,
  ...(host === undefined ? {} : { hostId: `h${host}` }),
  ...(effort === undefined ? {} : { effort: reasoningLevels[effort]! }),
});
const catalogOf = (catalog: Case['catalog']): ModelCatalog =>
  typeof catalog === 'string'
    ? { status: catalog }
    : { status: 'loaded', models: catalog.map(([id, recommended]) => ({ id: `m${id}`, recommended })) };
const resultText = (execution: CadAgentExecution): string =>
  execution.kind === 'acp'
    ? `R acp ${execution.agentId.slice(1)}`
    : `R tau ${execution.model.slice(1)} ${execution.hostId?.slice(1) ?? '-'} ${
        execution.effort === undefined ? '-' : String(reasoningLevels.indexOf(execution.effort))
      }`;

const generate = (seed: number, count: number): Case[] => {
  const random = randomOf(seed);
  const below = (n: number): number => Math.floor(random() * n);
  const maybe = (n: number): number | undefined => (random() < 0.4 ? undefined : below(n));
  const tau = (): Tau => [below(6), maybe(3), maybe(reasoningLevels.length)];
  return Array.from({ length: count }, (): Case => {
    const pick = random();
    const catalog =
      pick < 0.15
        ? 'loading'
        : pick < 0.3
          ? 'unavailable'
          : Array.from({ length: below(5) }, () => [below(6), random() < 0.3] as const);
    const kind = random();
    return {
      catalog,
      lastTau: tau(),
      last: kind < 0.3 ? undefined : kind < 0.6 ? { acp: below(4) } : { tau: tau() },
      probe: below(6),
    };
  });
};

const traceLines = (name: string, entry: Case): string[] => [
  `T ${name}`,
  typeof entry.catalog === 'string'
    ? `CAT ${entry.catalog}`
    : `CAT loaded ${entry.catalog.length === 0 ? '-' : entry.catalog.map(([id, r]) => `${id}:${r ? 1 : 0}`).join(',')}`,
  `LASTTAU ${tauText(entry.lastTau)}`,
  entry.last === undefined
    ? 'LAST none'
    : 'acp' in entry.last
      ? `LAST acp ${entry.last.acp}`
      : `LAST tau ${tauText(entry.last.tau)}`,
  'RESOLVE',
  `READY ${entry.probe}`,
];

const typescriptLines = (name: string, entry: Case): string[] => {
  const catalog = catalogOf(entry.catalog);
  const last =
    entry.last === undefined
      ? undefined
      : 'acp' in entry.last
        ? ({ kind: 'acp', hostId: 'desktop', agentId: `a${entry.last.acp}` } as const)
        : tauExecution(entry.last.tau);
  const readiness = tauModelReadiness(`m${entry.probe}`, catalog);
  return [
    `T ${name}`,
    resultText(resolveNewChatExecution({ last, lastTau: tauExecution(entry.lastTau), catalog })),
    `Q ${readiness}`,
  ];
};

const corpora = [{ name: 'base', seed: 20_261_004, count: 600 }] as const;

describe('NewChatExecution differential (Lean goldens)', () => {
  for (const corpus of corpora) {
    const cases = generate(corpus.seed, corpus.count);
    const traceFile = `${corpusDirectory}${corpus.name}.trace`;

    it(`should regenerate the committed ${corpus.name} corpus from seed ${corpus.seed}`, () => {
      const text = `${cases.flatMap((entry, index) => traceLines(`c${index}`, entry)).join('\n')}\n`;
      if (updating) {
        writeFileSync(traceFile, text);
      }

      expect(text).toBe(readFileSync(traceFile, 'utf8'));
    });

    it.skipIf(updating)(`should match the Lean goldens on the ${corpus.name} corpus`, () => {
      const lean = readFileSync(`${corpusDirectory}${corpus.name}.expected`, 'utf8').split('\n').filter(Boolean);
      const typescript = cases.flatMap((entry, index) => typescriptLines(`c${index}`, entry));
      const first = typescript.findIndex((line, index) => line !== lean[index]);

      expect(first === -1 ? undefined : { line: first + 1, typescript: typescript[first], lean: lean[first] }).toBe(
        undefined,
      );
      expect(typescript).toHaveLength(lean.length);
    });
  }
});
