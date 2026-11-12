import net from 'node:net';
import { metrics } from '@opentelemetry/api';
import type { Attributes, Counter, ObservableGauge, ObservableResult, UpDownCounter } from '@opentelemetry/api';
import { TauMetrics } from '@taucad/telemetry';
import type postgres from 'postgres';

/**
 * Client-side PostgreSQL pool visibility (database connection audit R4).
 *
 * postgres.js keeps no public pool statistics, so each pool counts its own sockets: the `socket` option
 * hands postgres.js a socket this module opened, and that socket reports its own open and close. The
 * count is per process and per pool, so a panel may sum it across instances, unlike `tau.db.connections`,
 * which every Machine reads from the same `pg_stat_activity`. Nothing here sees a query's text or
 * parameters (postgres.js `debug` would put both on errors), and a refusal is recorded by class only.
 */

/** The API's client pools, as `tau.db.pool` names them. */
export type DatabasePool = 'request' | 'background';

const poolAttribute = (pool: DatabasePool): Attributes => ({ 'tau.db.pool': pool });

type PoolInstruments = {
  readonly connections: UpDownCounter;
  readonly connects: Counter;
  readonly refusals: Counter;
  readonly capacity: ObservableGauge;
};

let instruments: PoolInstruments | undefined;

/**
 * The pool instruments, created on first use from the global meter provider: the API's OTel SDK has
 * started by then (`otel.ts` loads before the Nest container), as it has for `MetricsService`.
 *
 * @returns The four pool instruments.
 */
const poolInstruments = (): PoolInstruments => {
  if (instruments === undefined) {
    const meter = metrics.getMeter('tau-api');
    const definition = (metric: { name: string; description: string; unit: string }) => ({
      description: metric.description,
      unit: metric.unit,
    });
    instruments = {
      connections: meter.createUpDownCounter(
        TauMetrics.databaseClientConnections.name,
        definition(TauMetrics.databaseClientConnections),
      ),
      connects: meter.createCounter(
        TauMetrics.databaseClientConnects.name,
        definition(TauMetrics.databaseClientConnects),
      ),
      refusals: meter.createCounter(
        TauMetrics.databaseClientRefusals.name,
        definition(TauMetrics.databaseClientRefusals),
      ),
      capacity: meter.createObservableGauge(
        TauMetrics.databasePoolerCapacity.name,
        definition(TauMetrics.databasePoolerCapacity),
      ),
    };
  }
  return instruments;
};

/**
 * Starts a pool's series at zero, so a first refusal is an increase a rule can see.
 *
 * @param pool - The pool.
 */
export const initializePoolSeries = (pool: DatabasePool): void => {
  const { connections, connects, refusals } = poolInstruments();
  connections.add(0, poolAttribute(pool));
  connects.add(0, { ...poolAttribute(pool), outcome: 'ok' });
  connects.add(0, { ...poolAttribute(pool), outcome: 'error' });
  refusals.add(0, poolAttribute(pool));
};

/**
 * Reports the session pooler's capacity for this login, from `DATABASE_POOLER_POOL_SIZE`.
 *
 * @param capacity - The configured pool size.
 * @returns Stops reporting it.
 */
export const observePoolerCapacity = (capacity: number): (() => void) => {
  const { capacity: gauge } = poolInstruments();
  const callback = (result: ObservableResult): void => {
    result.observe(capacity);
  };
  gauge.addCallback(callback);
  return () => {
    gauge.removeCallback(callback);
  };
};

/**
 * A socket that counts itself into its pool's connection gauge once it connects, and out once it
 * closes. It overrides `emit` rather than listening, because postgres.js removes every listener from
 * the plain socket when it upgrades it to TLS; the plain socket still emits `close` under TLS.
 */
class CountedSocket extends net.Socket {
  /** Read by postgres.js as the TLS server name; it sets this itself only on sockets it opens. */
  public host: string | undefined;
  public port: number | undefined;
  #connected = false;
  #closed = false;

  public constructor(private readonly pool: DatabasePool) {
    super();
  }

  public override emit(event: string | symbol, ...args: unknown[]): boolean {
    if (event === 'connect' && !this.#connected && !this.#closed) {
      this.#connected = true;
      const { connections, connects } = poolInstruments();
      connections.add(1, poolAttribute(this.pool));
      connects.add(1, { ...poolAttribute(this.pool), outcome: 'ok' });
    } else if (event === 'close' && !this.#closed) {
      this.#closed = true;
      const { connections, connects } = poolInstruments();
      if (this.#connected) {
        connections.add(-1, poolAttribute(this.pool));
      } else {
        connects.add(1, { ...poolAttribute(this.pool), outcome: 'error' });
      }
    }
    return super.emit(event, ...args);
  }
}

type SocketOptions = Pick<postgres.ParsedOptions, 'host' | 'port' | 'path'>;

