import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createBillableModelEvidenceCollector } from '#api/billing/billable-model-evidence.js';
import type { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { DatabaseService } from '#database/database.service.js';

/* The real 200 stream OpenAI sent on 2026-09-19 with an exhausted organisation balance: no usage, then
 * `error` and `response.failed`. Staging sent the same shape for GPT-6 Luna on 2026-10-09 (FD-12). */
const exhaustedCapture = readFileSync(new URL('../llm/provider-account-stream.fixture.sse', import.meta.url), 'utf8');

const bytes = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);

describe('createBillableModelEvidenceCollector', () => {
  it('should replace cumulative stream usage rather than summing events', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-responses',
      new Set(['uncached_input', 'cache_read', 'cache_write', 'output']),
      'openai',
    );
    collector.accept(
      bytes(
        'data: {"response":{"id":"resp_1","usage":{"input_tokens":"10","output_tokens":"2","input_tokens_details":{"cached_tokens":"3","cache_write_tokens":"1"}}}}\n\n',
      ),
    );
    collector.accept(
      bytes(
        'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_1","status":"completed","usage":{"input_tokens":"20","output_tokens":"7","input_tokens_details":{"cached_tokens":"5","cache_write_tokens":"2"},"output_tokens_details":{"reasoning_tokens":"3"}}}}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'final_usage',
      reasoningTokens: 3n,
      meterItems: [
        { dimension: 'uncached_input', quantity: 13n },
        { dimension: 'cache_read', quantity: 5n },
        { dimension: 'cache_write', quantity: 2n },
        { dimension: 'output', quantity: 7n },
      ],
      normalizationEvidence: { providerRequestId: 'resp_1' },
    });
  });

  it('settles xAI Responses reasoning usage without adding it twice to output', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-responses',
      new Set(['uncached_input', 'cache_read', 'output']),
      'xai',
    );
    collector.accept(
      bytes(
        'event: response.completed\ndata: {"type":"response.completed","response":{"id":"xai-response","status":"completed","usage":{"input_tokens":11,"output_tokens":7,"input_tokens_details":{"cached_tokens":3},"output_tokens_details":{"reasoning_tokens":5}}}}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'final_usage',
      reasoningTokens: 5n,
      meterItems: [
        { dimension: 'uncached_input', quantity: 8n },
        { dimension: 'cache_read', quantity: 3n },
        { dimension: 'output', quantity: 7n },
      ],
      normalizationEvidence: { providerRequestId: 'xai-response' },
    });
  });

  it('should preserve absent required usage as unknown rather than zero', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-responses',
      new Set(['uncached_input', 'cache_read', 'output']),
      'openai',
    );
    collector.accept(bytes('{"id":"resp_2","usage":{"input_tokens":"20","output_tokens":"7"}}'));

    expect(collector.complete()).toMatchObject({
      kind: 'absorbed_unknown',
      meterItems: [{ dimension: 'output', quantity: 7n }],
      normalizationEvidence: { fields: { input: '20', output: '7' } },
    });
  });

  it('should settle an incomplete Responses event when every required usage dimension is present', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-responses',
      new Set(['uncached_input', 'cache_read', 'output']),
      'openai',
    );
    collector.accept(
      bytes(
        'event: response.incomplete\ndata: {"type":"response.incomplete","response":{"id":"resp_incomplete","status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"usage":{"input_tokens":"20","output_tokens":"64","input_tokens_details":{"cached_tokens":"5"},"output_tokens_details":{"reasoning_tokens":"8"}}}}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'final_usage',
      executionStatus: 'succeeded',
      reasoningTokens: 8n,
      meterItems: [
        { dimension: 'uncached_input', quantity: 15n },
        { dimension: 'cache_read', quantity: 5n },
        { dimension: 'output', quantity: 64n },
      ],
      normalizationEvidence: {
        providerRequestId: 'resp_incomplete',
        terminalReason: 'max_output_tokens',
      },
    });
  });

  it('should keep an incomplete Responses event unknown when required usage is missing', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-responses',
      new Set(['uncached_input', 'cache_read', 'output']),
      'openai',
    );
    collector.accept(
      bytes(
        'event: response.incomplete\ndata: {"type":"response.incomplete","response":{"id":"resp_partial","status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"usage":{"input_tokens":"20","output_tokens":"64"}}}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'absorbed_unknown',
      executionStatus: 'unknown',
      meterItems: [{ dimension: 'output', quantity: 64n }],
      normalizationEvidence: {
        providerRequestId: 'resp_partial',
        terminalReason: 'max_output_tokens',
      },
    });
  });

  it('should merge Anthropic message usage dimensions without summing cumulative output', () => {
    const collector = createBillableModelEvidenceCollector(
      'anthropic',
      new Set(['uncached_input', 'cache_read', 'cache_write', 'output']),
      'anthropic',
    );
    collector.accept(
      bytes(
        'data: {"message":{"id":"msg_1","usage":{"input_tokens":10,"cache_read_input_tokens":20,"cache_creation_input_tokens":30,"output_tokens":1}}}\n\ndata: {"usage":{"output_tokens":9}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'final_usage',
      meterItems: [
        { dimension: 'uncached_input', quantity: 10n },
        { dimension: 'cache_read', quantity: 20n },
        { dimension: 'cache_write', quantity: 30n },
        { dimension: 'output', quantity: 9n },
      ],
    });
  });

  it('should preserve integer usage above the JavaScript safe-number range', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-responses',
      new Set(['uncached_input', 'cache_read', 'output']),
      'openai',
    );
    collector.accept(
      bytes(
        'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":9007199254740993,"output_tokens":1,"input_tokens_details":{"cached_tokens":0}}}}\n\n',
      ),
    );

    const evidence = collector.complete();
    expect(evidence.kind).toBe('final_usage');
    expect(evidence.kind === 'final_usage' ? evidence.meterItems[0] : undefined).toMatchObject({
      dimension: 'uncached_input',
      quantity: 9_007_199_254_740_993n,
    });
  });

  it('should not reinterpret escaped JSON text as a financial numeric field', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-responses',
      new Set(['uncached_input', 'cache_read', 'output']),
      'openai',
    );
    collector.accept(
      bytes(
        'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","output_text":"escaped {\\"input_tokens\\":999999999999999999}","usage":{"input_tokens":2,"output_tokens":1,"input_tokens_details":{"cached_tokens":0}}}}\n\n',
      ),
    );
    const evidence = collector.complete();
    expect(evidence.kind === 'final_usage' ? evidence.meterItems[0]?.quantity : undefined).toBe(2n);
  });

  it('should not accept a terminal marker embedded in generated content', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-responses',
      new Set(['uncached_input', 'cache_read', 'output']),
      'openai',
    );
    collector.accept(
      bytes(
        'data: {"type":"response.output_text.delta","delta":"response.completed status completed","response":{"usage":{"input_tokens":2,"output_tokens":1,"input_tokens_details":{"cached_tokens":0}}}}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'absorbed_unknown',
      executionStatus: 'unknown',
    });
  });

  it('should price every Morph prompt token as uncached input', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-completions',
      new Set(['uncached_input', 'output']),
      'morph',
    );
    collector.accept(
      bytes(
        'data: {"id":"req_morph","choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":2,"prompt_tokens_details":{"cached_tokens":19},"completion_tokens_details":{"reasoning_tokens":1}}}\n\ndata: [DONE]\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'final_usage',
      reasoningTokens: 1n,
      meterItems: [
        { dimension: 'uncached_input', quantity: 20n },
        { dimension: 'output', quantity: 2n },
      ],
    });
  });

  it('should not settle a non-Vertex completions stream truncated before its sentinel', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-completions',
      new Set(['uncached_input', 'output']),
      'morph',
    );
    collector.accept(
      bytes(
        'data: {"id":"req_morph_truncated","choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":2}}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'absorbed_unknown',
      executionStatus: 'unknown',
      meterItems: [
        { dimension: 'uncached_input', quantity: 20n },
        { dimension: 'output', quantity: 2n },
      ],
    });
  });

  it('should settle complete Vertex usage at EOF without optional terminal markers', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-completions',
      new Set(['uncached_input', 'output']),
      'vertexai',
    );
    collector.accept(
      bytes(
        'data: {"id":"req_vertex","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":21,"completion_tokens_details":{"reasoning_tokens":78}}}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'final_usage',
      reasoningTokens: 78n,
      meterItems: [
        { dimension: 'uncached_input', quantity: 10n },
        { dimension: 'output', quantity: 99n },
      ],
      normalizationEvidence: { fields: { output: '99' } },
    });
  });

  it('should not settle a truncated Vertex content event that happens to carry usage', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-completions',
      new Set(['uncached_input', 'output']),
      'vertexai',
    );
    collector.accept(
      bytes(
        'data: {"id":"req_vertex_partial","choices":[{"delta":{"content":"unfinished"},"finish_reason":null}],"usage":{"prompt_tokens":10,"completion_tokens":21,"completion_tokens_details":{"reasoning_tokens":78}}}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'absorbed_unknown',
      executionStatus: 'unknown',
      reasoningTokens: 78n,
      meterItems: [
        { dimension: 'uncached_input', quantity: 10n },
        { dimension: 'output', quantity: 99n },
      ],
    });
  });

  /* Live Vertex envelope observed on 2026-09-11 (prompt 7, completion 1, reasoning 74, total 82):
   * `completion_tokens` excludes thought tokens, so output is the sum and reasoning stays informational.
   * Source: docs/research/artifacts/gemini-portable-agent-host-replay-and-billing-blueprint/runs/2026-09-11-execution/reviews/final/report.md:21. */
  it('should meter the live Vertex envelope as completion plus reasoning', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-completions',
      new Set(['uncached_input', 'output']),
      'vertexai',
    );
    collector.accept(
      bytes(
        'data: {"id":"req_vertex_live","choices":[],"usage":{"prompt_tokens":7,"completion_tokens":1,"completion_tokens_details":{"reasoning_tokens":74},"total_tokens":82}}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'final_usage',
      reasoningTokens: 74n,
      meterItems: [
        { dimension: 'uncached_input', quantity: 7n },
        { dimension: 'output', quantity: 75n },
      ],
    });
  });

  /* Production pins `cache_read` on every Gemini route (`rates('.75', '.075', undefined, '3.75')`), and Vertex
   * omits `prompt_tokens_details` on a cache miss; the same live envelope must still settle. */
  it('should meter a Vertex cache miss as zero cache read when the tariff pins it', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-completions',
      new Set(['uncached_input', 'cache_read', 'output']),
      'vertexai',
    );
    collector.accept(
      bytes(
        'data: {"id":"req_vertex_live","choices":[],"usage":{"prompt_tokens":7,"completion_tokens":1,"completion_tokens_details":{"reasoning_tokens":74},"total_tokens":82}}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'final_usage',
      executionStatus: 'succeeded',
      reasoningTokens: 74n,
      meterItems: [
        { dimension: 'uncached_input', quantity: 7n },
        { dimension: 'cache_read', quantity: 0n },
        { dimension: 'output', quantity: 75n },
      ],
    });
  });

  it('should subtract a reported Vertex cache hit from uncached input', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-completions',
      new Set(['uncached_input', 'cache_read', 'output']),
      'vertexai',
    );
    collector.accept(
      bytes(
        'data: {"id":"req_vertex_hit","choices":[],"usage":{"prompt_tokens":11383,"completion_tokens":12,"prompt_tokens_details":{"cached_tokens":11000}}}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'final_usage',
      meterItems: [
        { dimension: 'uncached_input', quantity: 383n },
        { dimension: 'cache_read', quantity: 11_000n },
        { dimension: 'output', quantity: 12n },
      ],
    });
  });

  it('should not settle a Vertex stream cut before any usage envelope', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-completions',
      new Set(['uncached_input', 'output']),
      'vertexai',
    );
    collector.accept(
      bytes('data: {"id":"req_vertex_cut","choices":[{"delta":{"content":"unfinished"},"finish_reason":null}]}\n\n'),
    );

    expect(collector.complete()).toEqual({ kind: 'absorbed_unknown', executionStatus: 'unknown' });
  });

  it('should retain known partial usage and identity without claiming success', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-responses',
      new Set(['uncached_input', 'cache_read', 'output']),
      'openai',
    );
    collector.accept(
      bytes(
        'data: {"response":{"id":"req_partial","usage":{"input_tokens":7,"input_tokens_details":{"cached_tokens":2}}}}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'absorbed_unknown',
      executionStatus: 'unknown',
      meterItems: [
        { dimension: 'uncached_input', quantity: 5n },
        { dimension: 'cache_read', quantity: 2n },
      ],
      normalizationEvidence: {
        providerRequestId: 'req_partial',
        fields: { input: '7' },
      },
    });
  });

  it('should not inherit a missing cache field from an earlier OpenAI snapshot', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-responses',
      new Set(['uncached_input', 'cache_read', 'output']),
      'openai',
    );
    collector.accept(
      bytes(
        'data: {"response":{"id":"req_cumulative","usage":{"input_tokens":5,"output_tokens":1,"input_tokens_details":{"cached_tokens":2}}}}\n\n',
      ),
    );
    collector.accept(
      bytes(
        'event: response.completed\ndata: {"type":"response.completed","response":{"id":"req_cumulative","status":"completed","usage":{"input_tokens":8,"output_tokens":3}}}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({
      kind: 'absorbed_unknown',
      executionStatus: 'unknown',
      meterItems: [{ dimension: 'output', quantity: 3n }],
      normalizationEvidence: {
        providerRequestId: 'req_cumulative',
        fields: { input: '8', output: '3' },
      },
    });
  });
  /* A supplier that answered with a status ran nothing: the refusal keeps its own kind and settles
   * released at zero, instead of waiting on supplier evidence that can never come and pausing the
   * route a day later (the staging Haiku 5.5 pause of 2026-10-08). */
  it('should settle a provider refusal as rejected rather than absorbing it', () => {
    const collector = createBillableModelEvidenceCollector(
      'anthropic',
      new Set(['uncached_input', 'cache_read', 'cache_write', 'output']),
      'anthropic',
    );

    expect(collector.failed('provider_rejected')).toEqual({
      kind: 'provider_rejected',
      executionStatus: 'rejected',
      normalizationEvidence: { version: 'provider-usage-v1', terminalReason: 'provider_rejected', fields: {} },
    });
  });

  /* A stream the supplier failed before any usage is the same proof of zero cost as a pre-stream refusal:
   * it settles released now, instead of holding the customer's credits until the recovery deadline. */
  it('should settle a stream the supplier failed before any usage as rejected', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-responses',
      new Set(['uncached_input', 'cache_read', 'cache_write', 'output']),
      'openai',
    );
    collector.accept(bytes(exhaustedCapture));

    expect(collector.complete()).toEqual({
      kind: 'provider_rejected',
      executionStatus: 'rejected',
      normalizationEvidence: { version: 'provider-usage-v1', terminalReason: 'provider_failed', fields: {} },
    });
  });

  /* The ledger persists `fields` as measured quantities and rejects any other value before it writes, so a
   * terminal the collector shapes has to pass that schema or the turn keeps its hold: on staging the first
   * release of a failed stream named the supplier's code in a field and never settled (Run 2 FD-12). The
   * ledger is driven only as far as its serialization; the stub transaction stands in for the write. */
  it('should shape a failed-stream terminal the ledger retains', async () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-responses',
      new Set(['uncached_input', 'cache_read', 'cache_write', 'output']),
      'openai',
    );
    collector.accept(bytes(exhaustedCapture));
    const transaction = vi.fn(async () => undefined);
    const ledger = new CreditLedgerService(
      { database: { transaction } } as unknown as Pick<DatabaseService, 'database'>,
      {} as BillingPolicyService,
    );
    const retain = async (evidence: ReturnType<typeof collector.complete>) =>
      ledger.recordInvocationEvidence({
        operationId: '23e17cf6-d476-4c6d-a516-870e0d303059',
        accountId: 'account',
        requestDigest: `hmac-sha256:${'a'.repeat(64)}`,
        evidence,
      });
    const evidence = collector.complete();

    await expect(retain(evidence)).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledOnce();
    // The control: the same terminal with a code in a field is what the ledger refused on staging.
    await expect(
      retain({
        ...evidence,
        normalizationEvidence: {
          version: 'provider-usage-v1',
          terminalReason: 'provider_failed',
          fields: { providerCode: 'credit_balance_exhausted' },
        },
      }),
    ).rejects.toThrow();
    expect(transaction).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: 'an Anthropic error event',
      wire: 'anthropic',
      providerId: 'anthropic',
      stream:
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","usage":null}}\n\n' +
        'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n',
    },
    {
      name: 'an OpenAI-compatible error body',
      wire: 'openai-completions',
      providerId: 'vertexai',
      stream: 'data: {"error":{"code":429,"message":"Resource exhausted.","status":"RESOURCE_EXHAUSTED"}}\n\n',
    },
  ] as const)('should settle $name that carried no usage as rejected', ({ wire, providerId, stream }) => {
    const collector = createBillableModelEvidenceCollector(wire, new Set(['uncached_input', 'output']), providerId);
    collector.accept(bytes(stream));

    expect(collector.complete()).toMatchObject({
      kind: 'provider_rejected',
      executionStatus: 'rejected',
      normalizationEvidence: { terminalReason: 'provider_failed', fields: {} },
    });
  });

  /* Usage reported before the failure may already be a supplier charge, so it stays on the unknown path. */
  it('should keep a stream that failed after reporting usage unknown', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-responses',
      new Set(['uncached_input', 'cache_read', 'output']),
      'openai',
    );
    collector.accept(
      bytes(
        'data: {"response":{"id":"resp_partial","usage":{"input_tokens":"20","output_tokens":"7","input_tokens_details":{"cached_tokens":"5"}}}}\n\n' +
          'event: response.failed\ndata: {"type":"response.failed","response":{"id":"resp_partial","status":"failed","error":{"code":"server_error","message":"The server had an error."}}}\n\n',
      ),
    );

    expect(collector.complete()).toMatchObject({ kind: 'absorbed_unknown', executionStatus: 'unknown' });
  });

  /* B7 I3 / R8 + W4: `executionStatus` alone cannot separate a ceiling cut from an abort. */
  it.each([
    ['authorized_exhausted', 'authorized_exhausted'],
    ['client_abort', 'absorbed_unknown'],
    ['deadline', 'absorbed_unknown'],
  ] as const)('should retain %s as the terminal reason of a %s terminal', (reason, kind) => {
    const collector = createBillableModelEvidenceCollector('openai-responses', new Set(['uncached_input']), 'openai');
    collector.accept(bytes('data: {"type":"response.output_text.delta","delta":"partial"}\n\n'));

    expect(collector.failed(reason)).toEqual({
      kind,
      executionStatus: 'cancelled',
      normalizationEvidence: { version: 'provider-usage-v1', terminalReason: reason, fields: {} },
    });
  });

  it('should keep the provider incomplete reason ahead of the gateway reason', () => {
    const collector = createBillableModelEvidenceCollector(
      'openai-responses',
      new Set(['uncached_input', 'output']),
      'openai',
    );
    collector.accept(
      bytes(
        'data: {"type":"response.incomplete","response":{"id":"resp_cut","status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"usage":{"input_tokens":4,"output_tokens":2}}}\n\n',
      ),
    );

    expect(collector.failed('authorized_exhausted')).toMatchObject({
      kind: 'authorized_exhausted',
      executionStatus: 'cancelled',
      meterItems: [
        { dimension: 'uncached_input', quantity: 4n },
        { dimension: 'output', quantity: 2n },
      ],
      normalizationEvidence: { terminalReason: 'max_output_tokens' },
    });
  });
});
