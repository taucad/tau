import { Injectable } from '@nestjs/common';
import type {
  RpcSchemasRegistry,
  RpcInput,
  RpcResult,
  RpcCall,
  RpcExecutionError,
  RpcValidationError,
} from '@taucad/chat';
import type { RpcDispatcher } from '@taucad/chat/rpc';
import { ChatRpcService } from '#api/chat/chat-rpc.service.js';

/**
 * Headless ChatRpcService that bypasses Socket.IO entirely.
 *
 * Instead of sending RPC requests over WebSocket to a browser client,
 * this service dispatches them directly to a local RpcDispatcher
 * backed by in-memory filesystem and kernel worker.
 */
@Injectable()
export class HeadlessChatRpcService extends ChatRpcService {
  private dispatcher: RpcDispatcher | undefined;

  public setDispatcher(dispatcher: RpcDispatcher): void {
    this.dispatcher = dispatcher;
  }

  public override async sendRpcRequest<T extends keyof RpcSchemasRegistry>(request: {
    chatId: string;
    toolCallId: string;
    rpcName: T;
    args: RpcInput<T>;
  }): Promise<RpcResult<T> | RpcExecutionError | RpcValidationError> {
    if (!this.dispatcher) {
      return {
        errorCode: 'NO_CONNECTION',
        message: 'HeadlessChatRpcService: dispatcher not set. Call setDispatcher() first.',
        rpcName: request.rpcName,
      };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Generic T narrowed at runtime
      const rpcCall = { rpcName: request.rpcName, args: request.args } as RpcCall;
      const result = await this.dispatcher.dispatch(rpcCall);
      return result as RpcResult<T>;
    } catch (error) {
      return {
        errorCode: 'UNHANDLED_CLIENT_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error in headless RPC',
        rpcName: request.rpcName,
      };
    }
  }

  // No-ops for connection management (no Socket.IO in headless mode)
  public override registerConnection(): void {
    // No-op
  }

  public override unregisterConnection(): void {
    // No-op
  }

  public override registerAbortSignal(): void {
    // No-op
  }
}
