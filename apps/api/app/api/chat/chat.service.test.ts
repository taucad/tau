import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { convertToModelMessages, DefaultChatTransport, readUIMessageStream } from 'ai';
import { ChatService } from '#api/chat/chat.service.js';
import type { ModelInvocationIntent, ModelInvocationService } from '#api/llm/model-invocation.types.js';
import { CodeOwnedBillableModelQualificationResolver } from '#api/billing/billable-model-qualification.js';
import type { BillableModelProviderAdapter } from '#api/billing/billable-model-invocation.types.js';

/* eslint-disable @typescript-eslint/naming-convention -- synthetic supplier fixture uses exact Responses fields */
const nativeStream = (terminal: 'completed' | 'incomplete' = 'completed') =>
  [
    { type: 'response.created', response: { id: 'response-fixture', model: 'gpt-5.6-luna', created_at: 1 } },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { type: 'message', id: 'message-fixture', role: 'assistant', content: [], status: 'in_progress' },
    },
    {
      type: 'response.output_text.delta',
      item_id: 'message-fixture',
      output_index: 0,
      content_index: 0,
      delta: 'Named part',
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: {
        type: 'message',
        id: 'message-fixture',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Named part', annotations: [] }],
        status: 'completed',
      },
    },
    {
      type: `response.${terminal}`,
      response: {
        id: 'response-fixture',
        model: 'gpt-5.6-luna',
        created_at: 1,
        status: terminal,
        ...(terminal === 'incomplete' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}),
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      },
    },
  ]
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join('');
/* eslint-enable @typescript-eslint/naming-convention -- remaining test values are local contracts */

const validPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

it('uses the installed SDK for native text/image input and the actual UI stream consumer', async () => {
  const owner = mock<ModelInvocationService>();
  const resolver = new CodeOwnedBillableModelQualificationResolver({
    adapters: new Map([['openai-gpt-5.6-luna', mock<BillableModelProviderAdapter>()]]),
    credentialAccounts: new Map([['openai', 'fixture']]),
    executionTimeout: 1000,
  });
  let captured: ModelInvocationIntent | undefined;
  let admitted = false;
  owner.invoke.mockImplementation(async (intent) => {
    captured = intent;
    resolver.resolve({ ...intent, environment: 'development' });
    intent.onAdmitted?.('operation-fixture');
    return {
      state: 'streaming',
      operationId: 'operation-fixture',
      response: new Response(nativeStream(), { headers: { 'content-type': 'text/event-stream' } }),
      completion: Promise.resolve(),
    };
  });
  const service = new ChatService(owner);
  const messages = await convertToModelMessages([
    {
      role: 'user',
      parts: [
        { type: 'text', text: 'Name this part' },
        { type: 'file', mediaType: 'image/png', url: `data:image/png;base64,${validPng}` },
      ],
    },
  ]);
  const result = await service.getBuildNameGenerator(
    messages,
    'owner',
    'attempt',
    { projectHint: 'project' },
    new AbortController().signal,
    () => {
      admitted = true;
    },
  );
  expect(admitted).toBe(true);
  expect(owner.invoke).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(captured?.body)).toContain(JSON.stringify({ type: 'input_text', text: 'Name this part' }));
  expect(JSON.stringify(captured?.body)).toContain(`data:image/png;base64,${validPng}`);
  expect(captured?.body).toMatchObject({
    // eslint-disable-next-line @typescript-eslint/naming-convention -- exact native Responses request field
    max_output_tokens: 64,
    reasoning: { effort: 'none' },
    store: false,
  });
  if (result.state !== 'streaming') {
    throw new Error('Expected stream');
  }
  const transport = new DefaultChatTransport({
    api: 'http://fixture.invalid/chat',
    fetch: async () => result.response,
  });
  const stream = await transport.sendMessages({
    chatId: 'chat',
    messages: [],
    trigger: 'submit-message',
    messageId: undefined,
    abortSignal: new AbortController().signal,
  });
  let text = '';
  for await (const message of readUIMessageStream({ stream })) {
    text = message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');
  }
  expect(text).toBe('Named part');
  await result.completion;
});

it.each([
  ['project_name', 'title', 'getBuildNameGenerator'],
  ['commit_name', 'commit', 'getCommitMessageGenerator'],
] as const)('carries both hints into the %s intent as activity %s', async (_surface, activity, method) => {
  // The gateway surface produces these from headers; the API's own helper
  // surfaces produce them from the turn request, and both file the same receipt.
  const owner = mock<ModelInvocationService>();
  let captured: ModelInvocationIntent | undefined;
  owner.invoke.mockImplementation(async (intent) => {
    captured = intent;
    return {
      state: 'streaming',
      operationId: 'operation-fixture',
      response: new Response(nativeStream(), { headers: { 'content-type': 'text/event-stream' } }),
      completion: Promise.resolve(),
    };
  });

  await new ChatService(owner)[method](
    [{ role: 'user', content: 'Name this part' }],
    'owner',
    'attempt',
    { projectHint: 'proj_01J8ZK4E', chatHint: 'chat_01J8ZK4F' },
    new AbortController().signal,
  );

  expect(captured).toMatchObject({ activity, projectHint: 'proj_01J8ZK4E', chatHint: 'chat_01J8ZK4F' });
});

