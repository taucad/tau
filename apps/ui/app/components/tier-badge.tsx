import type { KernelId } from '@taucad/types/constants';
import type { BillingTier } from '@taucad/billing';
import { getKernelRequiredTier } from '@taucad/billing';
import { Badge } from '#components/ui/badge.js';
import { cn } from '#utils/ui.utils.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';

const proBadgeClassName =
  'h-4 border-blue/30 bg-blue/10 px-1 text-[10px] leading-none font-medium tracking-wide text-blue uppercase dark:text-blue/70';

type ProBadgeProps = {
  readonly className?: string;
};

/**
 * Compact inline Pro marker using the blue ramp from `--color-blue`.
 * Intended for non-kernel surfaces (e.g. nav "Upgrade to Pro").
 */
export function ProBadge({ className }: ProBadgeProps): React.JSX.Element {
  return <Badge className={cn(proBadgeClassName, className)}>Pro</Badge>;
}

type TierBadgeProps = {
  readonly tier: BillingTier;
  readonly className?: string;
};

const tierTooltipCopy: Record<Exclude<BillingTier, 'free'>, { title: string; description: string }> = {
  pro: {
    title: 'Pro plan required',
    description: 'This feature requires a Pro subscription for cloud-backed kernels and online access.',
  },
  enterprise: {
    title: 'Enterprise plan required',
    description: 'This feature requires an Enterprise subscription.',
  },
};

/**
 * Verbose tier marker with tooltip. Returns `null` for the free tier.
 */
export function TierBadge({ tier, className }: TierBadgeProps): React.JSX.Element | undefined {
  if (tier === 'free') {
    return undefined;
  }

  const copy = tierTooltipCopy[tier];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          className={cn(
            'h-6 cursor-help border-blue/30 bg-blue/10 text-xs font-normal text-blue uppercase dark:text-blue/70',
            className,
          )}
        >
          {tier === 'pro' ? 'Pro' : 'Enterprise'}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className='max-w-48 text-balance'>
        <p className='font-semibold'>{copy.title}</p>
        <p className='mt-1 text-white/80'>{copy.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

type KernelTierBadgeProps = {
  readonly kernelId: KernelId;
  readonly className?: string;
};

/**
 * Smart wrapper — the only badge component kernel surfaces should import.
 * Centralises kernel tier lookup and render decision.
 */
export function KernelTierBadge({ kernelId, className }: KernelTierBadgeProps): React.JSX.Element | undefined {
  const requiredTier = getKernelRequiredTier(kernelId);

  if (requiredTier === 'free') {
    return undefined;
  }

  return <ProBadge className={className} />;
}
