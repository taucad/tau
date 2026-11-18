/**
 * T-B5.7 (B5, R7): the database panel's actions follow the build, not the page's globals. On the web the page's inline
 * icon sprite holds `<symbol id="tau">`, which every browser also exposes as `window.tau`, so a page that took any
 * `tau` global for the desktop shell would offer none of the web's actions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recoveryActions } from '#lib/recovery-actions.js';

const mirrorKey = 'tau:home-backend';

describe('recovery actions', () => {
  beforeEach(() => {
    globalThis.localStorage.setItem(mirrorKey, 'opfs');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    globalThis.localStorage.clear();
    document.body.innerHTML = '';
  });

  it("should offer the web's actions while an element named tau is on the page", () => {
    vi.stubEnv('TAU_TARGET', 'web');
    const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
    sprite.id = 'tau';
    document.body.append(sprite);
    vi.stubGlobal('tau', sprite);

    const actions = recoveryActions(['updateTau', 'resetFolderList', 'showLogs']);

    expect(actions.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: 'updateTau', kind: 'run' },
      { id: 'resetFolderList', kind: 'run' },
    ]);
  });

  it("should offer the shell's actions on the desktop", () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    vi.stubGlobal('tau', {
      updates: { check: async () => undefined },
      troubleshooting: { showLogs: async () => undefined },
    });

    const actions = recoveryActions(['updateTau', 'resetFolderList', 'showLogs']);

    expect(actions.map(({ id }) => id)).toEqual(['updateTau', 'showLogs']);
  });
});
