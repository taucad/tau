import { ChartColumn, CreditCard, Sparkles } from 'lucide-react';
import { DropdownMenuItem } from '@taucad/ui/components/dropdown-menu';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { openSettingsDialog } from '#hooks/use-settings-dialog.js';
import { ProBadge } from '#components/tier-badge.js';
import type { NavRoute } from '#constants/route.constants.js';

export const billingNavRoutes: NavRoute[] = [
  {
    title: 'Usage',
    url: '/usage',
    icon: ChartColumn,
  },
];

export function NavBillingItem(): React.JSX.Element {
  const { tier } = useEntitlements();
  return tier === 'free' ? (
    <DropdownMenuItem
      onSelect={() => {
        openSettingsDialog('billing');
      }}
    >
      <Sparkles />
      Upgrade to Pro
      <ProBadge className='ml-auto' />
    </DropdownMenuItem>
  ) : (
    <DropdownMenuItem
      onSelect={() => {
        openSettingsDialog('billing');
      }}
    >
      <CreditCard />
      Billing
    </DropdownMenuItem>
  );
}
