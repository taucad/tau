import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { CodeCompletionService } from '#api/code-completion/code-completion.service.js';
import type { BillableModelInvocationService } from '#api/billing/billable-model-invocation.service.js';

describe('CodeCompletionService', () => {
  it('maps malformed runtime input to a bounded bad request before invoking the owner', async () => {
    const invocations = { invoke: vi.fn() };
    const service = new CodeCompletionService(
      invocations as unknown as BillableModelInvocationService,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_ENVIRONMENT: 'development' }),
    );

    await expect(service.complete({}, 'user', new AbortController().signal)).rejects.toMatchObject({ status: 400 });
    expect(invocations.invoke).not.toHaveBeenCalled();
  });

  it('validates and routes a completion through the shared owner', async () => {
    const invocations = { invoke: vi.fn(async () => ({ state: 'pending', operationId: 'operation' })) };
    const service = new CodeCompletionService(
      invocations as unknown as BillableModelInvocationService,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_ENVIRONMENT: 'development' }),
    );
    await service.complete(
      {
        admission: { version: 1, idempotencyKey: 'attempt_00000001' },
        completionMetadata: { textBeforeCursor: 'a', textAfterCursor: 'b' },
      },
      'user',
      new AbortController().signal,
    );
    expect(invocations.invoke).toHaveBeenCalledOnce();
  });
});
