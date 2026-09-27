import { z } from 'zod';
import { assertRootedPath } from '@taucad/utils/path';
import type { WriteTodosRpcInput, WriteTodosRpcResult } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { serializeTodoList, todoListCounts, todoListPath, todoListSchema } from '#schemas/todo-list.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';

/**
 * Replace one chat's task list with a validated, canonically serialized `todo.yaml`.
 *
 * The whole document is validated before a byte is written, so the file on disk
 * is always a list the UI can parse. The input schema already fences `chatId`
 * to one path segment; `assertRootedPath` is the second lock on the door.
 *
 * @param input - The chat and its complete list.
 * @param fileSystem - The project filesystem the chat lives in.
 * @returns The written path and a count per status, or a typed refusal.
 * @public
 */
export async function handleWriteTodos(
  input: WriteTodosRpcInput,
  fileSystem: RpcFileSystem,
): Promise<WriteTodosRpcResult> {
  const list = todoListSchema.safeParse({ version: 1, items: input.items });
  if (!list.success) {
    return { success: false, errorCode: rpcClientErrorCode.validationError, message: z.prettifyError(list.error) };
  }
  try {
    const path = assertRootedPath(todoListPath(input.chatId));
    await fileSystem.writeFile(path, serializeTodoList(list.data));
    return { success: true, path, counts: todoListCounts(list.data.items) };
  } catch (error) {
    return toRpcError(error);
  }
}
