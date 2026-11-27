/**
 * G1, P1 and P5 over the golden corpus (cloud backup admission blueprint, Test plan).
 *
 * The corpus is every hand-built case in `corpus/corpus.json` and every object each writer leg wrote per release
 * since version 2 (`corpus/writers/*.json`, G2). Each is read and attributed under every join and viewer below.
 *
 * - G1: every answer equals `corpus/expected.json`, and the answers' digest equals the one `corpus/rules-ledger.json`
 *   records for the current `provenanceRules`. A change to any answer must bump `provenanceRules`; then
 *   `UPDATE_PROVENANCE_CORPUS=1 pnpm nx test revisions -- src/provenance/corpus.test.ts` rewrites the expected answers
 *   and appends the new digest. The ledger never rewrites an old entry.
 * - P1: no answer is an account other than the attested pusher, and none for `local` or `pending`.
 * - P5: every corpus object's id is the id of its bytes; the module has no writer to change them.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { attributionOf, provenanceRules, readCommit, readTag } from '#provenance/index.js';
import type { Attribution, Join, Viewer } from '#provenance/index.js';
import { coverageOf } from '#provenance/server.js';
import { writerPusher } from '#test/writer-scenarios.js';
import type { PinnedWriter } from '#test/writer-scenarios.js';

type Entry = Readonly<{
  id: string;
  rows: string;
  title: string;
  type: 'commit' | 'tag';
  ref: string;
  body: string;
  oid: string;
}>;
type Corpus = Readonly<{
  pusher: string;
  member: string;
  coverage: Readonly<{ identities: string[]; verifiedEmail: string; forgeId: string }>;
  deviceIdentities: string[];
  entries: readonly Entry[];
}>;

const directory = path.join(import.meta.dirname, 'corpus');
const readJson = <T>(file: string): T => JSON.parse(readFileSync(path.join(directory, file), 'utf8')) as T;
const corpus = readJson<Corpus>('corpus.json');
const writers = readdirSync(path.join(directory, 'writers'))
  .filter((file) => file.endsWith('.json'))
  .toSorted()
  .map((file) => readJson<PinnedWriter>(`writers/${file}`));

/** One case: its key in `expected.json`, its bytes, and the account that pushes it. */
type Case = Readonly<{
  key: string;
  type: 'commit' | 'tag';
  body: string;
  pusher: string;
  inputs: Parameters<typeof coverageOf>[1];
}>;

const cases: readonly Case[] = [
  ...corpus.entries.map((entry) => ({
    key: entry.id,
    type: entry.type,
    body: entry.body,
    pusher: corpus.pusher,
    inputs: { pusher: corpus.pusher, ...corpus.coverage },
  })),
  ...writers.flatMap((writer) =>
    writer.objects.map((object, index) => ({
      key: `${writer.release}#${String(index)} ${object.leg}: ${object.scenario}`,
      type: object.type,
      body: object.body,
      pusher: writerPusher,
      inputs: { pusher: writerPusher, identities: ['anon:5e1ea5ed'], forgeId: '1234567' },
    })),
  ),
];

/** Every join the host or server can hand the module for a case. */
const joinsOf = (item: Case): Readonly<Record<string, Join>> => {
  const push = { generation: 7, pusher: { kind: 'account', accountId: item.pusher }, viaDevice: false } as const;
  return {
    local: 'local',
    pending: 'pending',
    pushed: { push, bits: coverageOf(item.body, item.inputs) },
    pushedWithoutClaim: { push, bits: coverageOf(item.body, { ...item.inputs, identities: [] }) },
    pushedByMember: {
      push: { ...push, pusher: { kind: 'account', accountId: corpus.member } },
      bits: coverageOf(item.body, { pusher: corpus.member, identities: [] }),
    },
    hidden: { push: { generation: 7, pusher: { kind: 'hidden' }, viaDevice: false }, bits: {} },
    formerViaDevice: {
      push: { generation: 7, pusher: { kind: 'account', accountId: item.pusher, former: true }, viaDevice: true },
      bits: coverageOf(item.body, item.inputs),
    },
  };
};

const viewersOf = (item: Case): Readonly<Record<string, Viewer>> => ({
  owner: { accountId: item.pusher, owner: true, sharedProject: true, deviceIdentities: corpus.deviceIdentities },
  member: { accountId: corpus.member, owner: false, sharedProject: true, deviceIdentities: [] },
  solo: { accountId: item.pusher, owner: true, sharedProject: false, deviceIdentities: [] },
});

type Answers = Readonly<{ reading: unknown; attributions?: Readonly<Record<string, Attribution>> }>;

