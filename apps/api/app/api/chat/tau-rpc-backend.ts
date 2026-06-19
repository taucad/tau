// oxlint-disable max-params -- deepagents API.
/* eslint-disable @typescript-eslint/naming-convention -- Langchain uses snake_case naming convention */
import { Injectable } from '@nestjs/common';
// oxlint-disable-next-line typescript/no-deprecated -- DeepAgents boundary adapter intentionally implements this compatibility protocol.
import type { BackendProtocol, WriteResult, EditResult, FileInfo, GrepMatch, FileData } from 'deepagents';
import { rpcName } from '@taucad/chat/constants';
import type { RpcExecutionError, RpcValidationError } from '@taucad/chat';
// oxlint-disable-next-line typescript/consistent-type-imports -- NestJS DI class
import { ChatRpcService } from '#api/chat/chat-rpc.service.js';

/**
 * Extracts the success data from an RPC result, throwing on infrastructure/client errors.
 * Simplified version of assertRpcSuccess for use outside tool context.
 */
function unwrapRpcResult<T extends { success: boolean }>(
  result: T | RpcExecutionError | RpcValidationError,
): Exclude<T, { success: false }> {
  if ('errorCode' in result && !('success' in result)) {
    throw new Error(`RPC error: ${result.message}`);
  }

  if ('success' in result && !result.success) {
    const message = 'message' in result ? String(result.message) : 'RPC call failed';
    throw new Error(message);
  }

  return result as Exclude<T, { success: false }>;
}

/**
 * NestJS factory service for creating TauRpcBackend instances.
 * Each backend instance is bound to a specific chat session for RPC routing.
 */
// oxlint-disable-next-line new-cap -- decorator is called without `new`.
@Injectable()
export class TauRpcBackendFactory {
  public constructor(private readonly chatRpcService: ChatRpcService) {}

  public create(chatId: string, toolCallId: string): TauRpcBackend {
    return new TauRpcBackend(this.chatRpcService, chatId, toolCallId);
  }
}

/**
 * Bridges Deep Agents' BackendProtocol to Tau's ChatRpcService.
 * Delegates all file operations to the browser virtual filesystem via RPC.
 * Returns `filesUpdate: null` (external storage — not stored in LangGraph state).
 */
// oxlint-disable-next-line typescript/no-deprecated -- DeepAgents compatibility boundary; rich Tau metadata stays outside this adapter.
export class TauRpcBackend implements BackendProtocol {
  public constructor(
    private readonly chatRpcService: ChatRpcService,
    private readonly chatId: string,
    private readonly toolCallId: string,
  ) {}

  public async lsInfo(path: string): Promise<FileInfo[]> {
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.listDirectory,
      args: { path },
    });

    const data = unwrapRpcResult(result);

    return data.entries.map((entry) => ({
      path: path ? `${path}/${entry.name}` : entry.name,
      is_dir: entry.type === 'dir',
      size: entry.size,
      ...(entry.modifiedAt ? { modified_at: entry.modifiedAt } : {}),
    }));
  }

  public async read(filePath: string, offset?: number, limit?: number): Promise<string> {
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.readFile,
      args: { targetFile: filePath, offset, limit },
    });

    const data = unwrapRpcResult(result);
    return data.content;
  }

  public async readRaw(filePath: string): Promise<FileData> {
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.readFile,
      args: { targetFile: filePath },
    });

    const data = unwrapRpcResult(result);

    return {
      content: data.content.split('\n'),
      created_at: data.createdAt ?? new Date().toISOString(),
      modified_at: data.modifiedAt ?? new Date().toISOString(),
    };
  }

  public async grepRaw(pattern: string, path?: string, glob?: string): Promise<GrepMatch[] | string> {
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.grep,
      args: {
        pattern,
        ...(path ? { path } : {}),
        ...(glob ? { glob } : {}),
      },
    });

    const data = unwrapRpcResult(result);

    return data.matches.map((match) => ({
      path: match.file,
      line: match.line,
      text: match.content,
    }));
  }

  public async globInfo(pattern: string, path?: string): Promise<FileInfo[]> {
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.globSearch,
      args: { pattern, ...(path ? { path } : {}) },
    });

    const data = unwrapRpcResult(result);

    return data.entries.map((entry) => ({
      path: entry.path,
      is_dir: entry.isDirectory ?? false,
      size: entry.size,
      ...(entry.modifiedAt ? { modified_at: entry.modifiedAt } : {}),
    }));
  }

  public async write(filePath: string, content: string): Promise<WriteResult> {
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.createFile,
      args: { targetFile: filePath, content },
    });

    const data = unwrapRpcResult(result);

    return {
      path: filePath,
      filesUpdate: null,
      metadata: { message: data.message },
    };
  }

  public async append(filePath: string, content: string): Promise<WriteResult> {
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.appendFile,
      args: { targetFile: filePath, content },
    });

    const data = unwrapRpcResult(result);

    return {
      path: filePath,
      filesUpdate: null,
      metadata: { message: data.message },
    };
  }

  public async edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<EditResult> {
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.editFile,
      args: { targetFile: filePath, oldString, newString, replaceAll },
    });

    const data = unwrapRpcResult(result);

    return {
      path: filePath,
      filesUpdate: null,
      occurrences: data.occurrences,
    };
  }
}
