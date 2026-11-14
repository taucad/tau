import path from 'node:path';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles, machineActions, machineAlphabet } from '@taucad/formal/drift';
import { createFocusMachine } from '#machines/focus.machine.js';

const specs = import.meta.dirname;
const workspace = path.resolve(specs, '../../../..');

/** The machine the target conforms to (A5a); its alphabet, version and `meta.tla` actions are the seam's verbs. */
const machine = createFocusMachine({ nativeKernelOf: () => undefined });

describe('ProjectFocus.tla implementation correspondence', () => {
  it('should require review of the model when the route, focus or session-mount seam changes', () => {
    expect(
      driftManifestProblems(path.join(specs, 'ProjectFocus/drift.json'), {
        alphabet: machineAlphabet([machine]),
        versions: { [machine.id]: String(machine.version) },
        actions: machineActions([machine]),
        tables: hashFiles(specs, ['expected.json', ...readdirSync(specs).filter((file) => file.endsWith('.cfg'))]),
        // The today code the model describes, the target's selector, which has no alphabet of its own, and the ports
        // that compose focus with its environment (A5b). The
        // registry (sessions.machine) is environment here.
        sources: hashFiles(workspace, [
          'apps/ui/app/machines/focus.route-state.ts',
          'apps/ui/app/routes/w.$workspace.$project/project-route.tsx',
          'apps/ui/app/routes/w.$workspace.$project/project-route-state.ts',
          'apps/ui/app/routes/w.$workspace.$project/project-live-sessions.tsx',
          'apps/ui/app/routes/w.$workspace.$project/project-route-intent.tsx',
          'apps/ui/app/runtime/app-runtime-focus.ts',
        ]),
        specs: hashFiles(specs, ['ProjectFocus.tla']),
      }),
    ).toEqual([]);
  });
});
