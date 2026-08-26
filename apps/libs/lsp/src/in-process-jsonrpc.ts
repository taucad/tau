import { JSONRPCClient, JSONRPCServer, JSONRPCServerAndClient } from 'json-rpc-2.0';
import type { JSONRPCRequest } from 'json-rpc-2.0';

/** @public */
export type InProcessJsonRpcPair = Readonly<{
  clientSide: JSONRPCServerAndClient;
  serverSide: JSONRPCServerAndClient;
  dispose(): void;
}>;

/**
 * Two {@link JSONRPCServerAndClient} instances that route requests to each other's server.
 *
 * @public
 */
export function createInProcessJsonRpcPair(): InProcessJsonRpcPair {
  const serverLeft = new JSONRPCServer();
  const serverRight = new JSONRPCServer();

  const clientRight = new JSONRPCClient<void>(async (payload) => {
    const response = await serverLeft.receive(payload as JSONRPCRequest);
    if (response) {
      clientRight.receive(response);
    }
  });

  const clientLeft = new JSONRPCClient<void>(async (payload) => {
    const response = await serverRight.receive(payload as JSONRPCRequest);
    if (response) {
      clientLeft.receive(response);
    }
  });

  const clientSide = new JSONRPCServerAndClient(serverLeft, clientRight);
  const serverSide = new JSONRPCServerAndClient(serverRight, clientLeft);

  return {
    clientSide,
    serverSide,
    dispose(): void {
      clientSide.rejectAllPendingRequests('in-process JSON-RPC disposed');
      serverSide.rejectAllPendingRequests('in-process JSON-RPC disposed');
    },
  };
}
