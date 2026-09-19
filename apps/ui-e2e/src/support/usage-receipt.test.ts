// @vitest-environment node
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import { attributionFaults, chatIdFromUrl, classifyReceipts } from './usage-receipt.ts';
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

describe('chatIdFromUrl', () => {
  /* The route segment is the project's *slug*, which the app resolves to a
     durable `proj_…` id before the host attributes anything to it, so the URL
     answers for the chat and nothing else. Reading that segment as a project id
     failed all five live specs on receipts that were in fact correct. */
  it('reads the open chat out of a workspace URL whose project segment is a slug', () => {
    expect(chatIdFromUrl('http://localhost:3020/w/home/provider-switch-vertex-to-anthropic?chat=chat_7ab')).toBe(
      'chat_7ab',
    );
  });

  it.each([
    { label: 'no chat is open', url: 'http://localhost:3020/w/home/gearbox' },
    { label: 'no project is open', url: 'http://localhost:3020/w/home?chat=chat_7ab' },
    { label: 'the page is not a workspace', url: 'http://localhost:3020/usage?chat=chat_7ab' },
  ])('refuses to read a chat id when $label', ({ url }) => {
    expect(() => chatIdFromUrl(url)).toThrow(/names no open chat/u);
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

/*
 * Two rows as `/v1/billing/usage` returned them to the *Vertex to Anthropic*
 * switch run, one per side of the switch, verbatim but for their `meterItems`
 * rate tables (nothing here reads them) and their hints, which that capture
 * predates. The hints carry what the first run with the producers wired in
 * reported: the project id the failure message named, in a chat whose id the
 * same run proved matched, and a URL whose project segment is the slug the run
 * wrongly compared against it.
 */
const capturedUrl = 'http://localhost:3011/w/home/provider-switch-vertex-to-anthropic?chat=chat_2u0Vd6Uc1BwZMIDMuuRkn';
const capturedProjectId = 'proj_y2UYEXdZcedEF1sv9SnSh';
const capturedRows = [
  {
    schemaVersion: 1,
    environment: 'development',
    ownerId: 'user_sO4Ji9ig22PSLU3HzCNl0',
    subjectId: 'ab1cd086-f649-4dea-8594-cd16f2a919eb',
    operationId: '27d02cdf-7291-49dc-9daa-441b8f1bb05d',
    baseTransactionId: '09e38346-0bed-4f23-bbdf-d3640dc3142d',
    terminalRevision: '9',
    policyVersion: 'development-v2',
    activationId: 'hold-redesign-2026-09-12-v4',
    meterContractId: 'model-meter-v1:anthropic-claude-haiku-4.5',
    category: 'llm',
    model: { id: 'claude-haiku-4-5-20251001', displayName: 'Haiku 4.5', providerId: 'anthropic' },
    activity: {
      kind: 'agent',
      projectHint: capturedProjectId,
      chatHint: 'chat_2u0Vd6Uc1BwZMIDMuuRkn',
      parentAttemptKey: null,
    },
    historyVersion: 1,
    admittedAt: '2026-09-19T05:13:28.136892Z',
    dispatchIntentAt: '2026-09-19T05:13:28.151092Z',
    usageOccurredAt: '2026-09-19T05:13:28.151092Z',
    evidenceOccurredAt: '2026-09-19T05:13:29.967000Z',
    timingStatus: 'dispatch_intent',
    kind: 'base',
    resolvedAt: '2026-09-19T05:13:30.009000Z',
    executionStatus: 'succeeded',
    customerState: 'settled',
    authorizedMaxCreditAtoms: '181983',
    chargedCreditAtoms: '2421',
    accountDeltaCreditAtoms: '-2421',
    meteringStatus: 'complete',
    tokens: {
      status: 'complete',
      uncachedInput: '12',
      cacheRead: '11114',
      cacheWrite: '339',
      inputTotal: '11465',
      output: '63',
    },
  },
  {
    schemaVersion: 1,
    environment: 'development',
    ownerId: 'user_sO4Ji9ig22PSLU3HzCNl0',
    subjectId: 'ab1cd086-f649-4dea-8594-cd16f2a919eb',
    operationId: 'd84ed5a8-c31b-44c4-8a47-979ff5688926',
    baseTransactionId: 'f4b26a0e-6e03-47ce-ad71-8d3409bf8faa',
    terminalRevision: '3',
    policyVersion: 'development-v2',
    activationId: 'hold-redesign-2026-09-12-v4',
    meterContractId: 'model-meter-v1:google-gemini-3.7-flash',
    category: 'llm',
    model: { id: 'gemini-3.7-flash', displayName: 'Gemini 3.7 Flash', providerId: 'vertexai' },
    activity: {
      kind: 'agent',
      projectHint: capturedProjectId,
      chatHint: 'chat_2u0Vd6Uc1BwZMIDMuuRkn',
      parentAttemptKey: null,
    },
    historyVersion: 1,
    admittedAt: '2026-09-19T05:13:04.926789Z',
    dispatchIntentAt: '2026-09-19T05:13:04.955108Z',
    usageOccurredAt: '2026-09-19T05:13:04.955108Z',
    evidenceOccurredAt: '2026-09-19T05:13:10.781000Z',
    timingStatus: 'dispatch_intent',
    kind: 'base',
    resolvedAt: '2026-09-19T05:13:10.851000Z',
    executionStatus: 'succeeded',
    customerState: 'settled',
    authorizedMaxCreditAtoms: '125467',
    chargedCreditAtoms: '8651',
    accountDeltaCreditAtoms: '-8651',
    meteringStatus: 'complete',
    tokens: {
      status: 'complete',
      uncachedInput: '7663',
      cacheRead: '0',
      cacheWrite: '0',
      inputTotal: '7663',
      output: '242',
      reasoning: '208',
    },
  },
] as const;

/**
 * The verdict, over rows the live API really returned, against the identity the
 * specs really build.
 *
 * The producers landed and every turn of the Appendix B run billed correctly,
 * yet all five live specs failed — because the identity was read off the URL's
 * project segment, which is a slug. That is a defect in the test's source of
 * truth, and it is provable here for the price of one captured run.
 */
describe('the identity a live spec judges its captured receipts by', () => {
  // The captured rows carry every field the wire sends; this module reads a subset.
  const captured: readonly UsageReceipt[] = capturedRows;

  it('accepts the run once the project id comes from the device record rather than the URL', () => {
    expect(attributionFaults(captured, { projectId: capturedProjectId, chatId: chatIdFromUrl(capturedUrl) })).toEqual(
      [],
    );
  });

  it("reports every receipt when the URL's project slug stands in for the project id", () => {
    const slug = new URL(capturedUrl).pathname.split('/')[3] ?? '';

    const faults = attributionFaults(captured, { projectId: slug, chatId: chatIdFromUrl(capturedUrl) });

    expect(faults).toEqual([
      `27d02cdf-7291-49dc-9daa-441b8f1bb05d (claude-haiku-4-5-20251001) names project ${capturedProjectId}, not provider-switch-vertex-to-anthropic`,
      `d84ed5a8-c31b-44c4-8a47-979ff5688926 (gemini-3.7-flash) names project ${capturedProjectId}, not provider-switch-vertex-to-anthropic`,
    ]);
  });
});