const answer = (item: Case): Answers => {
  if (item.type === 'tag') {
    return { reading: readTag(item.body) };
  }
  const reading = readCommit(item.body);
  const attributions: Record<string, Attribution> = {};
  for (const [joinName, join] of Object.entries(joinsOf(item))) {
    for (const [viewerName, viewer] of Object.entries(viewersOf(item))) {
      attributions[`${joinName}/${viewerName}`] = attributionOf(reading, join, viewer);
    }
  }
  return { reading, attributions };
};

const actual: Readonly<Record<string, Answers>> = Object.fromEntries(cases.map((item) => [item.key, answer(item)]));
const digest = createHash('sha256').update(JSON.stringify(actual)).digest('hex');
type Ledger = Readonly<{ $comment: string; rules: Readonly<Record<string, string>> }>;

if (process.env['UPDATE_PROVENANCE_CORPUS'] === '1') {
  const ledger = readJson<Ledger>('rules-ledger.json');
  const held = ledger.rules[String(provenanceRules)];
  if (held !== undefined && held !== digest) {
    throw new Error(`provenanceRules ${String(provenanceRules)} already pins other answers: bump provenanceRules.`);
  }
  /* One line per case keeps the file reviewable by diff and small. */
  const lines = Object.entries(actual).map(([key, answers]) => `  ${JSON.stringify(key)}: ${JSON.stringify(answers)}`);
  writeFileSync(path.join(directory, 'expected.json'), `{\n${lines.join(',\n')}\n}\n`);
  writeFileSync(
    path.join(directory, 'rules-ledger.json'),
    `${JSON.stringify({ ...ledger, rules: { ...ledger.rules, [String(provenanceRules)]: digest } }, undefined, 2)}\n`,
  );
}

const expected = readJson<Readonly<Record<string, Answers>>>('expected.json');
const ledger = readJson<Ledger>('rules-ledger.json');

describe('the provenance golden corpus', () => {
  it('holds every writer release since version 2 and the working tree', () => {
    expect(writers.map(({ release }) => release)).toContain('current');
    expect(writers.length).toBeGreaterThan(1);
    expect(corpus.entries.length).toBeGreaterThan(40);
  });

  it('G1: answers every entry as recorded', () => {
    expect(Object.keys(actual).toSorted()).toEqual(Object.keys(expected).toSorted());
    for (const [key, answers] of Object.entries(actual)) {
      expect(answers, key).toEqual(expected[key]);
    }
  });

  it('G1: the answers are the ones pinned for this provenanceRules, so a change cannot land unbumped', () => {
    expect(ledger.rules[String(provenanceRules)]).toBe(digest);
  });

  it('P1: never answers an account other than the attested pusher, and none unjoined', () => {
    for (const item of cases.filter(({ type }) => type === 'commit')) {
      const reading = readCommit(item.body);
      for (const [joinName, join] of Object.entries(joinsOf(item))) {
        for (const viewer of Object.values(viewersOf(item))) {
          const result = attributionOf(reading, join, viewer);
          const pusher =
            typeof join === 'string' || join.push.pusher.kind === 'hidden' ? undefined : join.push.pusher.accountId;
          const named =
            result.kind === 'account'
              ? result.accountId
              : result.kind === 'tauAgent' || result.kind === 'agent'
                ? result.for
                : undefined;
          if (named !== undefined) {
            expect(named, `${item.key} ${joinName}`).toBe(pusher);
          }
          if (typeof join === 'string') {
            expect(result.kind, `${item.key} ${joinName}`).not.toBe('account');
          }
          if (joinName === 'hidden') {
            expect(result.kind, item.key).toBe('anonymous');
          }
        }
      }
    }
  });

  it('P1: a forged record merged locally reads "On this device" after a restore, never the account', () => {
    const forged = corpus.entries.find(({ id }) => id === 'row01-signed-in')!;
    const owner: Viewer = { accountId: corpus.pusher, owner: true, sharedProject: true, deviceIdentities: [] };
    expect(attributionOf(readCommit(forged.body), 'local', owner)).toEqual({ kind: 'local' });
  });

  it('P5: every corpus object is the object its id names', () => {
    for (const entry of corpus.entries) {
      const bytes = new TextEncoder().encode(entry.body);
      const id = createHash('sha1')
        .update(`${entry.type} ${String(bytes.length)}\0`)
        .update(bytes)
        .digest('hex');
      expect(id, entry.id).toBe(entry.oid);
    }
  });

  it('reads every writer leg’s commit as a version 2 record and every version tag as a version', () => {
    for (const writer of writers) {
      for (const object of writer.objects) {
        const shape = object.type === 'tag' ? readTag(object.body).shape : readCommit(object.body).shape;
        expect(shape, `${writer.release}: ${object.scenario}`).toBe('tau/2');
      }
    }
  });
});
