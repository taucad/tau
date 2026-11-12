import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- the runtime the provider wraps; the patched resolver is internal.
import { whichSync } from '@anthropic-ai/sandbox-runtime/dist/utils/which.js';

/*
 * The sandbox runtime resolves the launch shell with `whichSync`. Unpatched, it spawns `which` with a 1 s timeout even
 * for an absolute path, so a busy host reported a present `/bin/sh` as "not found in PATH" and the call settled
 * `shell-unavailable` (MAC-X S04, run 42697627895). Tau's patch answers an absolute path from the file itself.
 */
describe('sandbox runtime shell resolution', () => {
  const path = process.env['PATH'];

  afterEach(() => {
    process.env['PATH'] = path;
  });

  it('resolves an absolute executable without searching PATH', () => {
    process.env['PATH'] = '';

    expect(whichSync('/bin/sh')).toBe('/bin/sh');
  });

  it('refuses an absolute path that is missing or not executable', () => {
    expect(whichSync('/nonexistent/tau-shell')).toBeNull();
    expect(whichSync('/etc/hosts')).toBeNull();
  });
});
