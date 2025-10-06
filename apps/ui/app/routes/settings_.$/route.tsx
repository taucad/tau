import type { SettingsView } from '@daveyplate/better-auth-ui';
import { SettingsCards, useAuthenticate } from '@daveyplate/better-auth-ui';
import { Link, useLocation } from 'react-router';
import { Tabs, TabsList, TabsTrigger, TabsContent, TabsContents } from '#components/ui/tabs.js';
import type { Handle } from '#types/matches.types.js';
import { Button } from '#components/ui/button.js';
import { CreditCard, Key, Lock, Palette, User, type LucideIcon } from 'lucide-react';
import { cn } from '#utils/ui.js';

type SettingsTab = {
  tabView: SettingsView;
  label: string;
  href: string;
  icon: LucideIcon;
};

const authTabs: SettingsTab[] = [
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

const nonAuthTabs: Array<Omit<SettingsTab, 'tabView'>> = [
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
];

const allTabs = [...authTabs, ...nonAuthTabs];

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
  const getActiveTab = () => {
    const currentTab = allTabs.find((tab) => tab.href === location.pathname);
    return currentTab?.label ?? defaultTab;
  };

  const activeTab = getActiveTab();

  return (
    <div className="h-full flex-1">
      <div className={cn(
        "mx-auto w-full max-w-4xl p-4 md:p-6",
        "[&_[data-slot=drawer-trigger]]:hidden"
      )}>
        <Tabs orientation='vertical' value={activeTab} className={cn(
          "flex h-full flex-row gap-6",
          "[&_[data-slot=tabs-trigger]]:flex-row",
          "[&_[data-slot=tabs-trigger]]:gap-2",
          "[&_[data-slot=tabs-trigger]]:justify-start",
          "[&_[data-slot=tabs-trigger]]:[&_svg]:text-muted-foreground"
        )}>
          <TabsList className="mb-6">
            {allTabs.map((tab) => (
              <TabsTrigger key={tab.label} asChild value={tab.label}>
                <Link to={tab.href}>
                  <tab.icon />
                  {tab.label}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContents className="flex-1 overflow-y-auto">
            {authTabs.map((tab) => (
              <TabsContent key={tab.label} value={tab.label} className="[&>*]:md:gap-0">
                <SettingsCards classNames={{ sidebar: { base: 'hidden' } }} view={tab.tabView} />
              </TabsContent>
            ))}
            <TabsContent value="Billing">
              <div>Billing - TODO</div>
            </TabsContent>
            <TabsContent value="Appearance">
              <div>Appearance - TODO</div>
            </TabsContent>
          </TabsContents>
        </Tabs>
      </div>
    </div>
  );
}
