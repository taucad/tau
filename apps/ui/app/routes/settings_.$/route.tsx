import type { SettingsView } from '@daveyplate/better-auth-ui';
import { SettingsCards, useAuthenticate } from '@daveyplate/better-auth-ui';
import { Link, useLocation } from 'react-router';
import { Tabs, TabsList, TabsTrigger, TabsContent, TabsContents } from '#components/ui/tabs.js';
import type { Handle } from '#types/matches.types.js';

type SettingsTab = {
  tabView: SettingsView;
  label: string;
  href: string;
};

const authTabs: SettingsTab[] = [
  {
    tabView: 'SETTINGS',
    label: 'Account',
    href: '/settings/account',
  },
  {
    tabView: 'SECURITY',
    label: 'Security',
    href: '/settings/security',
  },
  {
    tabView: 'API_KEYS',
    label: 'API Keys',
    href: '/settings/api-keys',
  },
  // {
  //   tabView: 'ORGANIZATION',
  //   label: 'Organization',
  //   href: '/settings/organization',
  // },
  // {
  //   tabView: 'MEMBERS',
  //   label: 'Team',
  //   href: '/settings/team',
  // },
] as const;

const nonAuthTabs: Array<Omit<SettingsTab, 'tabView'>> = [
  {
    label: 'Billing',
    href: '/settings/billing',
  },
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

    return <span className="p-2 text-sm font-medium">{label}</span>;
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
      <div className="mx-auto w-full max-w-4xl p-6">
        <Tabs value={activeTab} className="flex h-full flex-col">
          <TabsList className="mb-6">
            {authTabs.map((tab) => (
              <TabsTrigger key={tab.label} asChild value={tab.label}>
                <Link to={tab.href}>{tab.label}</Link>
              </TabsTrigger>
            ))}
            {nonAuthTabs.map((tab) => (
              <TabsTrigger key={tab.label} asChild value={tab.label}>
                <Link to={tab.href}>{tab.label}</Link>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContents className="flex-1 overflow-y-auto pb-10">
            {authTabs.map((tab) => (
              <TabsContent key={tab.label} value={tab.label} className="[&>*]:md:gap-0">
                <SettingsCards classNames={{ sidebar: { base: 'hidden' } }} view={tab.tabView} />
              </TabsContent>
            ))}
            <TabsContent value="Billing">
              <div>Billing - TODO</div>
            </TabsContent>
          </TabsContents>
        </Tabs>
      </div>
    </div>
  );
}
