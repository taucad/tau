import path from 'node:path';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles } from '@taucad/formal/drift';

const specs = import.meta.dirname;
const workspace = path.resolve(specs, '../../../..');

/**
 * The seam's verbs: the model's action labels (`Labels` in ProjectFocus.tla, without `Init`). No focus
 * machine exists yet; the lane that builds it replaces this list with its machine's alphabet and version.
 */
const alphabet = [
  'AccessAnswered',
  'AccessAsked',
  'BudgetSwitchClose',
  'ChatForwarded',
  'ChatReady',
  'CloseFlushFailed',
  'Edit',
  'FirstCheckSettled',
  'FlushRegistered',
  'IdleExpired',
  'LeaveFlushSettled',
  'LeaveFlushStarted',
  'LibraryChanged',
  'ModuleLoaded',
  'OpenAsked',
  'OpenBoundPassed',
  'OpenJoined',
  'OpenLost',
  'PersonClosed',
  'PersonDiscarded',
  'PersonOpenAsked',
  'Retry',
  'RouteCommitted',
  'RouteHeard',
  'SessionClosed',
];

describe('ProjectFocus.tla implementation correspondence', () => {
  it('should require review of the model when the route, focus or session-mount seam changes', () => {
    expect(
      driftManifestProblems(path.join(specs, 'ProjectFocus/drift.json'), {
        alphabet,
        tables: hashFiles(specs, ['expected.json', ...readdirSync(specs).filter((file) => file.endsWith('.cfg'))]),
        // The today code the model describes. The registry (sessions.machine) is environment here.
        sources: hashFiles(workspace, [
          'apps/ui/app/routes/w.$workspace.$project/project-route.tsx',
          'apps/ui/app/routes/w.$workspace.$project/project-route-state.ts',
          'apps/ui/app/routes/w.$workspace.$project/project-live-sessions.tsx',
        ]),
        specs: hashFiles(specs, ['ProjectFocus.tla']),
      }),
    ).toEqual([]);
  });
});
