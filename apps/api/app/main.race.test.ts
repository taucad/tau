/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import { Controller, Module, Post, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Regression test for the `FST_ERR_DUPLICATED_ROUTE` crash loop caused by
 * vite-plugin-node's `NestHandler` racing concurrent requests past its
 * non-atomic `if (!app.isInitialized)` guard (upstream:
 * axe-me/vite-plugin-node#33, open since 2022).
 *
 * The fix in `apps/api/app/main.ts` is to eagerly `await app.init()` during
 * bootstrap so the handler always sees `isInitialized === true` on the very
 * first request and never re-runs the routing-registration code paths. These
 * tests verify the invariant the fix relies on: once an `init()` resolves,
 * any subsequent call — sequential or concurrent — is a no-op that cannot
 * re-register routes on the underlying Fastify instance.
 */

@Controller({ path: 'race', version: '1' })
class RaceFixtureController {
  @Post()
  public create(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  controllers: [RaceFixtureController],
})
class RaceFixtureModule {}

const createApp = async (): Promise<NestFastifyApplication> => {
  const adapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(RaceFixtureModule, adapter, {
    logger: false,
  });
  app.enableVersioning({ type: VersioningType.URI });
  return app;
};

describe('Nest bootstrap init race', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('marks the app as initialized after the first awaited init()', async () => {
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    expect(app.isInitialized).toBe(true);
  });

  it('does not re-register routes on a sequential second init()', async () => {
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    await expect(app.init()).resolves.toBe(app);
  });

  it('survives a flood of concurrent init() calls after the first awaited init()', async () => {
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // Simulates vite-plugin-node's `NestHandler` receiving N concurrent first
    // requests — all racing past `if (!app.isInitialized)`. With the bootstrap
    // fix in place, `isInitialized` is already true so every concurrent call
    // collapses to a no-op rather than re-registering Fastify routes.
    const floodSize = 16;
    const racers = Array.from({ length: floodSize }, async () => app.init());

    await expect(Promise.all(racers)).resolves.toHaveLength(floodSize);
  });

  it('still serves traffic after a concurrent init() flood', async () => {
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    await Promise.all(Array.from({ length: 8 }, async () => app.init()));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/race',
      payload: {},
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ ok: true });
  });

  it('reproduces the upstream race: concurrent init() calls on a cold app crash with FST_ERR_DUPLICATED_ROUTE', async () => {
    // Reproduces the exact failure mode the bootstrap fix prevents. Mirrors
    // `vite-plugin-node`'s `NestHandler` scenario: multiple concurrent first
    // requests pass `if (!app.isInitialized)` together, then race
    // `app.init()` against a single Fastify instance. Without the bootstrap
    // fix, the second initializer trips Fastify's duplicate-route guard.
    const coldApp = await createApp();
    try {
      const racers = await Promise.allSettled([coldApp.init(), coldApp.init(), coldApp.init()]);

      const rejection = racers.find((result) => result.status === 'rejected');
      expect(rejection).toBeDefined();

      const reason = rejection!.reason as { code?: string; message?: string };
      expect(reason.code).toBe('FST_ERR_DUPLICATED_ROUTE');
    } finally {
      await coldApp.close();
    }
  });
});
