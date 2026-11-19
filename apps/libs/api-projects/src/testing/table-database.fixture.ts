import { Column, Param, SQL, StringChunk, Table, getTableColumns, is } from 'drizzle-orm';
import * as schema from '@taucad/api-database/schema';

/** One stored row, keyed by the schema's JavaScript column names. */
export type TableRow = Record<string, unknown>;

/** One statement the fake recorded. */
export type TableWrite = Readonly<{ kind: 'insert' | 'update'; table: Table; payload: TableRow }>;

/** Rows a test seeds and reads back, by table. */
export type TableDatabase = Readonly<{
  /** The live rows of a table: a test reads what a write left behind here. */
  rows: (table: Table) => TableRow[];
  /** Every insert and update, in order. */
  writes: TableWrite[];
  /** What the service is constructed with: `{ database }`. */
  databaseService: unknown;
}>;

/** One row per table in the result being built: a join holds two. */
type Tuple = ReadonlyMap<Table, TableRow>;

const columnKeys = new Map<Column, string>();
for (const candidate of Object.values(schema)) {
  if (is(candidate, Table)) {
    for (const [key, column] of Object.entries<Column>(getTableColumns(candidate))) {
      columnKeys.set(column, key);
    }
  }
}

const textOf = (chunk: unknown): string | undefined => (is(chunk, StringChunk) ? chunk.value.join('') : undefined);

const columnValue = (column: Column, tuple: Tuple): unknown => {
  const key = columnKeys.get(column);
  return key === undefined ? undefined : tuple.get(column.table)?.[key];
};

const operandValue = (chunk: unknown, tuple: Tuple): unknown => {
  if (is(chunk, Column)) {
    return columnValue(chunk, tuple);
  }
  if (is(chunk, Param)) {
    return chunk.value;
  }
  return chunk;
};

/**
 * Evaluates the conditions the services write: `eq`, `and` and `isNull`, over
 * columns and bound values. Anything else matches every row, so a fixture never
 * hides a row behind a condition it cannot read.
 */
const matches = (condition: unknown, tuple: Tuple): boolean => {
  if (!is(condition, SQL)) {
    return true;
  }
  const chunks = condition.queryChunks.filter((chunk) => {
    const text = textOf(chunk);
    return text === undefined || !['', '(', ')'].includes(text);
  });
  if (chunks.length === 3 && textOf(chunks[1]) === ' = ') {
    const left = operandValue(chunks[0], tuple);
    const right = operandValue(chunks[2], tuple);
    return left === right;
  }
  if (chunks.length === 2 && textOf(chunks[1]) === ' is null' && is(chunks[0], Column)) {
    const value = columnValue(chunks[0], tuple);
    return value === null || value === undefined;
  }
  if (chunks.some((chunk) => textOf(chunk) === ' and ')) {
    return chunks.filter((chunk) => is(chunk, SQL)).every((chunk) => matches(chunk, tuple));
  }
  if (chunks.length === 1) {
    return matches(chunks[0], tuple);
  }
  return true;
};

/**
 * A builder that is awaited like Drizzle's own: `produce` runs when it is
 * first awaited, after every chained call has been recorded, and only once.
 */
const thenable = <T>(produce: () => T, extra: Record<string, unknown>): PromiseLike<T> & Record<string, unknown> => {
  let settled: Promise<T> | undefined;
  const run = async (): Promise<T> => {
    await Promise.resolve();
    return produce();
  };
  return {
    ...extra,
    // oxlint-disable-next-line unicorn/no-thenable -- Drizzle's builders are awaited thenables; the fake mirrors them
    then: async <R1 = T, R2 = never>(
      onFulfilled?: (value: T) => R1 | PromiseLike<R1>,
      onRejected?: (reason: unknown) => R2 | PromiseLike<R2>,
    ): Promise<R1 | R2> => {
      settled ??= run();
      try {
        const value = await settled;
        return onFulfilled === undefined ? (value as unknown as R1) : await onFulfilled(value);
      } catch (error) {
        if (onRejected === undefined) {
          throw error;
        }
        return onRejected(error);
      }
    },
  };
};

/**
 * An in-memory stand-in for the Drizzle database the publication services use,
 * answering by table and by the conditions a statement carries rather than by
 * call order. Transactions run their body against the same rows; locks and raw
 * statements resolve to nothing.
 *
 * @param seed - The rows each table starts with.
 * @returns The fake and its rows.
 */
