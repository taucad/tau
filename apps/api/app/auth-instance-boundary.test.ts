/* oxlint-disable new-cap -- NestJS decorators use PascalCase. */
/**
 * The Better Auth instance stays inside api-auth (auth session cookie blueprint D2): an endpoint that accepts a
 * cached session snapshot must not be reachable from app code with request headers except through
 * `SessionResolver` and `BetterAuthService`, which remove the snapshot. `AuthModule` does not export the
 * instance token, so Nest refuses the injection.
 */
import { describe, expect, it } from 'vitest';
import { Inject, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BetterAuthService, SessionResolver } from '@taucad/api-auth';
import { AuthModule } from '@taucad/api-auth/module';
import { authInstanceKey } from '@taucad/api-auth/testing';
import { DatabaseService } from '@taucad/api-database';
import { EmailService } from '@taucad/api-email';

@Injectable()
class ReachesTheInstance {
  public constructor(@Inject('authInstanceKey') public readonly auth: unknown) {}
}

@Injectable()
class UsesTheChokePoints {
  public constructor(
    @Inject(SessionResolver) public readonly sessions: SessionResolver,
    @Inject(BetterAuthService) public readonly betterAuth: BetterAuthService,
  ) {}
}

const compile = async (consumer: new (...args: never[]) => unknown) =>
  Test.createTestingModule({
    imports: [AuthModule.forRootAsync({ tauCloudEnabled: false })],
    providers: [consumer],
  })
    .overrideProvider(authInstanceKey)
    .useValue({ api: {}, options: {} })
    .overrideProvider(DatabaseService)
    .useValue({})
    .overrideProvider(EmailService)
    .useValue({})
    .compile();

describe('Better Auth instance boundary', () => {
  it('should refuse to inject the Better Auth instance into an app provider', async () => {
    await expect(compile(ReachesTheInstance)).rejects.toThrow(/authInstanceKey/u);
  });

  it('should inject the resolver and the named-method service into an app provider', async () => {
    const moduleRef = await compile(UsesTheChokePoints);

    expect(moduleRef.get(UsesTheChokePoints).sessions).toBeInstanceOf(SessionResolver);
    await moduleRef.close();
  });
});
