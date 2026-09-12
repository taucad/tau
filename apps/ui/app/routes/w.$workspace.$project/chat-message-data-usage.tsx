import { useQueries } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import type { UsageData } from '@taucad/chat';
import { formatCreditAtoms, formatCreditAtomsDisplay, wireOperationReceiptSchema } from '@taucad/billing';
import type { WireOperationReceipt } from '@taucad/billing';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { InfoTooltip } from '#components/ui/info-tooltip.js';
import { Badge } from '@taucad/ui/components/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@taucad/ui/components/hover-card';
import {
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  TableFooter,
  Table,
} from '@taucad/ui/components/table';
import { useModels } from '#hooks/use-models.js';
import { formatNumberAbbreviation } from '#utils/number.utils.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';

/** What the account's own authority says one funded operation cost. @public */
export type ReceiptCredit =
  | { readonly status: 'pending'; readonly authorizedMaxCreditAtoms: bigint }
  | { readonly status: 'settled'; readonly chargedCreditAtoms: bigint }
  | { readonly status: 'unavailable' };

const creditOf = (receipt: WireOperationReceipt): ReceiptCredit => {
  switch (receipt.state) {
    case 'terminal': {
      return { status: 'settled', chargedCreditAtoms: BigInt(receipt.receipt.chargedCreditAtoms) };
    }
    case 'pending': {
      return { status: 'pending', authorizedMaxCreditAtoms: BigInt(receipt.authorizedMaxCreditAtoms) };
    }
    case 'unavailable': {
      return { status: 'unavailable' };
    }
  }
};

/** The funded operations one set of usage parts was charged through. @public */
export const usageOperationIds = (usageParts: readonly UsageData[]): string[] => {
  const ids = new Set<string>();
  for (const usage of usageParts) {
    if (usage.operationId !== undefined) {
      ids.add(usage.operationId);
    }
  }
  return [...ids].sort();
};

/**
 * Reads the authoritative receipt for every named operation.
 *
 * This is the single receipt reader for every chat surface — the per-message
 * badge, the chat footer, the project total and the agents pane all call it, so
 * one owner holds the owner/environment check and the immutability rule. A
 * settled receipt never changes, so it is fetched once and cached; only a
 * pending operation is polled. A read that fails, or that answers for another
 * account or environment, yields no entry at all: the caller then shows
 * "Pending", never a zero and never a locally multiplied figure (B4 R2).
 *
 * ponytail: one GET per distinct operation, deduped by React Query. A batch
 * receipt endpoint is the upgrade path if a project's operation count ever
 * makes the fan-out visible.
 *
 * @param operationIds - Operations to resolve; duplicates are collapsed.
 * @returns Resolved credits by operation id.
 * @public
 */
export const useReceiptCredits = (operationIds: readonly string[]): ReadonlyMap<string, ReceiptCredit> => {
  const { apiBaseUrl, userId, environment } = useBillingSession();
  const ids = [...new Set(operationIds)].sort();
  const results = useQueries({
    queries: ids.map((operationId) => ({
      queryKey: ['billing', 'operation', apiBaseUrl, userId, environment, operationId],
      enabled: userId !== undefined && apiBaseUrl !== undefined && environment !== undefined,
      // Terminal receipts are immutable; only an unresolved operation is polled.
      staleTime: Number.POSITIVE_INFINITY,
      refetchInterval: ({ state }: { state: { data?: WireOperationReceipt } }) =>
        state.data === undefined || state.data.state === 'pending' ? 5000 : false,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<WireOperationReceipt> => {
        const response = await fetch(`${apiBaseUrl}/v1/billing/operations/${encodeURIComponent(operationId)}`, {
          credentials: 'include',
          signal,
        });
        if (!response.ok) {
          throw new Error(`Operation receipt request failed with ${response.status}`);
        }
        const receipt = wireOperationReceiptSchema.parse(await response.json());
        if (receipt.ownerId !== userId || receipt.environment !== environment) {
          throw new Error('Receipt belongs to a different billing session');
        }
        if (receipt.operationId !== operationId) {
          throw new Error('Receipt answers for a different operation');
        }
        return receipt;
      },
    })),
  });
  const credits = new Map<string, ReceiptCredit>();
  for (const [index, operationId] of ids.entries()) {
    const receipt = results[index]?.data;
    if (receipt) {
      credits.set(operationId, creditOf(receipt));
    }
  }
  return credits;
};

