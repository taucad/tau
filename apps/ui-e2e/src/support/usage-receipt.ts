/* oxlint-disable typescript/no-restricted-types -- The billing boundary returns explicit JSON nulls; swapping them for `undefined` would stop modelling what the API returns. */
/**
 * The `/v1/billing/usage` rows the live specs read, and how a run is judged by them.
 *
 * Deliberately free of browser imports: the judgement is the part worth pinning
 * without a server, a browser and real provider credit. The drive-and-settle
 * helpers that fetch these rows live in `live-chat-turn.ts`.
 */

/** One `/v1/billing/usage` row for a model turn. */
export type UsageReceipt = {
  readonly kind: 'base';
  /** Attribution the usage feed groups by; the hints are null until a producer sets them. */
  readonly activity: {
    readonly kind: string;
    readonly projectHint: string | null;
    readonly chatHint: string | null;
  };
  readonly customerState: 'absorbed' | 'released' | 'settled';
  readonly executionStatus: string;
  readonly meteringStatus: string;
  readonly model: { readonly id: string; readonly providerId: string | null };
  readonly operationId: string;
  readonly tokens: {
    readonly output: string | null;
    readonly reasoning?: string | null;
  };
};

/**
 * Split the receipts an assertion owns into the ones that were charged and the ones that are defects.
 *
 * A turn that recovered from a provider refusal legitimately leaves a
 * `released`/`rejected` receipt for the same model beside the charged ones, so
 * "every matching receipt settled" fails a run that is in fact correct. What has
 * to hold is that enough receipts settled end to end and that none was
 * `absorbed` — the state where Tau ate the cost, which is never a recovery.
 *
 * @param receipts - Every base row the signed-in account has.
 * @param match - Which rows this assertion owns (by provider or provider-side model).
 * @returns The fully settled rows, and the absorbed ones a caller must refuse.
 */
export const classifyReceipts = (
  receipts: readonly UsageReceipt[],
  match: (receipt: UsageReceipt) => boolean,
): { readonly absorbed: readonly UsageReceipt[]; readonly settled: readonly UsageReceipt[] } => {
  const matched = receipts.filter((receipt) => match(receipt));
  return {
    absorbed: matched.filter((receipt) => receipt.customerState === 'absorbed'),
    settled: matched.filter(
      (receipt) =>
        receipt.customerState === 'settled' &&
        receipt.executionStatus === 'succeeded' &&
        receipt.meteringStatus === 'complete',
    ),
  };
};

/** The project and chat a live spec drives; every receipt its turns produce has to name both. */
export type TurnIdentity = { readonly projectId: string; readonly chatId: string };

/**
 * The identity of the chat a live spec has open, as the workspace URL names it.
 *
 * `/w/<workspace>/<projectId>?chat=<chatId>` is the route the spec waits for
 * before its first turn, and those two ids are the same ones the browser host
 * sends as `x-tau-project-id` and `x-tau-chat-id` — so a receipt can be checked
 * for equality rather than merely for being non-null.
 *
 * @param url - The target page's current URL.
 * @returns The project and chat ids.
 * @throws When the URL is not a workspace route with a chat open, rather than
 * guessing an id and asserting against the wrong thing.
 */
export const turnIdentityFromUrl = (url: string): TurnIdentity => {
  const parsed = new URL(url);
  const segments = parsed.pathname.split('/').filter((segment) => segment !== '');
  const projectId = segments[0] === 'w' && segments.length >= 3 ? segments[2] : undefined;
  const chatId = parsed.searchParams.get('chat');
  if (projectId === undefined || chatId === null || chatId === '') {
    throw new Error(`The live chat URL names no project and chat: ${url}`);
  }
  return { projectId, chatId };
};

/** What the browser host's own model calls bill as; T7 tells the two apart by header. */
const turnActivityKinds = new Set(['agent', 'compaction']);
/** Everything a chat may legitimately bill: its turns, plus the API's own name and commit helpers. */
const chatActivityKinds = new Set([...turnActivityKinds, 'title', 'commit']);

/**
 * Every way a run's receipts fail to say which project and chat earned them.
 *
 * Two complementary rules, because a spec's matched set is wider than its own
 * turns — matching by provider sweeps in the API's name and commit generation,
 * which bills the same chat by design (`chat.controller.ts`):
 *
 * 1. Every host-turn receipt names this project and this chat. Null and wrong
 *    are one check: the message says which it was.
 * 2. Nothing else billed against this chat under a kind no chat surface uses,
 *    which is what a mislabelled turn looks like.
 *
 * @param receipts - The settled receipts the spec's assertion owns.
 * @param turn - The project and chat the spec drove.
 * @returns One line per fault, empty when the run is correctly attributed.
 */
export const attributionFaults = (receipts: readonly UsageReceipt[], turn: TurnIdentity): readonly string[] => {
  const faults: string[] = [];
  for (const receipt of receipts) {
    const where = `${receipt.operationId} (${receipt.model.id})`;
    if (turnActivityKinds.has(receipt.activity.kind)) {
      if (receipt.activity.projectHint !== turn.projectId) {
        faults.push(`${where} names project ${String(receipt.activity.projectHint)}, not ${turn.projectId}`);
      }
      if (receipt.activity.chatHint !== turn.chatId) {
        faults.push(`${where} names chat ${String(receipt.activity.chatHint)}, not ${turn.chatId}`);
      }
    } else if (receipt.activity.chatHint === turn.chatId && !chatActivityKinds.has(receipt.activity.kind)) {
      faults.push(`${where} bills this chat as "${receipt.activity.kind}"; a host turn is agent or compaction`);
    }
  }
  if (!receipts.some((receipt) => turnActivityKinds.has(receipt.activity.kind))) {
    faults.push('no agent or compaction receipt was produced, so nothing proves the host turns were attributed');
  }
  return faults;
};
