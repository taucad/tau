import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createChannelClient, createChannelServer } from '#channel.js';
import { wrapMessagePort } from '#port.js';
import { createBridgeChannelSchemas } from '#bridge/bridge-schemas.js';
import type { BridgeRpcProtocol } from '#bridge/bridge-schemas.js';
import { isWireValidationError } from '#wire-validation-error.js';

describe('bridge call result diagnostics', () => {
  it('reports the domain branch unless the bridge-error marker is present', async () => {
    const messageChannel = new MessageChannel();
    const protocolSchemas = createBridgeChannelSchemas({
      hello: z.undefined(),
      calls: { exists: { args: z.tuple([z.string()]), result: z.boolean() } },
      listens: {
        broadcast: { event: z.object({ event: z.string(), data: z.unknown() }) },
        watch: { args: z.unknown(), event: z.unknown() },
      },
    })!;
    const server = createChannelServer<BridgeRpcProtocol>({
      port: wrapMessagePort(messageChannel.port1),
      sessionKey: 'bridge-diagnostics',
      hello: undefined,
      impl: {
        async call() {
          return 'yes';
        },
        async *listen() {
          yield undefined;
        },
      },
    });
    const client = createChannelClient<BridgeRpcProtocol>({
      port: wrapMessagePort(messageChannel.port2),
      sessionKey: 'bridge-diagnostics',
      protocolSchemas,
    });

    try {
      await client.ready;
      await expect(client.call('exists', ['main.ts'])).rejects.toSatisfy((error: unknown) => {
        expect(isWireValidationError(error)).toBe(true);
        if (!isWireValidationError(error)) {
          return false;
        }
        expect(error.issues[0]?.message).toMatch(/boolean/i);
        expect(error.message).not.toContain('__bridgeError');
        return true;
      });
    } finally {
      client.close();
      server.dispose();
    }
  });
});
