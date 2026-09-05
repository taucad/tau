import { WebSocketServer } from 'ws';

/** @type {WebSocketServer | undefined} */
let server;

/** Handle runtime-host proof IPC. */
const handleMessage = async (message) => {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    return;
  }
  if (message.type === 'close') {
    const activeServer = server;
    if (activeServer) {
      for (const socket of activeServer.clients) {
        socket.terminate();
      }
      await new Promise((resolve) => {
        activeServer.close(() => {
          resolve(undefined);
        });
      });
    }
    process.disconnect();
    return;
  }
  if (
    message.type !== 'start' ||
    !('authorizationToken' in message) ||
    typeof message.authorizationToken !== 'string'
  ) {
    return;
  }
  server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise((resolve) => {
    server?.once('listening', resolve);
  });
  server.on('connection', (socket) => {
    socket.on('message', (data) => {
      if (Buffer.from(data).toString() === 'crash') {
        // oxlint-disable-next-line unicorn/no-process-exit -- the fixture must simulate an abrupt child crash.
        process.exit(23);
      }
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new TypeError('Expected a TCP WebSocket fixture address.');
  }
  process.send?.({ type: 'ready', url: `ws://127.0.0.1:${address.port}`, runtimeVersion: 'test-version' });
};

process.on('message', handleMessage);
