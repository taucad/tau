import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMachine } from 'xstate';
import type { AnyStateMachine } from 'xstate';
import { afterEach, describe, expect, it } from 'vitest';
import type { DriftManifest, TimeoutRow } from '#drift.js';
import {
  checkActionCorrespondence,
  checkDriftManifest,
  checkTimerInventory,
  driftManifestProblems,
  machineActions,
  machineAlphabet,
  specOperators,
} from '#drift.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const manifestFile = (manifest: DriftManifest): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'formal-drift-'));
  roots.push(root);
  const file = path.join(root, 'Turn/drift.json');
  expect(driftManifestProblems(file, manifest, true)).toEqual([]);
  return file;
};

/* Untyped fixtures: only the configs' shape matters to the alphabet. */
const machine = (config: unknown): AnyStateMachine => createMachine(config as Parameters<typeof createMachine>[0]);

const before = machine({
  id: 'turn',
  initial: 'idle',
  states: { idle: { on: { start: 'busy' } }, busy: { on: { finish: 'idle' }, after: { 1000: 'idle' } } },
});
const after = machine({
  id: 'turn',
  initial: 'idle',
  states: {
    idle: { on: { start: 'busy' } },
    busy: { on: { finish: 'idle', cancel: 'idle' }, after: { 1000: 'idle' } },
  },
});

const manifest = (subject: AnyStateMachine, overrides: Partial<DriftManifest> = {}): DriftManifest => ({
  alphabet: machineAlphabet([subject]),
  versions: { turn: '1' },
  tables: {},
  specs: { 'Turn.tla': 'sha-1' },
  ...overrides,
});

describe('machineAlphabet', () => {
  it('should collect public event types and drop xstate.* and eventless entries', () => {
    expect(machineAlphabet([after])).toEqual(['cancel', 'finish', 'start']);
  });
});

describe('drift manifest', () => {
  it('should fail when a machine gains an event and no spec file changed', () => {
    const file = manifestFile(manifest(before));
    const rebuilt = manifest(after);

    expect(checkDriftManifest(file, rebuilt)).toEqual([
      'Turn/drift.json: alphabet changed; touch the spec and run formal update',
    ]);
    expect(driftManifestProblems(file, rebuilt, true)).toEqual([
      'alphabet changed but no spec file did: change the spec first (models before code)',
    ]);
  });

  it('should fail when the alphabet changed and version did not', () => {
    const file = manifestFile(manifest(before));

    expect(driftManifestProblems(file, manifest(after, { specs: { 'Turn.tla': 'sha-2' } }), true)).toEqual([
      'the alphabet changed but no machine version did: bump the machine version (MC-R21)',
    ]);
  });

  it('should refuse to rewrite a manifest whose alphabet or sources changed without a spec change', () => {
    const file = manifestFile(manifest(before, { sources: { 'credit-ledger.service.ts': 'sha-a' } }));

    expect(
      driftManifestProblems(file, manifest(before, { sources: { 'credit-ledger.service.ts': 'sha-b' } }), true),
    ).toEqual(['sources changed but no spec file did: change the spec first (models before code)']);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ sources: { 'credit-ledger.service.ts': 'sha-a' } });
  });

  it('should rewrite the manifest when the spec and version moved with the alphabet', () => {
    const file = manifestFile(manifest(before));
    const rebuilt = manifest(after, { specs: { 'Turn.tla': 'sha-2' }, versions: { turn: '2' } });

    expect(driftManifestProblems(file, rebuilt, true)).toEqual([]);
    expect(checkDriftManifest(file, rebuilt)).toEqual([]);
  });
});

describe('action correspondence', () => {
  const annotated = machine({
    id: 'turn',
    initial: 'idle',
    states: {
      idle: { on: { start: { target: 'busy', meta: { tla: 'Start' } } } },
      busy: { on: { finish: { target: 'idle', meta: { tla: 'Finsh' } } } },
    },
  });
  const spec = 'Start == TRUE\nFinish(t) == TRUE\nCrash == TRUE\nNext == Start \\/ Finish(1) \\/ Crash\n';

  it('should report a meta.tla the spec does not define and a spec action no transition names', () => {
    const actions = machineActions([annotated]);

    expect(actions).toEqual({ 'turn.busy.finish': 'Finsh', 'turn.idle.start': 'Start' });
    expect(
      checkActionCorrespondence(actions, {
        operators: specOperators(spec),
        next: ['Start', 'Finish', 'Crash'],
        environment: ['Crash'],
      }),
    ).toEqual([
      'meta.tla names Finsh, which the spec does not define',
      'spec action Finish is named by no transition and is not an environment action',
    ]);
  });
});

describe('checkTimerInventory', () => {
  const table: TimeoutRow[] = [
    {
      id: 'A1',
      site: 'packages/revisions/src/turn.machine.ts',
      token: 'turnCutSettlementMilliseconds',
      class: 'Peer',
      owner: 'W5',
      fixedBy: 'W5',
    },
    {
      id: 'B2',
      site: 'apps/ui/app/services/agent-host-client.ts',
      token: 'leaderResponseTimeout',
      class: 'Peer',
      owner: 'W4',
    },
  ];

  it('should report a timer site with no timeout-table row', () => {
    const files = {
      'packages/revisions/src/turn.machine.ts': "after: {\n  [turnCutSettlementMilliseconds]: 'failed',\n},\n",
      'apps/ui/app/services/agent-host-client.ts':
        'const leaderResponseTimeout = 5000;\nsetTimeout(() => reject(), leaderResponseTimeout);\nsetTimeout(retry, 250);\n',
    };

    expect(checkTimerInventory(files, table)).toEqual([
      'apps/ui/app/services/agent-host-client.ts:3: timer site with no timeout-table row',
      'B2: a peer wait names the work package that deletes it (fixedBy)',
    ]);
  });

  it('should report a row whose token is gone from its site', () => {
    expect(
      checkTimerInventory({ 'packages/revisions/src/turn.machine.ts': 'export const nothing = 1;\n' }, [table[0]!]),
    ).toEqual(['A1: token turnCutSettlementMilliseconds no longer appears in packages/revisions/src/turn.machine.ts']);
  });
});
