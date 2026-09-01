import { useCallback } from 'react';
import type { MouseEvent } from 'react';
import {
  Bot,
  BrainCircuit,
  Cable,
  Cpu,
  CreditCard,
  FlaskConical,
  HardDrive,
  Key,
  Lock,
  Settings2,
  User,
} from 'lucide-react';
import { AccountSettings } from '#components/auth/settings/account/account-settings.js';
import { SecuritySettings } from '#components/auth/settings/security/security-settings.js';
import { ApiKeys } from '#components/auth/api-key/api-keys.js';
import type { LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@taucad/ui/components/dialog';
import {
  useSettingsDialog,
  closeSettingsDialog,
  setSettingsSection,
  openSettingsDialog,
} from '#hooks/use-settings-dialog.js';
import type { SettingsSection } from '#hooks/use-settings-dialog.js';
import { BillingSettings } from '#components/settings/billing-settings.js';
import { FileSystemSettings } from '#components/settings/filesystem-settings.js';
import { GeneralSettings } from '#components/settings/general-settings.js';
import { ExperimentalSettings } from '#components/settings/experimental-settings.js';
import { ModelSettings } from '#components/settings/model-settings.js';
import { AgentSettings } from '#components/settings/agent-settings.js';
import { PaseoConnectionSettings } from '#components/settings/paseo-connection-settings.js';
import { SettingsAuthGate } from '#components/settings/settings-auth-gate.js';
import { RemoteComputeSettings } from '#components/settings/remote-compute-settings.js';
import { cn } from '@taucad/ui/utils/cn';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { ResponsiveTabs } from '#components/ui/responsive-tabs.js';
import type { ResponsiveTabItem } from '#components/ui/responsive-tabs.js';
import { TabsContent } from '@taucad/ui/components/tabs';

type SettingsGroup = 'platform' | 'ai' | 'advanced';

type SettingsSectionDefinition = {
  readonly id: SettingsSection;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly requiresAuth: boolean;
  readonly group: SettingsGroup;
};

const sections: readonly SettingsSectionDefinition[] = [
  { id: 'general', label: 'General', icon: Settings2, requiresAuth: false, group: 'platform' },
  { id: 'account', label: 'Account', icon: User, requiresAuth: true, group: 'platform' },
  { id: 'security', label: 'Security', icon: Lock, requiresAuth: true, group: 'platform' },
  { id: 'api-keys', label: 'API Keys', icon: Key, requiresAuth: true, group: 'platform' },
  { id: 'billing', label: 'Billing', icon: CreditCard, requiresAuth: true, group: 'platform' },
  { id: 'connections', label: 'Connections', icon: Cable, requiresAuth: true, group: 'platform' },
  { id: 'compute', label: 'Compute', icon: Cpu, requiresAuth: true, group: 'platform' },
  { id: 'models', label: 'Models', icon: Bot, requiresAuth: false, group: 'ai' },
  { id: 'agents', label: 'Agents', icon: BrainCircuit, requiresAuth: false, group: 'ai' },
  { id: 'filesystem', label: 'Filesystem', icon: HardDrive, requiresAuth: false, group: 'advanced' },
  { id: 'experimental', label: 'Experimental', icon: FlaskConical, requiresAuth: false, group: 'advanced' },
] as const;

const sectionPathMap: Record<SettingsSection, string> = {
  general: '/settings/general',
  filesystem: '/settings/filesystem',
  account: '/settings/account',
  security: '/settings/security',
  'api-keys': '/settings/api-keys',
  billing: '/settings/billing',
  connections: '/settings/connections',
  compute: '/settings/compute',
  models: '/settings/models',
  agents: '/settings/agents',
  experimental: '/settings/experimental',
};

/**
 * Tabs formatted for ResponsiveTabs. The href values match the original
 * settings routes so that ResponsiveTabs renders correctly. Navigation
 * is intercepted via onClickCapture to prevent actual route changes.
 */
const settingsTabs: readonly ResponsiveTabItem[] = sections.map((section) => ({
  label: section.label,
  href: sectionPathMap[section.id],
  icon: section.icon,
  group: section.group,
}));

/** Reverse lookup: path -> section id */
const pathToSection = Object.fromEntries(
  Object.entries(sectionPathMap).map(([id, path]) => [path, id as SettingsSection]),
) as Record<string, SettingsSection>;

/** Map section id to label */
const sectionToLabel = Object.fromEntries(sections.map((s) => [s.id, s.label])) as Record<SettingsSection, string>;

/**
 * Global settings dialog with responsive layout using ResponsiveTabs.
 *
 * State is driven by the `?settings=<section>` URL search parameter
 * (see `useSettingsDialog`). Closing the dialog removes the param;
 * switching tabs updates it.
 *
 * - Desktop (md+): vertical tabs on the left, content on the right
 * - Mobile: horizontal scrollable tabs on top, content below
 *
 * Link clicks inside ResponsiveTabs are intercepted during the capture
 * phase to prevent React Router navigation -- the section is updated
 * in-place via the `?settings` search param.
 */
export function SettingsDialog(): React.JSX.Element {
  const { isOpen, section: activeSection } = useSettingsDialog();

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      closeSettingsDialog();
    }
  }, []);

  // Register Cmd+, keyboard shortcut
  useKeybinding({ key: ',', modKey: true }, () => {
    openSettingsDialog();
  });

  /**
   * Intercept tab Link clicks during the CAPTURE phase (before React Router handles them)
   * to prevent navigation and instead update the settings section store.
   */
  const handleClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('href');
    if (href && href in pathToSection) {
      event.preventDefault();
      event.stopPropagation();
      setSettingsSection(pathToSection[href]!);
    }
  }, []);

  const activeTab = sectionToLabel[activeSection];

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className={cn('gap-0 overflow-hidden p-0', 'h-[min(90vh,900px)] grid-rows-[1fr]', 'sm:max-w-4xl')}>
        <DialogTitle className='sr-only'>Settings</DialogTitle>
        <DialogDescription className='sr-only'>Application settings and preferences</DialogDescription>

        <div className='size-full min-h-0 overflow-clip' onClickCapture={handleClickCapture}>
          <ResponsiveTabs
            tabs={settingsTabs}
            activeTab={activeTab}
            enableContentAnimation={false}
            tabsListClassName={cn(
              // TabsList has its own `bg-sidebar` background, so we use *margins*
              // (not padding) to offset the whole sidebar pane from the dialog
              // edges — padding would only push the items inside the pane.
              // Mobile: horizontal scroll strip nudged in from the dialog edges.
              'max-md:mx-6 max-md:mt-6',
              // Desktop: vertical sidebar offset from the dialog left edge.
              'md:ml-6 md:mb-6',
            )}
            contentClassName={cn(
              // Top padding takes over from the removed DialogContent p-6.
              'pt-6 pb-8',
              // Mobile: keep horizontal padding so content clears the dialog edges.
              'max-md:px-6',
              // Desktop: the scroll container extends flush to the dialog's right border
              // so the scrollbar tucks against it; `pr-6` keeps content visually clear
              // of the scrollbar. Left padding is supplied via the `md:gap-6` between
              // TabsList and this column.
              'md:pr-6',
            )}
          >
            <TabsContent forceMount enableAnimation={false} value='Account'>
              <SettingsAuthGate>
                <AccountSettings />
              </SettingsAuthGate>
            </TabsContent>
            <TabsContent forceMount enableAnimation={false} value='Security'>
              <SettingsAuthGate>
                <SecuritySettings />
              </SettingsAuthGate>
            </TabsContent>
            <TabsContent forceMount enableAnimation={false} value='API Keys'>
              <SettingsAuthGate>
                <ApiKeys />
              </SettingsAuthGate>
            </TabsContent>
            <TabsContent forceMount enableAnimation={false} value='General'>
              <GeneralSettings />
            </TabsContent>
            <TabsContent forceMount enableAnimation={false} value='Filesystem'>
              <FileSystemSettings />
            </TabsContent>
            <TabsContent forceMount enableAnimation={false} value='Billing'>
              <SettingsAuthGate>
                <BillingSettings />
              </SettingsAuthGate>
            </TabsContent>
            <TabsContent forceMount enableAnimation={false} value='Connections'>
              <SettingsAuthGate>
                <PaseoConnectionSettings />
              </SettingsAuthGate>
            </TabsContent>
            <TabsContent forceMount enableAnimation={false} value='Compute'>
              <SettingsAuthGate>
                <RemoteComputeSettings />
              </SettingsAuthGate>
            </TabsContent>
            <TabsContent forceMount enableAnimation={false} value='Models'>
              <ModelSettings />
            </TabsContent>
            <TabsContent forceMount enableAnimation={false} value='Agents'>
              <AgentSettings />
            </TabsContent>
            <TabsContent forceMount enableAnimation={false} value='Experimental'>
              <ExperimentalSettings />
            </TabsContent>
          </ResponsiveTabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
