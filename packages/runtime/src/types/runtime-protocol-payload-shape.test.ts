/**
 * Conformance test C18: every wire-protocol Zod schema accepts the
 * runtime payload shape that production code actually sends.
 *
 * C15 already locks the *existence* of a schema per call/notify, but
 * an existence check does not catch a schema/runtime mismatch — for
 * example, `runtimeCleanupArgsSchema = z.null()` would pass C15 even
 * though `runtime-worker-client.ts` sends `undefined`. C18 closes
 * that gap by parsing concrete payload shapes through each schema.
 */

import { describe, it, expect } from 'vitest';
import { runtimeProtocolSchemas } from '#types/runtime-protocol.schemas.js';

describe('runtime-protocol payload-shape coverage (C18)', () => {
  describe('initialize call', () => {
    it('should accept an arbitrary runtime boot config payload', () => {
      expect(() =>
        runtimeProtocolSchemas.calls.initialize.args.parse({
          config: { endpoint: 'https://api.example.test', retries: 2 },
        }),
      ).not.toThrow();
    });

    it('should reject unrelated initialize fields', () => {
      expect(() =>
        runtimeProtocolSchemas.calls.initialize.args.parse({
          config: {},
          unexpected: true,
        }),
      ).toThrow();
    });
  });

  describe('cleanup notify', () => {
    it('should accept the `null` wire payload produced by the channel layer', () => {
      // `runtime-worker-client.ts` calls `this.channel.notify('cleanup')`
      // with no args. The channel wire layer normalises a missing/undefined
      // arg to `null` (`createChannel`/`createChannelServer`:
      // `a: value ?? null`), so the schema validates `null` on the receive
      // side. Asserting this exact pairing prevents future regressions
      // where someone "fixes" the schema to `z.undefined()` and silently
      // drops every cleanup notify (server-side validation failures on
      // notifies are swallowed by design).
      expect(() => runtimeProtocolSchemas.notifies.cleanup.parse(null)).not.toThrow();
    });

    it('should reject `undefined` to keep the wire/application boundary explicit', () => {
      // The application calls `notify('cleanup')` (or with `undefined`),
      // but the wire never carries `undefined` — only `null`. Locking
      // the schema to reject `undefined` documents the contract.
      expect(() => runtimeProtocolSchemas.notifies.cleanup.parse(undefined)).toThrow();
    });
  });

  describe('abort notify', () => {
    it.each([0, 1, 2] as const)('should accept the AbortReasonCode value %i', (code) => {
      // Abort-channel.ts publishes one of the canonical AbortReasonCode
      // numeric literals (0 = user, 1 = supersede, 2 = timeout).
      expect(() => runtimeProtocolSchemas.notifies.abort.parse({ reason: code })).not.toThrow();
    });
  });
});
