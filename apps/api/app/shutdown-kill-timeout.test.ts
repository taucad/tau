import { readFileSync } from 'node:fs';
import { shutdownPhases } from '@taucad/api-lifecycle';
import { describe, expect, it } from 'vitest';

// The deadlines live in `@taucad/api-lifecycle`; the Fly configs they must fit live with the app.
describe('shutdownPhases', () => {
  it.each(['fly.prod.toml', 'fly.staging.toml'])('should fit inside the kill_timeout in %s', (file) => {
    const config = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const killTimeout = Number(/^kill_timeout = '(\d+)s'$/mu.exec(config)?.[1]) * 1000;
    // Teardown after the abandon deadline: the OTEL flush (at most 5 s) and a margin for the closes.
    const teardown = 5000 + 2000;

    expect(shutdownPhases.cut).toBeLessThan(shutdownPhases.abandon);
    expect(shutdownPhases.abandon + teardown).toBeLessThanOrEqual(killTimeout);
  });
});
