// @vitest-environment node
/**
 * S48(10) for the app-local session machines (I20, AC22, A38).
 *
 * `packages/revisions/src/machines.import-boundary.test.ts` holds this line for
 * the ten revision machines. The three session machines live in the app because
 * the resources they own are constructed from React-bound values (W19 §7.1) —
 * but the machines themselves are the same kind of thing, and the boundary is
 * what keeps that true: an `import { useEffect }` here is lifecycle logic that
 * only one host can run, and it is the first step of a session machine that can
 * never be driven from a test or a daemon.
 *
 * The seam to the page is `apps/ui/app/services/sessions-store.ts`, which
 * provides the actors; nothing below may reach for it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceDirectory = fileURLToPath(new URL('.', import.meta.url));

const sessionMachines = (): readonly string[] =>
  readdirSync(sourceDirectory).filter((entry) => entry.endsWith('.machine.ts') && entry.includes('session'));

const sourceOf = (name: string): string => readFileSync(join(sourceDirectory, name), 'utf8');

describe('session machine import boundary', () => {
  it('finds every session machine module', () => {
    expect(sessionMachines().toSorted()).toEqual([
      'chat-session.machine.ts',
      'project-session.machine.ts',
      'sessions.machine.ts',
    ]);
  });

  it('imports React, the DOM, the filesystem and the store from nowhere', () => {
    const forbidden =
      /from\s+'(?:react[^']*|react-dom[^']*|@taucad\/filesystem[^']*|@taucad\/revisions[^']*|#services\/[^']*|#hooks\/[^']*|#components\/[^']*)'/u;

    const offenders = sessionMachines().filter((name) => forbidden.test(sourceOf(name)));

    expect(offenders).toEqual([]);
  });

  it('touches no browser global', () => {
    /* `window`, `document` and `navigator` are the three a host supplies: a
     * machine that reads one of them cannot run in the Electron main process,
     * in a worker, or in the Node half of a two-client test. Comments are
     * stripped first, or an English sentence ending in "the window." reads as
     * a global access. */
    const offenders = sessionMachines().filter((name) =>
      /\b(?:window|document|navigator|localStorage)\s*\./u.test(
        sourceOf(name).replaceAll(/\/\*[\S\s]*?\*\/|\/\/.*$/gmu, ''),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it('exports exactly one machine value per module', () => {
    const exported = sessionMachines().map(
      (name) => [...sourceOf(name).matchAll(/^export const (\w+Machine) = setup\(/gmu)].length,
    );

    expect(exported).toEqual(sessionMachines().map(() => 1));
  });

  it('proves the check is not vacuous: the store that provides their actors does import React', () => {
    const store = readFileSync(join(sourceDirectory, '../hooks/use-sessions.tsx'), 'utf8');

    expect(store).toMatch(/from\s+'react'/u);
  });
});