export const createTableDatabase = (seed: ReadonlyArray<readonly [Table, readonly TableRow[]]>): TableDatabase => {
  const tables = new Map<Table, TableRow[]>(seed.map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
  const rowsOf = (table: Table): TableRow[] => {
    let rows = tables.get(table);
    if (rows === undefined) {
      rows = [];
      tables.set(table, rows);
    }
    return rows;
  };
  const writes: TableWrite[] = [];

  const select = (fields?: Record<string, unknown>) => ({
    from: (table: Table) => {
      let joined: { table: Table; on: unknown } | undefined;
      let condition: unknown;
      let limit: number | undefined;
      const run = (): unknown[] => {
        let tuples: Tuple[] = rowsOf(table).map((row) => new Map([[table, row]]));
        if (joined !== undefined) {
          const join = joined;
          tuples = tuples.flatMap((tuple) =>
            rowsOf(join.table)
              .map((other) => new Map([...tuple, [join.table, other]]))
              .filter((candidate) => matches(join.on, candidate)),
          );
        }
        const selected = tuples.filter((tuple) => matches(condition, tuple)).slice(0, limit);
        return selected.map((tuple) => {
          if (fields === undefined) {
            return { ...tuple.get(table) };
          }
          return Object.fromEntries(
            Object.entries(fields).map(([key, field]) => [
              key,
              is(field, Table) ? { ...tuple.get(field) } : is(field, Column) ? columnValue(field, tuple) : undefined,
            ]),
          );
        });
      };
      const builder: Record<string, unknown> = thenable(run, {});
      Object.assign(builder, {
        innerJoin: (other: Table, on: unknown) => {
          joined = { table: other, on };
          return builder;
        },
        where: (next: unknown) => {
          condition = next;
          return builder;
        },
        orderBy: () => builder,
        limit: (count: number) => {
          limit = count;
          return builder;
        },
      });
      return builder;
    },
  });

  const insert = (table: Table) => ({
    values: (values: TableRow | readonly TableRow[]) => {
      const list = Array.isArray(values) ? (values as readonly TableRow[]) : [values as TableRow];
      let conflict: { target: readonly Column[]; set: TableRow } | undefined;
      let doNothing = false;
      const run = (): TableRow[] =>
        list.map((value) => {
          writes.push({ kind: 'insert', table, payload: value });
          const rows = rowsOf(table);
          const target = conflict?.target ?? [];
          const existing =
            target.length === 0
              ? undefined
              : rows.find((row) =>
                  target.every((column) => {
                    const key = columnKeys.get(column) ?? '';
                    return row[key] === value[key];
                  }),
                );
          if (existing !== undefined) {
            if (!doNothing && conflict !== undefined) {
              Object.assign(existing, conflict.set);
            }
            return { ...existing };
          }
          const row = { ...value };
          rows.push(row);
          return { ...row };
        });
      let result: TableRow[] | undefined;
      const once = (): TableRow[] => {
        result ??= run();
        return result;
      };
      const returning = { returning: async () => once() };
      return Object.assign(
        thenable(() => {
          once();
          return undefined;
        }, returning),
        {
          onConflictDoUpdate: (options: { target: Column | readonly Column[]; set: TableRow }) => {
            conflict = {
              target: Array.isArray(options.target) ? options.target : [options.target as Column],
              set: options.set,
            };
            return thenable(() => {
              once();
              return undefined;
            }, returning);
          },
          onConflictDoNothing: () => {
            doNothing = true;
            return thenable(() => {
              once();
              return undefined;
            }, returning);
          },
        },
      );
    },
  });

  const update = (table: Table) => ({
    set: (payload: TableRow) => ({
      where: (condition: unknown) => {
        let result: TableRow[] | undefined;
        const once = (): TableRow[] => {
          if (result === undefined) {
            writes.push({ kind: 'update', table, payload });
            const matched = rowsOf(table).filter((row) => matches(condition, new Map([[table, row]])));
            for (const row of matched) {
              Object.assign(row, payload);
            }
            result = matched.map((row) => ({ ...row }));
          }
          return result;
        };
        return thenable(
          () => {
            once();
            return undefined;
          },
          { returning: async () => once() },
        );
      },
    }),
  });

  const database: Record<string, unknown> = {
    select,
    insert,
    update,
    execute: async () => undefined,
  };
  database['transaction'] = async <T>(body: (transaction: unknown) => Promise<T>): Promise<T> => body(database);

  return { rows: rowsOf, writes, databaseService: { database } };
};
