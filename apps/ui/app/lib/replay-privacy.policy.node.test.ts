// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = join(import.meta.dirname, '..');

/*
 * PostHog session replay records rendered text so replays can be used for
 * debugging (session replay fidelity blueprint, 2026-11-13). Credentials are
 * the exception: these containers render a bearer secret, so each carries the
 * SDK's default block class. Invitation links are blocked by `blockSelector`.
 */
describe('session replay privacy', () => {
  it.each([
    'components/auth/api-key/new-api-key-dialog.tsx',
    'routes/auth.cli/route.tsx',
    'routes/w.$workspace.$project/revision-collaborators.tsx',
  ])('should block replay of the credential in %s', (path) => {
    expect(readFileSync(join(appRoot, path), 'utf8')).toMatch(/['\s]ph-no-capture[\s']/u);
  });
});
