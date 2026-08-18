import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '#app.module.js';
import { ChatController } from '#api/chat/chat.controller.js';

/**
 * Whole-graph DI guard. `compile()` instantiates every module, provider and
 * controller — the same `InstanceLoader` pass that runs at `NestFactory.create`
 * — so an `@Injectable` that no module registers fails HERE instead of crash
 * looping `nx run api:dev`. Unit tests that `new` a service never exercise DI,
 * and the integration harnesses each boot a hand-rolled subset of the graph, so
 * this is the only check that sees the real module wiring.
 *
 * No infrastructure required: `compile()` does not run `onModuleInit`, so
 * migrations, Redis connects (`lazyConnect: true`) and the maintenance
 * intervals never fire — only constructors run. Env comes from `.env.test` plus
 * the `TAU_VIEW_COOKIE_SECRET` pin in `vitest.setup.ts`.
 */
describe('AppModule', () => {
  it('should resolve every provider and controller in the application graph', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    // ChatController is the deepest consumer — it spans chat, billing, models
    // and telemetry in one constructor.
    expect(moduleRef.get(ChatController)).toBeInstanceOf(ChatController);
  });
});
