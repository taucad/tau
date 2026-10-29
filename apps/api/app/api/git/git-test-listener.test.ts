/* oxlint-disable new-cap -- NestJS decorators are factories */
/* eslint-disable @typescript-eslint/naming-convention -- NestJS decorators are factories */
import { createServer } from 'node:http';
import { Controller, Get, Inject } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, expect, it } from 'vitest';
import { createGitTestListener } from '#api/git/git-test-listener.js';

@Controller()
class OriginController {
  public constructor(@Inject('origin') private readonly origin: string) {}

  @Get('origin')
  public readOrigin(): { origin: string } {
    return { origin: this.origin };
  }
}

/** Try to acquire the same socket, closing the competitor whether it wins or loses. */
async function acquirePort(origin: string): Promise<void> {
  const competitor = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      competitor.once('error', reject);
      competitor.listen(Number(new URL(origin).port), '127.0.0.1', resolve);
    });
  } finally {
    await new Promise<void>((resolve) => {
      competitor.close(() => {
        resolve();
      });
    });
  }
}

describe('git test listener ownership', () => {
  it('should hold the actual API socket during Nest compilation and serve the origin captured by its controller', async () => {
    const listener = await createGitTestListener();
    let app: NestFastifyApplication | undefined;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const compiling = Test.createTestingModule({
      controllers: [OriginController],
      providers: [
        {
          provide: 'origin',
          useFactory: async () => {
            await gate;
            return listener.origin;
          },
        },
      ],
    }).compile();
    try {
      await expect(acquirePort(listener.origin)).rejects.toMatchObject({ code: 'EADDRINUSE' });
      release();
      const moduleRef = await compiling;
      app = moduleRef.createNestApplication<NestFastifyApplication>(listener.adapter);
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
      expect(app.getHttpAdapter().getInstance().server).toBe(listener.adapter.getInstance().server);
      const response = await fetch(`${listener.origin}/origin`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ origin: listener.origin });
      await app.close();
      await expect(acquirePort(listener.origin)).resolves.toBeUndefined();
    } finally {
      release();
      try {
        if (app) {
          await app.close();
        } else {
          const moduleRef = await compiling;
          await moduleRef.close();
        }
      } finally {
        await listener.close();
      }
    }
  });

  it('should release the owned socket when Nest compilation fails before an application exists', async () => {
    const listener = await createGitTestListener();
    const failure = new Error('fixture provider failed');
    try {
      await expect(
        Test.createTestingModule({
          providers: [
            {
              provide: 'failure',
              useFactory: () => {
                throw failure;
              },
            },
          ],
        }).compile(),
      ).rejects.toBe(failure);
      await expect(acquirePort(listener.origin)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    } finally {
      await listener.close();
    }
    await expect(acquirePort(listener.origin)).resolves.toBeUndefined();
  });
});
