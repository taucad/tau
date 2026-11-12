// @vitest-environment node
import { Server, connect, createServer } from 'node:net';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { isRefusedAddress, startGuardProxy } from '#shell/srt-guard-proxy.js';
import type { GuardProxy, GuardResolver } from '#shell/srt-guard-proxy.js';

const disposables: Array<AsyncDisposable | Server> = [];
afterEach(async () => {
  await Promise.all(
    disposables.splice(0).map(async (item) => {
      if (item instanceof Server) {
        item.close();
      } else {
        await item[Symbol.asyncDispose]();
      }
    }),
  );
});

/** Send one raw request to the guard and read the first response line. */
const ask = async (guard: GuardProxy, head: string): Promise<string> => {
  const url = new URL(guard.url);
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port: Number(url.port) }, () => {
      socket.write(head);
    });
    socket.on('error', reject);
    let data = '';
    socket.on('data', (chunk) => {
      data += chunk.toString();
      if (data.includes('\r\n')) {
        resolve(data.split('\r\n')[0]!);
        socket.destroy();
      }
    });
  });
};

const authorization = (guard: GuardProxy): string => {
  const url = new URL(guard.url);
  return `Proxy-Authorization: Basic ${Buffer.from(`${url.username}:${url.password}`).toString('base64')}\r\n`;
};

const resolvingTo =
  (address: string): GuardResolver =>
  async () => [{ address, family: address.includes(':') ? 6 : 4 }];

describe('isRefusedAddress', () => {
  it('should refuse loopback, private, link-local, unique-local, metadata and mapped addresses', () => {
    const refused = [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.100.100.200',
      '0.0.0.0',
      '::1',
      'fd00:ec2::254',
      'fe80::1',
      '::ffff:127.0.0.1',
      'not-an-address',
    ];

    expect(refused.filter((address) => !isRefusedAddress(address))).toStrictEqual([]);
  });

  it('should admit public addresses', () => {
    expect(
      ['93.184.215.14', '2606:2800:21f:cb07:6820:80da:af6b:8b2c'].map((address) => isRefusedAddress(address)),
    ).toStrictEqual([false, false]);
  });
});

describe('startGuardProxy', () => {
  it('should refuse a request without its credential', async () => {
    const guard = await startGuardProxy(resolvingTo('93.184.215.14'));
    disposables.push(guard);

    expect(await ask(guard, 'CONNECT example.com:443 HTTP/1.1\r\n\r\n')).toBe(
      'HTTP/1.1 407 Proxy Authentication Required',
    );
  });

  it('should refuse a granted name that resolves to a local address without connecting', async () => {
    let connections = 0;
    const local = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) => {
      local.listen(0, '127.0.0.1', resolve);
    });
    disposables.push(local);
    const { port } = local.address() as AddressInfo;
    const guard = await startGuardProxy(resolvingTo('127.0.0.1'));
    disposables.push(guard);

    const status = await ask(guard, `CONNECT rebind.example:${String(port)} HTTP/1.1\r\n${authorization(guard)}\r\n`);

    expect({ status, connections }).toStrictEqual({ status: 'HTTP/1.1 403 Forbidden', connections: 0 });
  });

  it('should refuse a malformed request line', async () => {
    const guard = await startGuardProxy(resolvingTo('93.184.215.14'));
    disposables.push(guard);
    const upstream = createServer((socket) => {
      // The probe closes after CONNECT's response, before consuming the upstream payload.
      socket.on('error', (error: NodeJS.ErrnoException) => {
        expect(error.code).toBe('ECONNRESET');
      });
      socket.end('pong');
    });
    await new Promise<void>((resolve) => {
      upstream.listen(0, '127.0.0.1', resolve);
    });
    disposables.push(upstream);

    expect(await ask(guard, `GARBAGE\r\n${authorization(guard)}\r\n`)).toBe('HTTP/1.1 400 Bad Request');
  });

  it('should tunnel to a checked address, IPv4 first, past one that does not answer', async () => {
    const upstream = createServer((socket) => {
      // The probe closes after CONNECT's response, before consuming the upstream payload.
      socket.on('error', (error: NodeJS.ErrnoException) => {
        expect(error.code).toBe('ECONNRESET');
      });
      socket.end('pong');
    });
    await new Promise<void>((resolve) => {
      upstream.listen(0, '127.0.0.1', resolve);
    });
    disposables.push(upstream);
    const { port } = upstream.address() as AddressInfo;
    const dialed: string[] = [];
    const guard = await startGuardProxy(
      async () => [
        { address: '2606:2800:21f:cb07:6820:80da:af6b:8b2c', family: 6 },
        { address: '93.184.215.15', family: 4 },
        { address: '93.184.215.14', family: 4 },
      ],
      (address) => {
        dialed.push(address);
        /* The first IPv4 address refuses; the second reaches the local upstream standing in for the public host. */
        return connect({ host: '127.0.0.1', port: address === '93.184.215.14' ? port : 1 });
      },
    );
    disposables.push(guard);

    const reply = await ask(guard, `CONNECT example.com:443 HTTP/1.1\r\n${authorization(guard)}\r\n`);

    expect(reply).toBe('HTTP/1.1 200 Connection Established');
    expect(dialed).toStrictEqual(['93.184.215.15', '93.184.215.14']);
  });
});