/** Settled credits plus the operations still without one. @public */
export type ReceiptTotal = { readonly creditAtoms: bigint; readonly pending: number };

/**
 * Sums only the receipts that actually resolved.
 *
 * ponytail: an `unavailable` receipt counts as pending. Separating the two in
 * an aggregate label is the upgrade path if authority reads start failing
 * often; the per-message detail already names the difference.
 *
 * @param operationIds - Operations the surface is totalling.
 * @param credits - Resolved receipts from {@link useReceiptCredits}.
 * @returns The settled total and the count still unresolved.
 * @public
 */
export const sumReceiptCredits = (
  operationIds: readonly string[],
  credits: ReadonlyMap<string, ReceiptCredit>,
): ReceiptTotal => {
  let creditAtoms = 0n;
  let pending = 0;
  for (const operationId of new Set(operationIds)) {
    const credit = credits.get(operationId);
    if (credit?.status === 'settled') {
      creditAtoms += credit.chargedCreditAtoms;
      continue;
    }
    pending += 1;
  }
  return { creditAtoms, pending };
};

/** Short credit summary used by every chat surface's badge or footer. @public */
export const formatReceiptTotal = ({ creditAtoms, pending }: ReceiptTotal): string => {
  if (pending === 0) {
    return formatCreditAtomsDisplay(creditAtoms);
  }
  if (creditAtoms === 0n) {
    return 'Pending';
  }
  return `${formatCreditAtomsDisplay(creditAtoms)} · ${String(pending)} pending`;
};

const tokenCell = (tokens: number | undefined): string =>
  tokens === undefined ? 'Not reported' : formatNumberAbbreviation(tokens);

const creditCell = (credit: ReceiptCredit | undefined): string => {
  switch (credit?.status) {
    case 'settled': {
      return formatCreditAtoms(credit.chargedCreditAtoms);
    }
    case 'unavailable': {
      return 'Unavailable';
    }
    default: {
      return 'Pending';
    }
  }
};

const turnTokens = (usage: UsageData): number =>
  usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;

/**
 * Per-turn usage beside a chat message: Tau credits from the operation's own
 * receipt, with the provider's token counts as the explanation.
 *
 * @param props - The turn's usage parts, in order.
 * @returns The usage badge and its detail card, or nothing when there is no usage.
 */
