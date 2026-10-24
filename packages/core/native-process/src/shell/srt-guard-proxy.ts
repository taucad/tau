/**
 * The address guard behind one launch's sandbox proxy (blueprint D26).
 *
 * The sandbox runtime's own proxy admits a request by host name and this launch's per-process credential. It then
 * forwards through this guard as its parent proxy, and the guard resolves the name itself and refuses it when any
 * resolved address is loopback, private, link-local, unique-local, carrier-grade NAT, multicast, reserved or a cloud
 * metadata address, so a granted name that rebinds to a local service reaches nothing. The connection is made to the
 * address the guard checked, never re-resolved. The guard listens on loopback and admits only its own credential.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { BlockList, connect, createServer, isIP } from 'node:net';
import type { AddressInfo, Server, Socket } from 'node:net';

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

/**
 * Whether a resolved address is one a granted name may never reach.
 *
 * @public
 * @param address - An IPv4 or IPv6 address.
 * @returns `true` for loopback, private, link-local, unique-local, metadata, multicast and reserved ranges.
 */
export const isRefusedAddress = (address: string): boolean => {
  const family = isIP(address);
  if (family === 0) {
    return true;
  }
  /* An IPv4-mapped IPv6 address is judged by the IPv4 address it carries; BlockList matches the two forms alike. */
  const mapped = /^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/iu.exec(address);
  if (mapped !== null) {
    return isRefusedAddress(mapped[1]!);
  }
  return blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
};

/** How a destination name resolves; injectable for tests. @public */
export type GuardResolver = (host: string) => Promise<ReadonlyArray<{ address: string; family: number }>>;

const defaultResolver: GuardResolver = async (host) => lookup(host, { all: true, verbatim: true });

/** How the guard opens a TCP connection to a checked address; injectable for tests. @public */
export type GuardDialer = (address: string, port: number) => Socket;

const defaultDialer: GuardDialer = (address, port) => connect({ host: address, port });

/**
 * Connect to the first checked address that answers, IPv4 first: a host or VM without an IPv6 route resolves names
 * to IPv6 addresses it cannot reach, and every address in the list has already passed the refusal check.
 */
const dialFirst = async (
  addresses: ReadonlyArray<{ address: string; family: number }>,
  port: number,
  { dial, track }: Readonly<{ dial: GuardDialer; track: (socket: Socket) => void }>,
): Promise<Socket | undefined> => {
  const ordered = [...addresses].sort((left, right) => left.family - right.family);
  for (const { address } of ordered) {
    const socket = dial(address, port);
    track(socket);
    // oxlint-disable-next-line no-await-in-loop -- addresses are tried one at a time, in order.
    const connected = await new Promise<boolean>((resolve) => {
      socket.once('connect', () => {
        resolve(true);
      });
      socket.once('error', () => {
        resolve(false);
      });
    });
    if (connected) {
      return socket;
    }
    socket.destroy();
  }
  return undefined;
};

/** A running guard. @public */
export type GuardProxy = AsyncDisposable &
  Readonly<{
    /** `http://tau:<credential>@127.0.0.1:<port>`, for the sandbox runtime's `network.parentProxy`. */
    url: string;
  }>;

const respond = (socket: Socket, status: string): void => {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
};

/** Read one request head (up to the blank line) without consuming what follows it. */
const readHead = async (socket: Socket): Promise<{ head: string; rest: Uint8Array<ArrayBuffer> } | undefined> =>
  new Promise((resolve) => {
    let buffer = Buffer.alloc(0);
    const onData = (chunk: Uint8Array<ArrayBuffer>): void => {
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf('\r\n\r\n');
      if (end !== -1) {
        socket.off('data', onData);
        socket.pause();
        resolve({ head: buffer.subarray(0, end).toString('latin1'), rest: buffer.subarray(end + 4) });
      } else if (buffer.length > 64 * 1024) {
        socket.off('data', onData);
        resolve(undefined);
      }
    };
    socket.on('data', onData);
    socket.once('close', () => {
      resolve(undefined);
    });
  });

