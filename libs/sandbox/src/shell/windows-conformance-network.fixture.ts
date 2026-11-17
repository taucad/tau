/**
 * The network canaries the Windows shell conformance suite listens with outside the sandbox
 * (`shell.conformance.windows.test.ts`), and the controls that prove each one listens.
 */
import { createSocket } from 'node:dgram';
import type { Socket as DatagramSocket } from 'node:dgram';
import { connect, createServer } from 'node:net';
import type { AddressInfo, Server } from 'node:net';

/** A TCP listener outside the sandbox on one address that counts every connection it ever sees. */
export const tcpCanary = async (
  address: string,
): Promise<{ server: Server; port: number; connections: () => number }> => {
  let connections = 0;
  const server = createServer((socket) => {
    connections += 1;
    socket.end('HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n');
  });
  await new Promise<void>((resolve) => {
    server.listen(0, address, resolve);
  });
  const { port } = server.address() as AddressInfo;
  return { server, port, connections: () => connections };
};

/** A UDP socket outside the sandbox on one address that counts every datagram it receives. */
export const udpCanary = async (
  address: string,
): Promise<{ socket: DatagramSocket; port: number; datagrams: () => number }> => {
  let datagrams = 0;
  const socket = createSocket('udp4');
  socket.on('message', () => {
    datagrams += 1;
  });
  await new Promise<void>((resolve) => {
    socket.bind(0, address, resolve);
  });
  return { socket, port: socket.address().port, datagrams: () => datagrams };
};

/** One TCP connection from outside the sandbox: the control that proves the canary listens. */
export const tcpControl = async (address: string, port: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const socket = connect({ host: address, port }, () => {
      socket.end();
      resolve();
    });
    socket.on('error', reject);
  });

/** One datagram from outside the sandbox: the control that proves the canary listens. */
export const udpControl = async (address: string, port: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    socket.send(Buffer.from('control'), port, address, (error) => {
      socket.close();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
