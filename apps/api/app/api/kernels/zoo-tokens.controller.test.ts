import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import { ZooTokenService } from '#api/kernels/zoo-token.service.js';
import { ZooTokensController } from '#api/kernels/zoo-tokens.controller.js';

describe('ZooTokensController', () => {
  it('mints a Zoo-scoped token for the signed-in caller only', () => {
    const tokens = new ZooTokenService({ get: () => 'secret-a' } as unknown as ConfigService<Environment, true>);
    const controller = new ZooTokensController(tokens);

    const minted = controller.mint('user-1');

    expect(tokens.verify(minted.token)).toBe('user-1');
    expect(Date.parse(minted.expiresAt)).toBeGreaterThan(Date.now());
  });
});
