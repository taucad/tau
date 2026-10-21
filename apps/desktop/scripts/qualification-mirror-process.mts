/** Supervised HTTPS child keeps serving while native package managers synchronously inspect/install artifacts. */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
/* oxlint-disable no-restricted-imports -- Script-owned isolated transport and its IPC facade share one contract. */
import { startQualificationMirror } from './qualification-mirror.mjs';
import type { QualificationMirrorObject, QualificationMirrorRequest } from './qualification-mirror.mjs';
/* oxlint-enable no-restricted-imports */
const objectSchema = z.object({ path: z.string(), sha256: z.string(), size: z.number(), contentType: z.string() });
const messageSchema = z.object({
  id: z.number().int().positive(),
  operation: z.enum(['start', 'addImmutable', 'switchLatest', 'close', 'flush', 'online', 'offline']),
  objects: z.array(z.tuple([z.string(), objectSchema])).optional(),
  key: z.string().optional(),
  certificate: z.string().optional(),
});
type Mirror = Awaited<ReturnType<typeof startQualificationMirror>>;
export const startQualificationMirrorProcess = async (options: {
  key: string;
  certificate: string;
  objects: ReadonlyMap<string, QualificationMirrorObject>;
}): Promise<
  Omit<Mirror, 'setAvailable'> & { flush(): Promise<void>; setAvailable(available: boolean): Promise<void> }
> => {
  const child = fork(fileURLToPath(import.meta.url), ['--mirror-host'], {
    execArgv: ['--import', '@oxc-node/core/register'],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  const pending = new Map<
    number,
    {
      resolve: (value: string | undefined) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const requests: QualificationMirrorRequest[] = [];
  let sequence = 0;
  let output = '';
  child.stderr?.on('data', (chunk: unknown) => {
    output = (output + String(chunk)).slice(-8192);
  });
  const rejectAll = (error: Error): void => {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  };
  child.on('error', rejectAll);
  child.on('exit', () => {
    rejectAll(new Error(`Qualification mirror exited: ${output}`));
  });
  child.on('message', (input: unknown) => {
    const message = z
      .object({
        id: z.number().optional(),
        origin: z.string().optional(),
        error: z.string().optional(),
        request: z.object({ path: z.string(), status: z.number(), at: z.string() }).optional(),
      })
      .parse(input);
    if (message.request) {
      requests.push(message.request);
      return;
    }
    const item = message.id === undefined ? undefined : pending.get(message.id);
    if (!item || message.id === undefined) {
      return;
    }
    clearTimeout(item.timer);
    pending.delete(message.id);
    if (message.error) {
      item.reject(new Error(message.error));
    } else {
      item.resolve(message.origin);
    }
  });
  const call = async (
    operation: z.infer<typeof messageSchema>['operation'],
    objects?: ReadonlyMap<string, QualificationMirrorObject>,
  ): Promise<string | undefined> =>
    new Promise((resolve, reject) => {
      sequence += 1;
      const id = sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Qualification mirror IPC timed out'));
        child.kill();
      }, 180_000);
      pending.set(id, { resolve, reject, timer });
      child.send(
        {
          id,
          operation,
          ...(objects ? { objects: [...objects] } : {}),
          ...(operation === 'start' ? { key: options.key, certificate: options.certificate } : {}),
        },
        (error) => {
          if (error) {
            clearTimeout(timer);
            pending.delete(id);
            reject(error);
          }
        },
      );
    });
  try {
    const origin = await call('start', options.objects);
    if (!origin) {
      throw new Error('Qualification mirror origin missing');
    }
    return {
      origin,
      requests,
      async addImmutable(objects) {
        await call('addImmutable', objects);
      },
      async switchLatest(objects) {
        await call('switchLatest', objects);
      },
      async setAvailable(available) {
        await call(available ? 'online' : 'offline');
      },
      async flush() {
        await call('flush');
      },
      async close() {
        try {
          await call('close');
        } finally {
          child.kill();
        }
      },
    };
  } catch (error) {
    child.kill();
    throw error;
  }
};
if (process.argv.includes('--mirror-host')) {
  let mirror: Mirror | undefined;
  let operations = Promise.resolve();
  const handle = async (input: unknown): Promise<void> => {
    const parsed = messageSchema.safeParse(input);
    if (!parsed.success) {
      process.exitCode = 1;
      process.disconnect();
      return;
    }
    const message = parsed.data;
    try {
      if (message.operation === 'start') {
        if (mirror !== undefined || message.key === undefined || message.certificate === undefined) {
          throw new Error('Mirror initialization refused');
        }
        mirror = await startQualificationMirror({
          key: message.key,
          certificate: message.certificate,
          objects: new Map(message.objects),
          onRequest(request) {
            process.send?.({ request });
          },
        });
      } else {
        if (!mirror) {
          throw new Error('Mirror not started');
        }
        switch (message.operation) {
          case 'close': {
            await mirror.close();
            break;
          }
          case 'addImmutable': {
            await mirror.addImmutable(new Map(message.objects));
            break;
          }
          case 'switchLatest': {
            await mirror.switchLatest(new Map(message.objects));
            break;
          }
          case 'offline': {
            mirror.setAvailable(false);
            break;
          }
          case 'online': {
            mirror.setAvailable(true);
            break;
          }
          case 'flush': {
            break;
          }
        }
      }
      process.send?.({ id: message.id, origin: mirror.origin });
    } catch (error) {
      process.send?.({ id: message.id, error: error instanceof Error ? error.message : String(error) });
    }
  };
  process.on('message', (message: unknown) => {
    // oxlint-disable-next-line promise/prefer-await-to-then -- Serialize IPC mutations in arrival order without blocking the HTTPS server.
    operations = operations.then(async () => handle(message));
  });
  process.on('disconnect', () => {
    process.exit(0);
  });
}
