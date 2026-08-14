/**
 * Conformance test C14: channel server with `protocolSchemas` rejects
 * malformed call args / notify args at the wire boundary, throwing
 * `WireValidationError` with the issue list. Channel without
 * `protocolSchemas` skips validation.
 *
 * Strategy: bind a synthetic Zod-shape validator (no Zod dep) to the
 * channel's `protocolSchemas` option and assert:
 *
 *  - inbound call args that fail validation reject with WireValidationError;
 *  - inbound notify args that fail validation are silently dropped (notifies
 *    are fire-and-forget so there is no caller to reject);
 *  - inbound call results that fail validation on the client side reject
 *    the originating call with WireValidationError;
 *  - inbound notify args that fail validation on the client side are
 *    silently dropped;
 *  - omitting protocolSchemas preserves the trust-the-wire fast path.
 */

import { describe, it, expect, vi } from 'vitest';
import { wrapMessagePort } from '#port.js';
import { createChannelClient, createChannelServer } from '#channel.js';
import type { ChannelServer } from '#channel.js';
import { WireValidationError, isWireValidationError } from '#wire-validation-error.js';
import type { WireValidator, WireValidationResult, WireProtocolSchemas } from '#wire-validation-error.js';

type Protocol = {
  readonly calls: {
    readonly echo: { args: { value: number }; result: { ok: true; doubled: number } };
  };
  readonly notifies: {
    readonly ping: { args: { stamp: number } };
  };
  readonly listens: Record<string, never>;
};

/** Hand-rolled Zod-shape validator (no Zod dep on @taucad/rpc). */
const createNumberFieldValidator = (field: string): WireValidator<Record<string, number>> => ({
  safeParse: (value): WireValidationResult<Record<string, number>> => {
    if (value === null || typeof value !== 'object') {
      return {
        success: false,
        error: { issues: [{ path: [], message: 'expected an object', code: 'invalid_type' }] },
      };
    }
    const v = (value as Record<string, unknown>)[field];
    if (typeof v !== 'number') {
      return {
        success: false,
        error: {
          issues: [
            { path: [field], message: `expected '${field}' to be number, got ${typeof v}`, code: 'invalid_type' },
          ],
        },
      };
    }
    return { success: true, data: { [field]: v } };
  },
});

const createOkResultValidator = (): WireValidator => ({
  safeParse: (value): WireValidationResult => {
    if (value === null || typeof value !== 'object') {
      return {
        success: false,
        error: { issues: [{ path: [], message: 'expected an object', code: 'invalid_type' }] },
      };
    }
    const object = value as Record<string, unknown>;
    if (object['ok'] !== true || typeof object['doubled'] !== 'number') {
      return {
        success: false,
        error: {
          issues: [{ path: [], message: 'expected { ok: true; doubled: number }', code: 'invalid_shape' }],
        },
      };
    }
    return { success: true, data: { ok: true, doubled: object['doubled'] } };
  },
});

const protocolSchemas: WireProtocolSchemas = {
  calls: {
    echo: { args: createNumberFieldValidator('value'), result: createOkResultValidator() },
  },
  notifies: {
    ping: createNumberFieldValidator('stamp'),
  },
};

const wirePair = (): {
  client: ReturnType<typeof wrapMessagePort<unknown>>;
  server: ReturnType<typeof wrapMessagePort<unknown>>;
} => {
  const channel = new MessageChannel();
  return {
    client: wrapMessagePort(channel.port1),
    server: wrapMessagePort(channel.port2),
  };
};

