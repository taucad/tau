import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import { RevisionSaltController } from '#api/git/revision-salt.controller.js';

/**
 * EQ10 option (a): one salt per `(workspace, account)`, the same on every
 * device and every worker because it is derived from the pair and the API's
 * secret, and nothing a revision records.
 */
describe('RevisionSaltController', () => {
  const controller = (secret: string): RevisionSaltController =>
    new RevisionSaltController({ get: () => secret } as unknown as ConfigService<Environment, true>);

  it('gives one account one salt in a workspace on every request, and another in another workspace', () => {
    const first = controller('secret-a').salt('studio', 'user-1');
    /* A second device is a second request, possibly on a second worker. */
    const second = controller('secret-a').salt('studio', 'user-1');

    expect(second).toStrictEqual(first);
    expect(first.salt).toMatch(/^[\da-f]{64}$/u);
    expect(controller('secret-a').salt('workshop', 'user-1').salt).not.toBe(first.salt);
    expect(controller('secret-a').salt('studio', 'user-2').salt).not.toBe(first.salt);
  });

  it('cannot be recomputed from the workspace and the user id alone', () => {
    expect(controller('secret-b').salt('studio', 'user-1').salt).not.toBe(
      controller('secret-a').salt('studio', 'user-1').salt,
    );
  });

  it('refuses a request that names no workspace', () => {
    expect(() => controller('secret-a').salt(undefined, 'user-1')).toThrow(
      expect.objectContaining({ status: 400 }) as unknown as Error,
    );
  });
});