export function ChatMessageDataUsage({
  usageParts,
}: {
  readonly usageParts: UsageData[];
}): React.JSX.Element | undefined {
  const { resolveModel } = useModels();
  const [showCredits] = useCookie(cookieName.chatModelCost, true);
  const operationIds = usageOperationIds(usageParts);
  const credits = useReceiptCredits(operationIds);

  if (usageParts.length === 0) {
    return undefined;
  }

  const total = sumReceiptCredits(operationIds, credits);
  const hasMultipleTurns = usageParts.length > 1;
  const lastUsage = usageParts.at(-1);
  const modelId = lastUsage?.model;
  const model = modelId === undefined ? undefined : resolveModel(modelId);
  const { agent } = lastUsage ?? {};
  const tauBilled = operationIds.length > 0;
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: undefined as number | undefined,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  for (const usage of usageParts) {
    totals.inputTokens += usage.inputTokens;
    totals.outputTokens += usage.outputTokens;
    totals.cacheReadTokens += usage.cacheReadTokens;
    totals.cacheWriteTokens += usage.cacheWriteTokens;
    if (usage.reasoningTokens !== undefined) {
      totals.reasoningTokens = (totals.reasoningTokens ?? 0) + usage.reasoningTokens;
    }
  }
  const totalTokens = totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
  const summary = tauBilled ? formatReceiptTotal(total) : 'Not billed';

  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild className='flex flex-row items-center' tabIndex={0}>
        <Badge
          variant='outline'
          aria-label={tauBilled ? `Tau credits: ${summary}` : 'Not billed by Tau'}
          className='h-7 cursor-help gap-1 border-none font-medium text-inherit outline-none hover:bg-neutral/20'
        >
          <Coins aria-hidden='true' className='size-3.5! stroke-2' />
          {showCredits ? <span>{summary}</span> : undefined}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className='w-auto overflow-hidden p-2 pt-1'>
        <div className='flex flex-col space-y-1'>
          <div className='flex flex-row items-baseline justify-between gap-4 p-2 pb-0'>
            <h4 className='font-medium'>Usage Details</h4>
            {model ? (
              <div className='flex items-baseline gap-2 text-xs'>
                <SvgIcon id={model.family} className='size-4 translate-y-[0.25em] text-muted-foreground' />
                <span className='font-mono'>{model.name}</span>
              </div>
            ) : undefined}
          </div>
          <Table className='h-full overflow-clip rounded-md [&_tbody]:block [&_tbody]:max-h-[300px] [&_tbody]:scroll-shadows-y [&_tfoot]:block [&_thead]:block [&_tr]:grid [&_tr]:grid-cols-[1fr_auto_auto]'>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className='text-right'>Tokens</TableHead>
                <TableHead className='text-right'>Credits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hasMultipleTurns
                ? usageParts.map((usage, index) => (
                    <TableRow key={usage.id}>
                      <TableCell className='flex flex-row items-center gap-1'>
                        <span>Turn {index + 1}</span>
                        <InfoTooltip>
                          <div className='space-y-1 text-xs'>
                            <div>Input: {formatNumberAbbreviation(usage.inputTokens)} tokens</div>
                            <div>Output: {formatNumberAbbreviation(usage.outputTokens)} tokens</div>
                            <div>Reasoning: {tokenCell(usage.reasoningTokens)}</div>
                            {usage.cacheReadTokens > 0 && (
                              <div>Cache Read: {formatNumberAbbreviation(usage.cacheReadTokens)} tokens</div>
                            )}
                            {usage.cacheWriteTokens > 0 && (
                              <div>Cache Write: {formatNumberAbbreviation(usage.cacheWriteTokens)} tokens</div>
                            )}
                          </div>
                        </InfoTooltip>
                      </TableCell>
                      <TableCell className='text-right font-mono'>
                        {formatNumberAbbreviation(turnTokens(usage))}
                      </TableCell>
                      <TableCell className='text-right font-mono'>
                        {usage.operationId === undefined ? '—' : creditCell(credits.get(usage.operationId))}
                      </TableCell>
                    </TableRow>
                  ))
                : (
                    [
                      {
                        label: 'Input',
                        tokens: totals.inputTokens as number | undefined,
                        hint: 'The number of tokens in the input prompt. This includes the user prompt, system message, and any previous messages.',
                      },
                      {
                        label: 'Output',
                        tokens: totals.outputTokens as number | undefined,
                        hint: 'The number of tokens in the output response.',
                      },
                      {
                        label: 'Reasoning',
                        tokens: totals.reasoningTokens,
                        hint: 'Thinking tokens, already counted inside output. Reads "Not reported" when the provider did not report them.',
                      },
                      {
                        label: 'Cache Read',
                        tokens: totals.cacheReadTokens as number | undefined,
                        hint: 'The number of tokens read from the prompt cache. This improves performance by avoiding re-processing the same prompt.',
                      },
                      {
                        label: 'Cache Write',
                        tokens: totals.cacheWriteTokens as number | undefined,
                        hint: 'The number of tokens written to the prompt cache. This improves performance by avoiding re-processing the same prompt.',
                      },
                    ] as const
                  ).map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className='flex flex-row items-center gap-1'>
                        <span>{row.label}</span>
                        <InfoTooltip>{row.hint}</InfoTooltip>
                      </TableCell>
                      <TableCell className='text-right font-mono'>{tokenCell(row.tokens)}</TableCell>
                      <TableCell className='text-right font-mono'>—</TableCell>
                    </TableRow>
                  ))}
            </TableBody>
            <TableFooter className='overflow-clip rounded-b-md'>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className='text-right font-mono'>{formatNumberAbbreviation(totalTokens)}</TableCell>
                <TableCell className='text-right font-mono'>
                  {tauBilled ? formatCreditAtoms(total.creditAtoms) : 'Not billed'}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <p className='px-2 pb-1 text-[11px] text-muted-foreground'>
            {tauBilled
              ? total.pending > 0
                ? `${String(total.pending)} charge${total.pending === 1 ? '' : 's'} pending. Credits come from your Tau receipts.`
                : 'Credits come from your Tau receipts.'
              : agent === undefined
                ? 'This turn was not funded by Tau, so it has no Tau credits.'
                : `Reported by ${agent}. Tau did not fund this turn, so it has no Tau credits.`}
          </p>
          {lastUsage?.attemptId === undefined ? undefined : (
            <p className='px-2 pb-1 font-mono text-[11px] text-muted-foreground'>Ref {lastUsage.attemptId}</p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
