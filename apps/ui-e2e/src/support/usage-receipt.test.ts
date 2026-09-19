// @vitest-environment node
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import { attributionFaults, classifyReceipts, turnIdentityFromUrl } from './usage-receipt.ts';
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

describe('turnIdentityFromUrl', () => {
  it('reads the project and chat a live spec is driving out of the workspace URL', () => {
    expect(turnIdentityFromUrl('http://localhost:3020/w/home/proj_9f2?chat=chat_7ab')).toEqual({
      projectId: 'proj_9f2',
      chatId: 'chat_7ab',
    });
  });

  it.each([
    { label: 'no chat is open', url: 'http://localhost:3020/w/home/proj_9f2' },
    { label: 'no project is open', url: 'http://localhost:3020/w/home?chat=chat_7ab' },
    { label: 'the page is not a workspace', url: 'http://localhost:3020/usage?chat=chat_7ab' },
  ])('refuses to guess an identity when $label', ({ url }) => {
    expect(() => turnIdentityFromUrl(url)).toThrow(/names no project and chat/u);
  });
});

/**
 * Attribution is what makes a receipt readable: `/usage` groups spend by
 * project and chat, and the hints are the only thing it can group by. Both
 * producers are headers the host sets per request, so a wiring mistake shows up
 * as null hints on a run that otherwise looks perfect — which is exactly what
 * the two live specs cost too much to discover by hand.
 */
describe('attributionFaults', () => {
  const turn = { projectId: 'proj_9f2', chatId: 'chat_7ab' };
  const attributed = (overrides: Partial<UsageReceipt> = {}): UsageReceipt =>
    receipt({
      activity: { kind: 'agent', projectHint: turn.projectId, chatHint: turn.chatId },
      ...overrides,
    });

  it('accepts a run whose every turn receipt names its project and chat', () => {
    expect(attributionFaults([attributed(), attributed({ operationId: 'op-2' })], turn)).toEqual([]);
  });

  it('holds a compaction receipt to the same attribution as the turn that caused it', () => {
    const compaction = attributed({
      activity: { kind: 'compaction', projectHint: turn.projectId, chatHint: turn.chatId },
      operationId: 'op-compaction',
    });

    expect(attributionFaults([attributed(), compaction], turn)).toEqual([]);
  });

  it.each([
    { label: 'a null project hint', projectHint: null, chatHint: turn.chatId, fault: /names project null/u },
    { label: 'a null chat hint', projectHint: turn.projectId, chatHint: null, fault: /names chat null/u },
    {
      label: "another chat's id",
      projectHint: turn.projectId,
      chatHint: 'chat_other',
      fault: /names chat chat_other/u,
    },
    {
      label: "another project's id",
      projectHint: 'proj_other',
      chatHint: turn.chatId,
      fault: /names project proj_other/u,
    },
  ])('reports $label on a turn receipt', ({ projectHint, chatHint, fault }) => {
    const faults = attributionFaults([attributed({ activity: { kind: 'agent', projectHint, chatHint } })], turn);

    expect(faults).toHaveLength(1);
    expect(faults[0]).toMatch(fault);
  });

  /* The two helper surfaces bill against the same chat by design
     (`chat.controller.ts` passes the chat id), so their receipts are not a
     fault — but a host turn recorded as anything else is. */
  it('leaves the name and commit helpers alone while refusing any other kind on this chat', () => {
    const title = attributed({ activity: { kind: 'title', projectHint: turn.projectId, chatHint: turn.chatId } });
    const commit = attributed({ activity: { kind: 'commit', projectHint: turn.projectId, chatHint: turn.chatId } });
    const mislabelled = attributed({
      activity: { kind: 'other', projectHint: turn.projectId, chatHint: turn.chatId },
      operationId: 'op-mislabelled',
    });

    expect(attributionFaults([attributed(), title, commit], turn)).toEqual([]);

    const faults = attributionFaults([attributed(), mislabelled], turn);
    expect(faults).toHaveLength(1);
    expect(faults[0]).toMatch(/op-mislabelled.*"other"/u);
  });

  /* A helper receipt for another chat is swept in by the switch spec's
     provider-wide match; it is not this chat's business either way. */
  it('ignores a receipt that belongs to neither this chat nor a host turn', () => {
    const elsewhere = receipt({
      activity: { kind: 'title', projectHint: 'proj_other', chatHint: 'chat_other' },
      operationId: 'op-elsewhere',
    });

    expect(attributionFaults([attributed(), elsewhere], turn)).toEqual([]);
  });

  it('refuses a run that produced no host turn receipt at all', () => {
    const title = attributed({ activity: { kind: 'title', projectHint: turn.projectId, chatHint: turn.chatId } });

    expect(attributionFaults([title], turn)).toEqual([expect.stringMatching(/no agent or compaction receipt/u)]);
  });
});
