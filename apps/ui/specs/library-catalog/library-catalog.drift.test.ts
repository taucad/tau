import path from 'node:path';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles, machineActions, machineAlphabet } from '@taucad/formal/drift';
import { libraryAccessMachine, libraryAccessQueryMachine } from '#machines/library-access.machine.js';
import { libraryDiscoveryMachine } from '#machines/library-discovery.machine.js';
import { libraryRecoveryMachine } from '#machines/library-recovery.machine.js';

const specs = import.meta.dirname;
const workspace = path.resolve(specs, '../../../..');
const configs = readdirSync(specs)
  .filter((file) => file.endsWith('.cfg'))
  .sort();
const machines = [libraryDiscoveryMachine, libraryRecoveryMachine, libraryAccessMachine, libraryAccessQueryMachine];

/*
 * The manifest ties the model to the machines that refine it (their alphabets, versions and `meta.tla` actions, and
 * their files), to the service that runs them (`ProjectLibrary`, since A3b), to the commands that journal and apply
 * mutations (`ProjectCommands`, since A4a) and to the code its `today` configurations describe. The conformance replay of
 * `LibraryCatalog/suite.json` is `library-catalog.conformance.test.ts`.
 */
describe('LibraryCatalog.tla implementation correspondence', () => {
  it('should require review of the model when the library machines or the code it describes change', () => {
    expect(
      driftManifestProblems(path.join(specs, 'LibraryCatalog/drift.json'), {
        alphabet: machineAlphabet(machines),
        versions: Object.fromEntries(machines.map((machine) => [machine.id, String(machine.version)])),
        actions: machineActions(machines),
        tables: hashFiles(specs, ['expected.json', ...configs]),
        sources: hashFiles(workspace, [
          'apps/ui/app/hooks/use-project-manager.tsx',
          'apps/ui/app/machines/library-discovery.machine.ts',
          'apps/ui/app/machines/library-recovery.machine.ts',
          'apps/ui/app/machines/library-access.machine.ts',
          'apps/ui/app/runtime/project-library.ts',
          'apps/ui/app/runtime/project-library-commands.ts',
        ]),
        specs: hashFiles(specs, ['LibraryCatalog.tla']),
      }),
    ).toEqual([]);
  });
});
