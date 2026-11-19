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
 * columns and bound values. No condition matches every row; one the fixture
 * cannot read throws, so a test never passes on a filter that was not applied.
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
  throw new Error('The fixture cannot evaluate this condition');
};

/**
 * Orders tuples by the `asc(column)`, `desc(column)` or bare columns a
 * statement names, so a `limit` after it keeps the rows PostgreSQL would.
 */
const sortTuples = (tuples: Tuple[], order: readonly unknown[]): Tuple[] => {
  const keys = order.map((sort) => {
    if (is(sort, Column)) {
      return { column: sort, descending: false };
    }
    if (is(sort, SQL)) {
      const column = sort.queryChunks.find((chunk) => is(chunk, Column));
      const descending = sort.queryChunks.some((chunk) => textOf(chunk)?.trim() === 'desc');
      if (column !== undefined) {
        return { column, descending };
      }
    }
    throw new Error('The fixture cannot order by this expression');
  });
  return tuples.toSorted((left, right) => {
    for (const { column, descending } of keys) {
      const a = columnValue(column, left);
      const b = columnValue(column, right);
      const compared =
        a instanceof Date && b instanceof Date ? a.getTime() - b.getTime() : String(a).localeCompare(String(b));
      if (compared !== 0) {
        return descending ? -compared : compared;
      }
    }
    return 0;
  });
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
      return settled.then(onFulfilled, onRejected);
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
      const joins: Array<{ table: Table; on: unknown; left: boolean }> = [];
      let condition: unknown;
      let order: unknown[] = [];
      let limit: number | undefined;
      const run = (): unknown[] => {
        let tuples: Tuple[] = rowsOf(table).map((row) => new Map([[table, row]]));
        for (const join of joins) {
          tuples = tuples.flatMap((tuple) => {
            const found = rowsOf(join.table)
              .map((other) => new Map([...tuple, [join.table, other]]))
              .filter((candidate) => matches(join.on, candidate));
            /* A left join keeps the row with nothing on the joined side. */
            return found.length === 0 && join.left ? [tuple] : found;
          });
        }
        const selected = sortTuples(
          tuples.filter((tuple) => matches(condition, tuple)),
          order,
        ).slice(0, limit);
        return selected.map((tuple) => {
          if (fields === undefined) {
            return { ...tuple.get(table) };
          }
          return Object.fromEntries(
            Object.entries(fields).map(([key, field]) => [
              key,
              is(field, Table)
                ? tuple.has(field)
                  ? { ...tuple.get(field) }
                  : null
                : is(field, Column)
                  ? tuple.has(field.table)
                    ? columnValue(field, tuple)
                    : null
                  : undefined,
            ]),
          );
        });
      };
      const builder: Record<string, unknown> = thenable(run, {});
      Object.assign(builder, {
        innerJoin: (other: Table, on: unknown) => {
          joins.push({ table: other, on, left: false });
          return builder;
        },
        leftJoin: (other: Table, on: unknown) => {
          joins.push({ table: other, on, left: true });
          return builder;
        },
        where: (next: unknown) => {
          condition = next;
          return builder;
        },
        orderBy: (...sorts: unknown[]) => {
          order = sorts;
          return builder;
        },
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
        list.flatMap((value) => {
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
            /* PostgreSQL leaves a skipped row out of `returning`. */
            if (doNothing) {
              return [];
            }
            if (conflict !== undefined) {
              /* Drizzle leaves a column whose value is `undefined` out of the update, as it does here. */
              Object.assign(
                existing,
                Object.fromEntries(Object.entries(conflict.set).filter(([, column]) => column !== undefined)),
              );
            }
            return [{ ...existing }];
          }
          const row = { ...value };
          rows.push(row);
          return [{ ...row }];
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
          onConflictDoNothing: (options?: { target?: Column | readonly Column[] }) => {
            doNothing = true;
            const target = options?.target ?? getTableColumns(table)['id'];
            if (target === undefined) {
              throw new Error('The fixture needs a conflict target for a table without an id column');
            }
            conflict = { target: Array.isArray(target) ? target : [target as Column], set: {} };
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
