import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { handleWriteTodos } from '#rpc/handlers/handle-write-todos.js';
import type { TodoItem } from '#schemas/todo-list.schema.js';

const items: TodoItem[] = [
  { id: 'model-pyramid', title: 'Model the pyramid', status: 'done' },
  { id: 'slice-pyramid', title: 'Slice the pyramid', status: 'in_progress' },
];

describe('handleWriteTodos', () => {
  it('should write the canonical YAML to the chat directory and report counts', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.writeFile.mockResolvedValue();

    const result = await handleWriteTodos({ chatId: 'chat_01', items }, fileSystem);

    expect(fileSystem.writeFile).toHaveBeenCalledExactlyOnceWith(
      '.tau/chats/chat_01/todo.yaml',
      'version: 1\nitems:\n  - id: model-pyramid\n    title: Model the pyramid\n    status: done\n  - id: slice-pyramid\n    title: Slice the pyramid\n    status: in_progress\n',
    );
    expect(result).toEqual({
      success: true,
      path: '.tau/chats/chat_01/todo.yaml',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- keys are the status wire values
      counts: { pending: 0, in_progress: 1, done: 1 },
    });
  });

  it('should refuse duplicate ids before touching the filesystem', async () => {
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleWriteTodos(
      { chatId: 'chat_01', items: [items[0]!, { ...items[1]!, id: 'model-pyramid' }] },
      fileSystem,
    );

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.validationError });
    expect(result).toMatchObject({ message: expect.stringContaining('unique') as string });
    expect(fileSystem.writeFile).not.toHaveBeenCalled();
  });

  it('should refuse a chat id that escapes its directory', async () => {
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleWriteTodos({ chatId: '..', items }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.validationError });
    expect(fileSystem.writeFile).not.toHaveBeenCalled();
  });

  it('should surface a write failure as a typed RPC error', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.writeFile.mockRejectedValue(Object.assign(new Error('read-only checkout'), { code: 'EROFS' }));

    const result = await handleWriteTodos({ chatId: 'chat_01', items }, fileSystem);

    expect(result).toEqual({
      success: false,
      errorCode: rpcClientErrorCode.permissionDenied,
      message: 'read-only checkout',
    });
  });
});
