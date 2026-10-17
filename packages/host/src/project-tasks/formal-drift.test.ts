/**
 * Node-tier drift gates for the task dispatch machine and the admission coordinator code path.
 * Manifests are rebuilt by the existing formal update helper; no actor snapshot or second runtime is involved.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkActionCorrespondence,
  driftManifestProblems,
  hashFiles,
  machineActions,
  machineAlphabet,
  specOperators,
} from '@taucad/formal/drift';
import { projectTaskDispatchMachine } from '#project-tasks/dispatch.machine.js';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const specs = path.join(projectRoot, 'specs/project-tasks');

// The admission model projects these commands into reservation, lineage and resource facts.
// Other coordinator commands remain covered by the source hash and their semantic tests.
const admissionAlphabet = [
  'admitContinuation',
  'admitRoot',
  'cancel',
  'close',
  'finishRoot',
  'recover',
  'resume',
  'spawn',
];

describe('project task formal drift gates', () => {
  it('keeps dispatch alphabet, version, static actions, execution sources and handwritten model current', () => {
    const machines = [projectTaskDispatchMachine];
    expect(
      driftManifestProblems(path.join(specs, 'ProjectTaskDispatch/drift.json'), {
        alphabet: machineAlphabet(machines),
        versions: Object.fromEntries(machines.map((machine) => [machine.id, String(machine.version)])),
        tables: {},
        sources: hashFiles(projectRoot, ['src/project-tasks/dispatch.machine.ts', 'src/project-tasks/dispatch.ts']),
        actions: machineActions(machines),
        specs: hashFiles(specs, ['ProjectTaskDispatch.tla']),
      }),
    ).toEqual([]);
  });

  it('registers every dispatch transition action against the handwritten model without an empty-action pass', () => {
    const actions = machineActions([projectTaskDispatchMachine]);
    expect(Object.keys(actions).length).toBeGreaterThan(0);
    expect(
      checkActionCorrespondence(actions, {
        operators: specOperators(readFileSync(path.join(specs, 'ProjectTaskDispatch.tla'), 'utf8')),
        next: ['Cancel', 'Settled', 'Failed', 'Recovered'],
        environment: ['Recovered'],
      }),
    ).toEqual([]);
  });

  it('keeps admission aggregate and protected journal sources tied to their bounded handwritten model', () => {
    expect(
      driftManifestProblems(path.join(specs, 'ProjectTaskAdmission/drift.json'), {
        alphabet: admissionAlphabet,
        tables: {},
        sources: hashFiles(projectRoot, [
          'src/project-tasks/coordinator.ts',
          'src/project-tasks/types.ts',
          'src/project-tasks/backend.ts',
          'src/project-tasks/store.ts',
          'src/project-tasks/projection.ts',
          'src/project-tasks/mailbox.ts',
          '../agent-host/src/wire/project-tasks.schema.ts',
        ]),
        specs: hashFiles(specs, ['ProjectTaskAdmission.tla']),
      }),
    ).toEqual([]);
  });
});
