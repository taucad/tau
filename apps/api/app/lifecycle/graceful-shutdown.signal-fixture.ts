/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
/**
 * A child process for `graceful-shutdown.signal.test.ts`: the real signal
 * wiring around a module that records, on stdout, when its request finishes
 * and when its "database" closes.
 */
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';
import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { closeGracefullyOnSignal, drainingServerOptions } from '#lifecycle/graceful-shutdown.js';
import { LifecycleModule } from '#lifecycle/lifecycle.module.js';

const record = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

@Injectable()
class DatabaseFixture implements OnModuleDestroy {
  public onModuleDestroy(): void {
    record('database closed');
  }
}

@Controller()
class SlowController {
  @Get('slow')
  public async slow(@Query('ms') milliseconds = '500'): Promise<{ ok: true }> {
    record('request entered');
    await setTimeout(Number(milliseconds));
    record('request finished');
    return { ok: true };
  }
}

@Module({ imports: [LifecycleModule], providers: [DatabaseFixture], controllers: [SlowController] })
class SignalFixtureModule {}

const app = await NestFactory.create<NestFastifyApplication>(
  SignalFixtureModule,
  new FastifyAdapter(drainingServerOptions),
  { logger: false },
);
await app.listen(0, '127.0.0.1');
closeGracefullyOnSignal(app, { cut: 5000, abandon: 6000 });
record(`listening ${await app.getUrl()}`);
