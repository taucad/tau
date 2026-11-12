import net from 'node:net';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

/* eslint-disable @typescript-eslint/naming-convention -- OTel attribute names and postgres.js options */

/** Every instrument call, by metric name: what the exporter would sum. */
const { recorded, observers } = vi.hoisted(() => ({
  recorded: [] as Array<{ name: string; value: number; attributes: Record<string, unknown> }>,
  observers: new Map<string, Array<(result: { observe: (value: number) => void }) => void>>(),
}));

vi.mock('@opentelemetry/api', () => {
  const instrument = (name: string) => ({
    add: (value: number, attributes: Record<string, unknown> = {}) => {
      recorded.push({ name, value, attributes });
    },
    addCallback: (callback: (result: { observe: (value: number) => void }) => void) => {
      observers.set(name, [...(observers.get(name) ?? []), callback]);
    },
    removeCallback: (callback: (result: { observe: (value: number) => void }) => void) => {
      observers.set(
        name,
        (observers.get(name) ?? []).filter((candidate) => candidate !== callback),
      );
    },
  });
  return {
    metrics: {
      getMeter: () => ({
        createUpDownCounter: instrument,
        createCounter: instrument,
        createObservableGauge: instrument,
      }),
    },
  };
});

const {
  countedSocket,
  countedSocketOption,
  initializePoolSeries,
  isConnectionRefusal,
  observePoolerCapacity,
  observeRefusals,
} = await import('#pool-instrumentation.js');

const total = (name: string, attributes: Record<string, unknown>): number =>
  recorded
    .filter(
      (entry) =>
        entry.name === name && Object.entries(attributes).every(([key, value]) => entry.attributes[key] === value),
    )
    .reduce((sum, entry) => sum + entry.value, 0);

const open = (pool: string) => total('tau.db.client.connections', { 'tau.db.pool': pool });
const refusals = (pool: string) => total('tau.db.client.refusals', { 'tau.db.pool': pool });

/** A PostgreSQL ErrorResponse, as Supavisor sends one when the session pool is full. */
const errorResponse = (code: string, message: string): Uint8Array<ArrayBuffer> => {
  const fields = Buffer.concat([Buffer.from(`SFATAL\0VFATAL\0C${code}\0M${message}\0`), Buffer.from([0])]);
  const header = Buffer.alloc(5);
  header.write('E', 0);
  header.writeInt32BE(fields.length + 4, 1);
  return Buffer.concat([header, fields]);
};

const supavisorFull =
  '(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15';

