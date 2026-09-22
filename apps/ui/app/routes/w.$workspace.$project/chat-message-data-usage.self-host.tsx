import { useMemo } from 'react';
import type { UsageData } from '@taucad/chat';
import { Badge } from '@taucad/ui/components/badge';
import { formatNumberAbbreviation } from '#utils/number.utils.js';

export const usageOperationIds = (): string[] => [];
export type ReceiptCredit = { readonly status: 'unavailable' };
export type ReceiptTotal = { readonly creditAtoms: bigint; readonly pending: number };
export const useReceiptCredits = (): ReadonlyMap<string, ReceiptCredit> => new Map();
export const sumReceiptCredits = (): ReceiptTotal => ({ creditAtoms: 0n, pending: 0 });
export const formatReceiptTotal = (): string => '';

export function ChatMessageDataUsage({ usageParts }: { readonly usageParts: readonly UsageData[] }): React.JSX.Element {
  const total = useMemo(
    () =>
      usageParts.reduce(
        (sum, usage) => sum + usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
        0,
      ),
    [usageParts],
  );
  // Ghost, and as tall as the copy button beside it, like the billed badge.
  return (
    <Badge variant='outline' className='h-7 border-none font-normal text-inherit'>
      {formatNumberAbbreviation(total)} tokens
    </Badge>
  );
}