describe('Wire-protocol validation (C14)', () => {
  it('server rejects inbound call args with WireValidationError when validator fails', async () => {
    const { client, server } = wirePair();
    const handler = vi.fn();
    const srv = createChannelServer<Protocol>({
      port: server,
      sessionKey: 'test',
      protocolSchemas,
      impl: {
        async call(_context, name, args) {
          handler(name, args);
          const a = args as { value: number };
          return { ok: true, doubled: a.value * 2 };
        },
        listen: () => {
          throw new Error('not implemented');
        },
      },
    });
    const cli = createChannelClient<Protocol>({ port: client, sessionKey: 'test' });
    await cli.ready;

    /* `value` is the wrong type — server should reject before the
     * handler runs. */
    await expect(cli.call('echo', { value: 'nope' as unknown as number })).rejects.toThrow(
      /wire validation failed for server-call-args 'echo'/,
    );

    expect(handler).not.toHaveBeenCalled();

    cli.close();
    srv.dispose();
  });

  it('server validates good call args and forwards them to the handler', async () => {
    const { client, server } = wirePair();
    const handler = vi.fn(
      async (_context: unknown, _name: 'echo', args: { value: number }): Promise<{ ok: true; doubled: number }> => {
        return { ok: true, doubled: args.value * 2 };
      },
    );
    const srv = createChannelServer<Protocol>({
      port: server,
      sessionKey: 'test',
      protocolSchemas,
      impl: {
        call: handler as unknown as ChannelServer<Protocol>['call'],
        listen: () => {
          throw new Error('not impl');
        },
      },
    });
    const cli = createChannelClient<Protocol>({ port: client, sessionKey: 'test' });
    await cli.ready;

    await expect(cli.call('echo', { value: 21 })).resolves.toEqual({ ok: true, doubled: 42 });
    expect(handler).toHaveBeenCalledOnce();

    cli.close();
    srv.dispose();
  });

  it('server silently drops malformed notify args', async () => {
    const { client, server } = wirePair();
    const notifyHandler = vi.fn();
    const srv = createChannelServer<Protocol>({
      port: server,
      sessionKey: 'test',
      protocolSchemas,
      impl: {
        async call() {
          throw new Error('not used');
        },
        notify(_context, name, args) {
          notifyHandler(name, args);
        },
        listen: () => {
          throw new Error('not impl');
        },
      },
    });
    const cli = createChannelClient<Protocol>({ port: client, sessionKey: 'test' });
    await cli.ready;

    cli.notify('ping', { stamp: 'not-a-number' as unknown as number });

    /* Give the channel a tick to deliver. The notify handler must NOT
     * have been called because validation failed. */
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(notifyHandler).not.toHaveBeenCalled();

    /* Sanity: a valid notify gets through. */
    cli.notify('ping', { stamp: 7 });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(notifyHandler).toHaveBeenCalledWith('ping', { stamp: 7 });

    cli.close();
    srv.dispose();
  });

  it('server drops unknown notify names with one diagnostic', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, server } = wirePair();
    const notifyHandler = vi.fn();
    const srv = createChannelServer<Protocol>({
      port: server,
      sessionKey: 'test',
      protocolSchemas,
      impl: {
        async call() {
          throw new Error('not used');
        },
        notify(_context, name, args) {
          notifyHandler(name, args);
        },
        listen: () => {
          throw new Error('not impl');
        },
      },
    });
    const cli = createChannelClient<Protocol>({ port: client, sessionKey: 'test' });
    await cli.ready;

    const notify = cli.notify as (name: string, args: unknown) => void;
    notify('futureEvent', { value: 1 });
    notify('futureEvent', { value: 2 });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(notifyHandler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown notify "futureEvent"'));

    warn.mockRestore();
    cli.close();
    srv.dispose();
  });

  it('client drops unknown notify names with one diagnostic', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, server } = wirePair();
    const srv = createChannelServer<Protocol>({
      port: server,
      sessionKey: 'test',
      protocolSchemas,
      impl: {
        async call() {
          throw new Error('not used');
        },
        listen: () => {
          throw new Error('not impl');
        },
      },
    });
    const cli = createChannelClient<Protocol>({ port: client, sessionKey: 'test', protocolSchemas });
    await cli.ready;

    const notify = srv.notify as (name: string, args: unknown) => void;
    notify('futureEvent', { value: 1 });
    notify('futureEvent', { value: 2 });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown notify "futureEvent"'));

    warn.mockRestore();
    cli.close();
    srv.dispose();
  });

  it('client rejects malformed call results with WireValidationError', async () => {
    const { client, server } = wirePair();
    const srv = createChannelServer<Protocol>({
      port: server,
      sessionKey: 'test',
      protocolSchemas, // Server validates inbound args ...
      impl: {
        async call() {
          /* Return a malformed result — passes server outbound, but
           * client validates and should reject. */
          return { wrong: 'shape' } as unknown as { ok: true; doubled: number };
        },
        listen: () => {
          throw new Error('not impl');
        },
      },
    });
    const cli = createChannelClient<Protocol>({
      port: client,
      sessionKey: 'test',
      protocolSchemas, // ... and client validates inbound results
    });
    await cli.ready;

    await expect(cli.call('echo', { value: 1 })).rejects.toThrow(
      /wire validation failed for client-call-result 'echo'/,
    );

    cli.close();
    srv.dispose();
  });

  it('omitting protocolSchemas preserves the trust-the-wire fast path', async () => {
    const { client, server } = wirePair();
    const srv = createChannelServer<Protocol>({
      port: server,
      sessionKey: 'test',
      /* No protocolSchemas — wire is trusted. */
      impl: {
        async call(_context, _name, args) {
          return { ok: true, doubled: (args as { value: number }).value * 2 };
        },
        listen: () => {
          throw new Error('not impl');
        },
      },
    });
    const cli = createChannelClient<Protocol>({ port: client, sessionKey: 'test' });
    await cli.ready;

    /* Even with malformed args the server invokes the handler — no
     * validation gate. */
    await expect(cli.call('echo', { value: 'nope' as unknown as number })).resolves.toEqual({
      ok: true,
      doubled: Number.NaN,
    });

    cli.close();
    srv.dispose();
  });

  it('WireValidationError carries the underlying issue list and matches isWireValidationError', async () => {
    const { client, server } = wirePair();
    const srv = createChannelServer<Protocol>({
      port: server,
      sessionKey: 'test',
      protocolSchemas,
      impl: {
        async call() {
          return { ok: true, doubled: 0 };
        },
        listen: () => {
          throw new Error('not impl');
        },
      },
    });
    const cli = createChannelClient<Protocol>({ port: client, sessionKey: 'test' });
    await cli.ready;

    let captured: unknown;
    try {
      await cli.call('echo', { value: 'oops' as unknown as number });
    } catch (error) {
      captured = error;
    }
    expect(isWireValidationError(captured)).toBe(false);
    /* The error crosses the wire as a generic Error (the server
     * stringifies the WireValidationError in toWireError); check the
     * message preserves the validation summary. */
    expect((captured as Error).message).toMatch(/value: expected 'value' to be number/);

    /* On the server-side directly, the WireValidationError is the
     * actual instance — verify the class shape works. */
    const direct = new WireValidationError('server-call-args', 'echo', [
      { path: ['value'], message: 'expected number', code: 'invalid_type' },
    ]);
    expect(isWireValidationError(direct)).toBe(true);
    expect(direct.entry).toBe('echo');
    expect(direct.site).toBe('server-call-args');
    expect(direct.issues).toHaveLength(1);
    expect(direct.issues[0]?.path).toEqual(['value']);

    cli.close();
    srv.dispose();
  });
});