it('leaves an absent hint off the intent instead of sending an empty one', async () => {
  const owner = mock<ModelInvocationService>();
  let captured: ModelInvocationIntent | undefined;
  owner.invoke.mockImplementation(async (intent) => {
    captured = intent;
    return {
      state: 'streaming',
      operationId: 'operation-fixture',
      response: new Response(nativeStream(), { headers: { 'content-type': 'text/event-stream' } }),
      completion: Promise.resolve(),
    };
  });

  await new ChatService(owner).getBuildNameGenerator(
    [{ role: 'user', content: 'Name this part' }],
    'owner',
    'attempt',
    { chatHint: 'chat_01J8ZK4F' },
    new AbortController().signal,
  );

  expect(captured).not.toHaveProperty('projectHint');
  expect(captured).toMatchObject({ chatHint: 'chat_01J8ZK4F' });
});

it('returns bounded commit text from a max-output response without retrying', async () => {
  const owner = mock<ModelInvocationService>();
  let captured: ModelInvocationIntent | undefined;
  owner.invoke.mockImplementation(async (intent) => {
    captured = intent;
    return {
      state: 'streaming',
      operationId: 'operation-fixture',
      response: new Response(nativeStream('incomplete'), { headers: { 'content-type': 'text/event-stream' } }),
      completion: Promise.resolve(),
    };
  });
  const service = new ChatService(owner);
  const result = await service.getCommitMessageGenerator(
    [{ role: 'user', content: 'Describe the change' }],
    'owner',
    'attempt',
    { projectHint: 'project' },
    new AbortController().signal,
  );
  if (result.state !== 'streaming') {
    throw new Error('Expected stream');
  }
  const transport = new DefaultChatTransport({
    api: 'http://fixture.invalid/chat',
    fetch: async () => result.response,
  });
  const stream = await transport.sendMessages({
    chatId: 'chat',
    messages: [],
    trigger: 'submit-message',
    messageId: undefined,
    abortSignal: new AbortController().signal,
  });
  let text = '';
  for await (const message of readUIMessageStream({ stream })) {
    text = message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');
  }
  expect(text).toBe('Named part');
  expect(owner.invoke).toHaveBeenCalledTimes(1);
  expect(captured).toMatchObject({
    activity: 'commit',
    body: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- exact native Responses request field
      max_output_tokens: 64,
      reasoning: { effort: 'none' },
      store: false,
    },
  });
  await result.completion;
});

describe('secondary generator admission outcomes', () => {
  it('settles replay and owner failure without hanging or retrying', async () => {
    const owner = mock<ModelInvocationService>();
    const service = new ChatService(owner);
    owner.invoke.mockResolvedValue({ state: 'terminal', operationId: 'old-operation' });
    await expect(
      service.getCommitMessageGenerator(
        [{ role: 'user', content: 'name it' }],
        'owner',
        'attempt',
        { projectHint: 'project' },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ state: 'terminal', operationId: 'old-operation' });
    expect(owner.invoke).toHaveBeenCalledTimes(1);
    owner.invoke.mockRejectedValue(new Error('Owner denied invocation'));
    await expect(
      service.getCommitMessageGenerator(
        [{ role: 'user', content: 'name it' }],
        'owner',
        'other-attempt',
        { projectHint: 'project' },
        new AbortController().signal,
      ),
    ).rejects.toThrow('Owner denied invocation');
    expect(owner.invoke).toHaveBeenCalledTimes(2);
  });

  it('retains billing completion failures after SDK output completes', async () => {
    const owner = mock<ModelInvocationService>();
    const completed = Promise.withResolvers<void>();
    owner.invoke.mockResolvedValue({
      state: 'streaming',
      operationId: 'operation-fixture',
      response: new Response(nativeStream(), { headers: { 'content-type': 'text/event-stream' } }),
      completion: completed.promise,
    });
    const service = new ChatService(owner);
    const result = await service.getBuildNameGenerator(
      [{ role: 'user', content: 'name it' }],
      'owner',
      'attempt',
      { projectHint: 'project' },
      new AbortController().signal,
    );
    if (result.state !== 'streaming') {
      throw new Error('Expected stream');
    }
    await result.response.text();
    const failed = expect(result.completion).rejects.toThrow('Billing completion failed');
    completed.reject(new Error('Billing completion failed'));
    await failed;
  });

  it('settles SDK validation failure before funded fetch', async () => {
    const owner = mock<ModelInvocationService>();
    const service = new ChatService(owner);
    await expect(
      service.getBuildNameGenerator([], 'owner', 'attempt', { projectHint: 'project' }, new AbortController().signal),
    ).rejects.toThrow();
    expect(owner.invoke).not.toHaveBeenCalled();
  });

  it('propagates cancellation while admission is pending', async () => {
    const owner = mock<ModelInvocationService>();
    const service = new ChatService(owner);
    const started = Promise.withResolvers<void>();
    owner.invoke.mockImplementation(async ({ signal }) => {
      started.resolve();
      return new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            reject(new Error('Cancelled pending admission'));
          },
          { once: true },
        );
      });
    });
    const controller = new AbortController();
    const result = service.getBuildNameGenerator(
      [{ role: 'user', content: 'name it' }],
      'owner',
      'attempt',
      { projectHint: 'project' },
      controller.signal,
    );
    const rejected = expect(result).rejects.toThrow('Cancelled pending admission');
    await started.promise;
    controller.abort(new Error('Cancelled pending admission'));
    await rejected;
    expect(owner.invoke).toHaveBeenCalledTimes(1);
  });

  it('rejects an already aborted request without admission', async () => {
    const owner = mock<ModelInvocationService>();
    const service = new ChatService(owner);
    await expect(
      service.getBuildNameGenerator(
        [],
        'owner',
        'attempt',
        { projectHint: 'project' },
        AbortSignal.abort(new Error('Cancelled')),
      ),
    ).rejects.toThrow('Cancelled');
    expect(owner.invoke).not.toHaveBeenCalled();
  });
});
