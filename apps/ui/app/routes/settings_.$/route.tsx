import type { SettingsView } from '@daveyplate/better-auth-ui';
import { SettingsCards, useAuthenticate } from '@daveyplate/better-auth-ui';
import { Link, useLocation } from 'react-router';
import { TabsContent } from '#components/ui/tabs.js';
import type { Handle } from '#types/matches.types.js';
import { Button } from '#components/ui/button.js';
import { CreditCard, Key, Lock, Palette, User } from 'lucide-react';
import { cn } from '#utils/ui.js';
import { ResponsiveTabs, type ResponsiveTabItem } from '#components/ui/responsive-tabs.js';

type SettingsTab = ResponsiveTabItem & {
  tabView?: SettingsView;
};

const authTabs: readonly SettingsTab[] = [
  {
    tabView: 'SETTINGS',
    label: 'Account',
    href: '/settings/account',
    icon: User,
  },
  {
    tabView: 'SECURITY',
    label: 'Security',
    href: '/settings/security',
    icon: Lock,
  },
  {
    tabView: 'API_KEYS',
    label: 'API Keys',
    href: '/settings/api-keys',
    icon: Key,
  },
  // {
  //   tabView: 'ORGANIZATION',
  //   label: 'Organization',
  //   href: '/settings/organization',
  //   icon: Building,
  // },
  // {
  //   tabView: 'MEMBERS',
  //   label: 'Team',
  //   href: '/settings/team',
  //   icon: Users,
  // },
] as const;

const nonAuthTabs: readonly SettingsTab[] = [
  {
    label: 'Billing',
    href: '/settings/billing',
    icon: CreditCard,
  },
  {
    label: 'Appearance',
    href: '/settings/appearance',
    icon: Palette,
  }
] as const;

const allTabs: readonly SettingsTab[] = [...authTabs, ...nonAuthTabs];

const defaultTab = authTabs[0]!.label;
const defaultLabel = authTabs[0]!.label;

export const handle: Handle = {
  breadcrumb() {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- useLocation needed to get current route for breadcrumb
    const location = useLocation();
    const currentTab = allTabs.find((tab) => tab.href === location.pathname);
    const label = currentTab?.label ?? defaultLabel;

    return (
      <Button asChild variant="ghost">
        <Link to={location.pathname}>{label}</Link>
      </Button>
    );
  },
};

export default function SettingsPage(): React.JSX.Element {
  useAuthenticate();
  const location = useLocation();

  // Map pathname to cardView
  const getActiveTab = (): string => {
    const currentTab = allTabs.find((tab) => tab.href === location.pathname);
    return currentTab?.label ?? defaultTab;
  };

  const activeTab = getActiveTab();

  return (
    <div className="h-full flex-1">
      <div className={cn(
        "mx-auto size-full max-w-4xl p-4 md:p-6 mb-6",
        "[&_[data-slot=drawer-trigger]]:hidden"
      )}>
        <ResponsiveTabs tabs={allTabs} activeTab={activeTab}>
          {authTabs.map((tab) => (
            <TabsContent key={tab.label} value={tab.label} className="[&>*]:md:gap-0">
              <SettingsCards 
                classNames={{ cards: 'h-full', sidebar: { base: 'hidden' }, base: 'h-full' }} 
                view={tab.tabView!} 
              />
            </TabsContent>
          ))}
          <TabsContent value="Billing">
            <div>Billing - TODO</div>
          </TabsContent>
          <TabsContent value="Appearance">
            <div>Appearance - TODO</div>
          </TabsContent>
        </ResponsiveTabs>
      </div>
    </div>
  );
}