/** A server that refuses every client after its startup message, as a full Supavisor session pool does. */
const refusingServer = async (): Promise<{ server: net.Server; port: number }> => {
  const server = net.createServer((socket) => {
    socket.once('data', () => {
      socket.end(errorResponse('XX000', supavisorFull));
    });
    socket.on('error', () => {
      /* The client may reset the socket first; nothing to assert. */
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, port: (server.address() as net.AddressInfo).port };
};

const settle = async (condition: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- polls until the socket's close event has run
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
};

describe('pool instrumentation (database connection audit R4)', () => {
  let server: net.Server | undefined;

  beforeEach(() => {
    recorded.length = 0;
  });

  afterEach(async () => {
    server?.close();
    server = undefined;
  });

  it('should start each pool series at zero', () => {
    initializePoolSeries('background');

    expect(recorded.map(({ name, value, attributes }) => [name, value, attributes])).toEqual([
      ['tau.db.client.connections', 0, { 'tau.db.pool': 'background' }],
      ['tau.db.client.connects', 0, { 'tau.db.pool': 'background', outcome: 'ok' }],
      ['tau.db.client.connects', 0, { 'tau.db.pool': 'background', outcome: 'error' }],
      ['tau.db.client.refusals', 0, { 'tau.db.pool': 'background' }],
    ]);
  });

  it('should count a socket in when it connects and out when it closes', async () => {
    const accepted: net.Socket[] = [];
    server = net.createServer((socket) => accepted.push(socket));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as net.AddressInfo;

    const socket = countedSocket('request')({ host: ['127.0.0.1'], port: [port], path: undefined });
    await once(socket, 'connect');

    expect(Reflect.get(socket, 'host')).toBe('127.0.0.1');
    expect(open('request')).toBe(1);
    expect(total('tau.db.client.connects', { 'tau.db.pool': 'request', outcome: 'ok' })).toBe(1);

    socket.destroy();
    await settle(() => open('request') === 0);

    expect(open('request')).toBe(0);
  });

  it('should count a failed connect as an error and never as an open connection', async () => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const { port } = probe.address() as net.AddressInfo;
    probe.close();

    const socket = countedSocket('background')({ host: ['127.0.0.1'], port: [port], path: undefined });
    await new Promise((resolve) => {
      socket.once('close', resolve);
    });

    expect(open('background')).toBe(0);
    expect(total('tau.db.client.connects', { 'tau.db.pool': 'background', outcome: 'error' })).toBe(1);
  });

  it('should count a Supavisor refusal of a Drizzle query and release the socket', async () => {
    const refusing = await refusingServer();
    server = refusing.server;
    const client = postgres(`postgres://tau:secret@127.0.0.1:${refusing.port}/tau`, {
      max: 1,
      prepare: false,
      connect_timeout: 2,
      ...countedSocketOption('request'),
    });
    const database = drizzle(observeRefusals(client, 'request'));

    await expect(database.execute(sql`select 1`)).rejects.toSatisfy(isConnectionRefusal);
    await settle(() => open('request') === 0);

    expect(refusals('request')).toBe(1);
    expect(open('request')).toBe(0);
    await client.end({ timeout: 0 });
  });

  it('should count a refusal of a transaction once, at its begin', async () => {
    const refusing = await refusingServer();
    server = refusing.server;
    const client = postgres(`postgres://tau:secret@127.0.0.1:${refusing.port}/tau`, {
      max: 1,
      prepare: false,
      connect_timeout: 2,
    });
    const database = drizzle(observeRefusals(client, 'background'));

    await expect(database.transaction(async (transaction) => transaction.execute(sql`select 1`))).rejects.toSatisfy(
      isConnectionRefusal,
    );

    expect(refusals('background')).toBe(1);
    await client.end({ timeout: 0 });
  });

  it('should not count a query error that is not a refusal', async () => {
    const client = observeRefusals(
      Object.assign(() => undefined, {
        unsafe: async () => {
          throw Object.assign(new Error('duplicate key'), { code: '23505' });
        },
      }) as unknown as postgres.Sql,
      'request',
    );

    await expect(client.unsafe('insert')).rejects.toThrow('duplicate key');
    expect(refusals('request')).toBe(0);
  });

  it.each([
    ['too_many_connections', Object.assign(new Error('sorry, too many clients already'), { code: '53300' }), true],
    ['Supavisor session pool full', Object.assign(new Error(supavisorFull), { code: 'XX000' }), true],
    [
      'wrapped by Drizzle',
      new Error('Failed query: select 1', { cause: new Error(`(ECHECKOUTFAILED) ${supavisorFull}`) }),
      true,
    ],
    ['an ordinary SQL error', Object.assign(new Error('relation does not exist'), { code: '42P01' }), false],
    ['not an error', 'EMAXCONN', false],
  ])('should classify %s', (_label, error, refused) => {
    expect(isConnectionRefusal(error)).toBe(refused);
  });

  it('should report the pooler capacity until stopped', () => {
    const stop = observePoolerCapacity(15);
    const observed: number[] = [];
    for (const callback of observers.get('tau.db.pooler.capacity') ?? []) {
      callback({ observe: (value) => observed.push(value) });
    }
    stop();

    expect(observed).toEqual([15]);
    expect(observers.get('tau.db.pooler.capacity')).toEqual([]);
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- end OTel attribute names and postgres.js options */
