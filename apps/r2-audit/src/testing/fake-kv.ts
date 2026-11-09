/**
 * A minimal in-memory stand-in for the `AUDIT_KV` binding, with KV's `null` for a missing key.
 */

/* oxlint-disable typescript/no-restricted-types -- `null` is the KV binding's own absence value. */

import type { AuditKv, AuditKvPutOptions } from '#environment.js';

/** The fake, with what it holds and every write it received. */
export type FakeKv = AuditKv &
  Readonly<{
    values: Map<string, string>;
    puts: Array<Readonly<{ key: string; value: string; options?: AuditKvPutOptions }>>;
    /** Make every call reject, as a binding outage does. */
    fail: (failing: boolean) => void;
  }>;

/**
 * Create an empty fake namespace.
 *
 * @returns The fake.
 */
export const createFakeKv = (): FakeKv => {
  const values = new Map<string, string>();
  const puts: Array<Readonly<{ key: string; value: string; options?: AuditKvPutOptions }>> = [];
  let failing = false;
  return {
    values,
    puts,
    fail: (next) => {
      failing = next;
    },
    get: async (key) => {
      if (failing) {
        throw new Error('KV unavailable');
      }
      return values.get(key) ?? null;
    },
    put: async (key, value, options) => {
      if (failing) {
        throw new Error('KV unavailable');
      }
      values.set(key, value);
      puts.push(options === undefined ? { key, value } : { key, value, options });
    },
  };
};
