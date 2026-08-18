// oxlint-disable max-params -- deepagents API.
/* eslint-disable @typescript-eslint/naming-convention -- Langchain uses snake_case naming convention */
import { Injectable } from '@nestjs/common';
// oxlint-disable-next-line typescript/no-deprecated -- DeepAgents boundary adapter intentionally implements this compatibility protocol.
import type { BackendProtocol, WriteResult, EditResult, FileInfo, GrepMatch, FileData } from 'deepagents';
import { rpcName } from '@taucad/chat/constants';
import type { RpcExecutionError, RpcValidationError } from '@taucad/chat';
import { joinRelativePath, resolveVirtualPath, VirtualPathError } from '@taucad/utils/path';
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

const toTauRpcPath = (path: string): string => {
  const absolutePath = resolveVirtualPath(path);
  return absolutePath === '/' ? '' : absolutePath.slice(1);
};

const toDeepAgentsPath = (path: string, isDirectory = false): string => {
  const absolutePath = resolveVirtualPath(path === '' ? '/' : `/${path}`);
  const roundTripPath = absolutePath === '/' ? '' : absolutePath.slice(1);
  if (roundTripPath !== path) {
    throw new VirtualPathError('INVALID_PATH', path);
  }
  return isDirectory && absolutePath !== '/' ? `${absolutePath}/` : absolutePath;
};

const assertBasename = (name: string): void => {
  if (name.length === 0 || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new VirtualPathError('INVALID_PATH', name);
  }
};

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
    const rpcPath = toTauRpcPath(path);
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.listDirectory,
      args: { path: rpcPath },
    });

    const data = unwrapRpcResult(result);

    return data.entries.map((entry) => {
      assertBasename(entry.name);
      const isDirectory = entry.type === 'dir';
      return {
        path: toDeepAgentsPath(joinRelativePath(rpcPath, entry.name), isDirectory),
        is_dir: isDirectory,
        size: entry.size,
        ...(entry.modifiedAt ? { modified_at: entry.modifiedAt } : {}),
      };
    });
  }

  public async read(filePath: string, offset?: number, limit?: number): Promise<string> {
    const rpcPath = toTauRpcPath(filePath);
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.readFile,
      args: { targetFile: rpcPath, offset, limit },
    });

    const data = unwrapRpcResult(result);
    return data.content;
  }

  public async readRaw(filePath: string): Promise<FileData> {
    const rpcPath = toTauRpcPath(filePath);
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.readFile,
      args: { targetFile: rpcPath },
    });

    const data = unwrapRpcResult(result);

    return {
      content: data.content.split('\n'),
      created_at: data.createdAt ?? new Date().toISOString(),
      modified_at: data.modifiedAt ?? new Date().toISOString(),
    };
  }

  public async grepRaw(
    pattern: string,
    // oxlint-disable-next-line typescript/no-deprecated -- DeepAgents compatibility protocol owns this parameter type.
    path?: Parameters<BackendProtocol['grepRaw']>[1],
    // oxlint-disable-next-line typescript/no-deprecated -- DeepAgents compatibility protocol owns this parameter type.
    glob?: Parameters<BackendProtocol['grepRaw']>[2],
  ): Promise<GrepMatch[] | string> {
    const rpcPath = path === undefined || path === null ? undefined : toTauRpcPath(path);
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.grep,
      args: {
        pattern,
        ...(rpcPath === undefined ? {} : { path: rpcPath }),
        ...(glob === undefined || glob === null ? {} : { glob }),
      },
    });

    const data = unwrapRpcResult(result);

    return data.matches.map((match) => ({
      path: toDeepAgentsPath(match.file),
      line: match.line,
      text: match.content,
    }));
  }

  public async globInfo(pattern: string, path?: string): Promise<FileInfo[]> {
    const rpcPath = path === undefined ? undefined : toTauRpcPath(path);
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.globSearch,
      args: { pattern, ...(rpcPath === undefined ? {} : { path: rpcPath }) },
    });

    const data = unwrapRpcResult(result);

    return data.entries.map((entry) => ({
      path: toDeepAgentsPath(entry.path, entry.isDirectory ?? false),
      is_dir: entry.isDirectory ?? false,
      size: entry.size,
      ...(entry.modifiedAt ? { modified_at: entry.modifiedAt } : {}),
    }));
  }

  public async write(filePath: string, content: string): Promise<WriteResult> {
    const rpcPath = toTauRpcPath(filePath);
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.createFile,
      args: { targetFile: rpcPath, content },
    });

    const data = unwrapRpcResult(result);

    return {
      path: toDeepAgentsPath(rpcPath),
      filesUpdate: null,
      metadata: { message: data.message },
    };
  }

  public async append(filePath: string, content: string): Promise<WriteResult> {
    const rpcPath = toTauRpcPath(filePath);
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.appendFile,
      args: { targetFile: rpcPath, content },
    });

    const data = unwrapRpcResult(result);

    return {
      path: toDeepAgentsPath(rpcPath),
      filesUpdate: null,
      metadata: { message: data.message },
    };
  }

  public async edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<EditResult> {
    const rpcPath = toTauRpcPath(filePath);
    const result = await this.chatRpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: rpcName.editFile,
      args: { targetFile: rpcPath, oldString, newString, replaceAll },
    });

    const data = unwrapRpcResult(result);

    return {
      path: toDeepAgentsPath(rpcPath),
      filesUpdate: null,
      occurrences: data.occurrences,
    };
  }
}
