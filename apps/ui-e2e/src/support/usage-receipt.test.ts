// @vitest-environment node
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import { classifyReceipts } from './usage-receipt.ts';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import type { UsageReceipt } from './usage-receipt.ts';

/**
 * The receipt verdict the two live specs spend real provider credit to reach.
 *
 * `expectSettledReceipts` used to assert that *every* matching receipt was
 * settled, which a recovered turn cannot satisfy: a transient provider refusal
 * writes a `released`/`rejected` base receipt for the same model, and the
 * retried call that actually paid writes another. One live Gemini run failed on
 * exactly that while the turn itself succeeded. The verdict that survives a
 * recovery — enough charged receipts, and no absorbed one — is pinned here
 * rather than in a 6-minute browser run.
 */
const receipt = (overrides: Partial<UsageReceipt> = {}): UsageReceipt => ({
  kind: 'base',
  activity: { kind: 'agent', projectHint: null, chatHint: null },
  customerState: 'settled',
  executionStatus: 'succeeded',
  meteringStatus: 'complete',
  model: { id: 'gemini-3.7-flash', providerId: 'vertexai' },
  operationId: 'op-settled',
  tokens: { output: '512', reasoning: '64' },
  ...overrides,
});

const vertex = (row: UsageReceipt): boolean => row.model.providerId === 'vertexai';

describe('classifyReceipts', () => {
  it('keeps the charged receipts of a turn that recovered from a provider refusal', () => {
    const released = receipt({
      customerState: 'released',
      executionStatus: 'rejected',
      meteringStatus: 'unavailable',
      operationId: 'op-released',
      tokens: { output: null, reasoning: null },
    });

    const verdict = classifyReceipts([receipt(), released, receipt({ operationId: 'op-second' })], vertex);

    expect(verdict.settled.map((row) => row.operationId)).toEqual(['op-settled', 'op-second']);
    expect(verdict.absorbed).toEqual([]);
  });

  it('reports an absorbed receipt, which is a defect rather than a recovery', () => {
    const absorbed = receipt({ customerState: 'absorbed', operationId: 'op-absorbed' });

    const verdict = classifyReceipts([receipt(), absorbed], vertex);

    expect(verdict.settled.map((row) => row.operationId)).toEqual(['op-settled']);
    expect(verdict.absorbed.map((row) => row.operationId)).toEqual(['op-absorbed']);
  });

  it('never counts a receipt whose metering never completed as charged', () => {
    const partial = receipt({ meteringStatus: 'partial', operationId: 'op-partial' });

    expect(classifyReceipts([partial], vertex).settled).toEqual([]);
  });

  it('owns only the rows the match names', () => {
    const openai = receipt({ model: { id: 'gpt-5.6-sol', providerId: 'openai' }, operationId: 'op-openai' });

    const verdict = classifyReceipts([receipt(), openai], vertex);

    expect(verdict.settled.map((row) => row.operationId)).toEqual(['op-settled']);
  });
});
