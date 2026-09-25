/**
 * CL-A12: every consumer that folds a chat log calls the package's ledger export instead of keeping a fold of its own
 * (W3 §7, consumer table). The files are read as text: the check is that the export is the route, not what it does.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const source = (path: string) => readFileSync(`${root}${path}`, 'utf8');
const ledgerExport = /\b(foldChatLedger|foldReadAnswer|replayedStartOutcome|unsettledAttempts|mergeLogSegments)\b/u;
const lifecycleCheck = /type [!=]== 'run\.lifecycle'/u;
/** A scan: searching or filtering rows for lifecycle state, the shape of a private fold. */
const lifecycleScan = /\.(?:findLast|filter|findIndex|find|some)\([^\n]*'run\.lifecycle'/u;

/** Consumers that read a log and now fold it through the export. */
const folding = [
  'packages/agent-host/src/launchers/node/node-agent-launcher.ts',
  'apps/ui/app/workers/agent-host.impl.ts',
  'apps/ui/app/chat-clients/_internal/browser-agent-host-transport.ts',
  'apps/ui/app/db/chat-file-storage.ts',
  'packages/host/src/revisions.ts',
  'packages/cli/src/commands/agent/client.ts',
  'apps/ui-e2e/src/support/chat-admission-log.ts',
  'apps/desktop-e2e/src/support/acp-evidence.ts',
] as const;

/*
 * Files that still test `run.lifecycle` on a pushed row, each for a reason the ledger does not serve; the list is
 * closed, so a new scan fails this test until it is justified here.
 */
const pushedRowChecks: Readonly<Record<string, string>> = {
  // A live-stream wake signal and view reducer; W9's page projection replaces them.
  'apps/ui/app/chat-clients/_internal/browser-agent-host-transport.ts': 'live wake signal (W9)',
  // Also its attach loop (`replaySnapshot`) follows `nextCursor` without `foldReadAnswer`: a declared W9 deferral, as
  // W9's page projection replaces the loop.
  'apps/ui/app/services/agent-host-client.ts': 'live wake signal and attach loop (W9 deferral)',
  'packages/cli/src/tui/app.ts': 'view reducer over pushed rows (W9)',
  // Relays each pushed transition to the run directory; it keeps no fold and must read nothing but lifecycle (PH19).
  'packages/host/src/run-reporter.ts': 'directory relay (PH19)',
  // The attempt an external resume continues from; W7's attempt rows replace it.
  'packages/host/src/acp/run.ts': 'external resume attempt (W7)',
  'packages/host/src/revisions.ts': 'folded first; the row type selects the trigger',
  // The suite's own per-attempt oracle clauses, over attempts the ledger places.
  'apps/ui-e2e/src/support/chat-admission-log.ts': 'e2e oracle clauses over ledger attempts',
};

describe('fold consumers (CL-A12)', () => {
  it.each(folding)('should fold %s through the ledger export', (path) => {
    expect(source(path)).toMatch(ledgerExport);
  });

  it.each(Object.keys(pushedRowChecks))('should justify the lifecycle check left in %s', (path) => {
    expect(source(path)).toMatch(lifecycleCheck);
  });

  it('should keep no lifecycle scan in a folding consumer that is not justified', () => {
    const unjustified = folding.filter((path) => lifecycleScan.test(source(path)) && !(path in pushedRowChecks));

    expect(unjustified).toEqual([]);
  });
});