const authorized = (head: string, expected: Uint8Array<ArrayBuffer>): boolean => {
  const match = /^proxy-authorization:\s*basic\s+(\S+)\s*$/imu.exec(head);
  if (match === null) {
    return false;
  }
  const given = Buffer.from(match[1]!);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

/** The host and port a request targets: `CONNECT host:port` or an absolute-form `http://` request line. */
const target = (requestLine: string): { connect: boolean; host: string; port: number } | undefined => {
  const [method, uri] = requestLine.split(' ');
  if (method === undefined || uri === undefined) {
    return undefined;
  }
  if (method.toUpperCase() === 'CONNECT') {
    const match = /^\[?([^\]]+?)\]?:(\d{1,5})$/u.exec(uri);
    return match ? { connect: true, host: match[1]!, port: Number(match[2]) } : undefined;
  }
  try {
    const url = new URL(uri);
    if (url.protocol !== 'http:') {
      return undefined;
    }
    return { connect: false, host: url.hostname.replaceAll(/^\[|\]$/gu, ''), port: Number(url.port || 80) };
  } catch {
    return undefined;
  }
};

/**
 * Start a guard on an ephemeral loopback port.
 *
 * @public
 * @param resolver - Name resolution; the system resolver by default.
 * @param dial - How a checked address is connected to; a plain TCP connection by default.
 * @returns The running guard; dispose it to close every connection.
 */
export const startGuardProxy = async (
  resolver: GuardResolver = defaultResolver,
  dial: GuardDialer = defaultDialer,
): Promise<GuardProxy> => {
  const credential = randomBytes(24).toString('hex');
  const expected = Buffer.from(Buffer.from(`tau:${credential}`).toString('base64'));
  const sockets = new Set<Socket>();
  const track = (socket: Socket): void => {
    sockets.add(socket);
    socket.once('close', () => {
      sockets.delete(socket);
    });
    socket.on('error', () => undefined);
  };
  const handling = new Set<Promise<void>>();
  const handle = async (client: Socket): Promise<void> => {
    const request = await readHead(client);
    if (request === undefined) {
      client.destroy();
      return;
    }
    const [requestLine = '', ...headers] = request.head.split('\r\n');
    if (!authorized(headers.join('\n'), expected)) {
      respond(client, '407 Proxy Authentication Required');
      return;
    }
    const destination = target(requestLine);
    if (destination === undefined || destination.port < 1 || destination.port > 65_535) {
      respond(client, '400 Bad Request');
      return;
    }
    let addresses: ReadonlyArray<{ address: string; family: number }>;
    try {
      addresses = isIP(destination.host)
        ? [{ address: destination.host, family: isIP(destination.host) }]
        : await resolver(destination.host);
    } catch {
      respond(client, '502 Bad Gateway');
      return;
    }
    if (addresses.length === 0 || addresses.some(({ address }) => isRefusedAddress(address))) {
      respond(client, '403 Forbidden');
      return;
    }
    const upstream = await dialFirst(addresses, destination.port, { dial, track });
    if (upstream === undefined) {
      respond(client, '502 Bad Gateway');
      return;
    }
    if (destination.connect) {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    } else {
      /* Forward the absolute-form request head without the guard's credential, and close after one response so a
       * kept-alive client socket can never carry a second request to another host through this upstream. */
      const forwarded = [
        requestLine,
        ...headers.filter((line) => !/^(?:proxy-authorization|proxy-connection|connection|keep-alive):/iu.test(line)),
        'Connection: close',
      ];
      upstream.write(`${forwarded.join('\r\n')}\r\n\r\n`);
    }
    if (request.rest.length > 0) {
      upstream.write(request.rest);
    }
    client.pipe(upstream).pipe(client);
    client.resume();
  };
  const server: Server = createServer((client) => {
    track(client);
    const work = handle(client);
    handling.add(work);
    client.once('close', () => {
      handling.delete(work);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://tau:${credential}@127.0.0.1:${String(port)}`,
    [Symbol.asyncDispose]: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await Promise.allSettled(handling);
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
};