/**
 * Keeps an error before postgres.js has attached its own listener (it does once the factory returns)
 * from being an uncaught `error` event; postgres.js still sees the error and the close that follows.
 */
const ignoreEarlyError = (): void => {
  /* Handled by postgres.js's listener. */
};

/**
 * A postgres.js `socket` factory whose sockets count themselves into `pool`.
 *
 * postgres.js writes its SSL request or startup message to the returned socket straight away; a
 * `net.Socket` buffers those writes until it connects, and postgres.js's own error, close and
 * connect-timeout handling are unchanged. Hosts of a multi-host URL are tried in turn, one per
 * connection, as postgres.js does without the option.
 *
 * @param pool - The pool the sockets belong to.
 * @returns The factory.
 */
export const countedSocket = (pool: DatabasePool): ((options: SocketOptions) => net.Socket) => {
  let next = 0;
  return (options) => {
    const socket = new CountedSocket(pool);
    socket.on('error', ignoreEarlyError);
    if (options.path) {
      socket.connect(options.path);
      return socket;
    }
    const index = next % options.host.length;
    next += 1;
    const host = options.host[index] ?? options.host[0] ?? 'localhost';
    const port = options.port[index] ?? options.port[0] ?? 5432;
    socket.host = host;
    socket.port = port;
    socket.connect(port, host);
    return socket;
  };
};

/**
 * The postgres.js `socket` option for `pool`, to spread into its options: postgres.js reads it
 * (`src/connection.js`, `createSocket`) but its type declarations omit it. Counts the pool's open
 * connections into `tau.db.client.connections`.
 *
 * @param pool - The pool the sockets belong to.
 * @returns The option.
 */
export const countedSocketOption = (pool: DatabasePool): Record<string, unknown> => ({ socket: countedSocket(pool) });

/** Supavisor's own codes for a full session pool, as its refusal message carries them. */
const poolerRefusal = /EMAXCONN|ECHECKOUTFAILED|max clients reached/u;

/**
 * Whether an error, or one of its causes, is the database or its pooler refusing a connection: SQLSTATE
 * `53300` (too many connections) or Supavisor's `XX000` with `EMAXCONN*` (a full session pool). It reads
 * the code and the message but returns only the class.
 *
 * @param error - The error a query failed with.
 * @returns True for a refused connection.
 */
export const isConnectionRefusal = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const code: unknown = Reflect.get(current, 'code');
    const message: unknown = Reflect.get(current, 'message');
    if (code === '53300' || (typeof message === 'string' && poolerRefusal.test(message))) {
      return true;
    }
    current = Reflect.get(current, 'cause');
  }
  return false;
};

/**
 * Counts a failed query into the pool's refusals when a refused connection caused it.
 *
 * @param pool - The pool the query ran on.
 * @param error - Its error.
 */
export const recordQueryError = (pool: DatabasePool, error: unknown): void => {
  if (isConnectionRefusal(error)) {
    poolInstruments().refusals.add(1, poolAttribute(pool));
  }
};

type Rejected = ((reason: unknown) => unknown) | undefined;
type Fulfilled = ((value: unknown) => unknown) | undefined;

/**
 * The client Drizzle runs on, with every statement's refusal counted into `pool`.
 *
 * A refused connection fails the statement that asked for it, and a statement outside a transaction is
 * one `unsafe` call (Drizzle's only entry besides `begin`) or a transaction's `begin`. The query keeps
 * its laziness: only its own `then`, which `await` calls, is observed. Statements inside a transaction run on a
 * connection that is already open, so they cannot be refused.
 *
 * @param client - The postgres.js client.
 * @param pool - The pool it is.
 * @returns A client that behaves as `client` does.
 */
export const observeRefusals = (client: postgres.Sql, pool: DatabasePool): postgres.Sql =>
  new Proxy(client, {
    get(target, property, receiver) {
      if (property === 'unsafe') {
        return (...args: Parameters<postgres.Sql['unsafe']>) => {
          const query = target.unsafe(...args);
          const then = query.then.bind(query) as (onFulfilled?: Fulfilled, onRejected?: Rejected) => Promise<unknown>;
          // oxlint-disable-next-line unicorn/no-thenable -- the query is already a thenable; this observes its own `then`
          Reflect.defineProperty(query, 'then', {
            configurable: true,
            writable: true,
            value: async (onFulfilled?: Fulfilled, onRejected?: Rejected) =>
              then(onFulfilled, (error: unknown) => {
                recordQueryError(pool, error);
                if (onRejected) {
                  return onRejected(error);
                }
                throw error;
              }),
          });
          return query;
        };
      }
      if (property === 'begin') {
        return async (...args: unknown[]) => {
          try {
            return await (target.begin as (...parameters: unknown[]) => Promise<unknown>)(...args);
          } catch (error) {
            recordQueryError(pool, error);
            throw error;
          }
        };
      }
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
