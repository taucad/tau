import { useCallback } from 'react';
import type { MouseEvent } from 'react';
import { Bot, BrainCircuit, CreditCard, FlaskConical, HardDrive, Key, Lock, Settings2, User } from 'lucide-react';
import { AccountSettings } from '#components/auth/settings/account/account-settings.js';
import { SecuritySettings } from '#components/auth/settings/security/security-settings.js';
import { ApiKeys } from '#components/auth/api-key/api-keys.js';
import type { LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '#components/ui/dialog.js';
import {
  useSettingsDialog,
  closeSettingsDialog,
  setSettingsSection,
  openSettingsDialog,
} from '#hooks/use-settings-dialog.js';
import type { SettingsSection } from '#hooks/use-settings-dialog.js';
import { FileSystemSettings } from '#components/settings/filesystem-settings.js';
import { GeneralSettings } from '#components/settings/general-settings.js';
import { ExperimentalSettings } from '#components/settings/experimental-settings.js';
import { ModelSettings } from '#components/settings/model-settings.js';
import { AgentSettings } from '#components/settings/agent-settings.js';
import { SettingsAuthGate } from '#components/settings/settings-auth-gate.js';
import { cn } from '#utils/ui.utils.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { ResponsiveTabs } from '#components/ui/responsive-tabs.js';
import type { ResponsiveTabItem } from '#components/ui/responsive-tabs.js';
import { TabsContent } from '#components/ui/tabs.js';

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

const settingsScrollClass = 'h-full overflow-y-auto p-6 pb-8';

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
      <DialogContent className={cn('gap-0 overflow-hidden', 'h-[min(90vh,900px)] grid-rows-[1fr]', 'sm:max-w-4xl')}>
        <DialogTitle className='sr-only'>Settings</DialogTitle>
        <DialogDescription className='sr-only'>Application settings and preferences</DialogDescription>

        <div className='size-full min-h-0 overflow-hidden' onClickCapture={handleClickCapture}>
          <ResponsiveTabs tabs={settingsTabs} activeTab={activeTab} enableContentAnimation={false}>
            <TabsContent enableAnimation={false} value='Account'>
              <SettingsAuthGate>
                <AccountSettings className={settingsScrollClass} />
              </SettingsAuthGate>
            </TabsContent>
            <TabsContent enableAnimation={false} value='Security'>
              <SettingsAuthGate>
                <SecuritySettings className={settingsScrollClass} />
              </SettingsAuthGate>
            </TabsContent>
            <TabsContent enableAnimation={false} value='API Keys'>
              <SettingsAuthGate>
                <ApiKeys className={settingsScrollClass} />
              </SettingsAuthGate>
            </TabsContent>
            <TabsContent enableAnimation={false} value='General'>
              <GeneralSettings />
            </TabsContent>
            <TabsContent enableAnimation={false} value='Filesystem'>
              <FileSystemSettings />
            </TabsContent>
            <TabsContent enableAnimation={false} value='Billing'>
              <SettingsAuthGate>
                <div className='py-4 text-sm text-muted-foreground'>Billing - coming soon.</div>
              </SettingsAuthGate>
            </TabsContent>
            <TabsContent enableAnimation={false} value='Models'>
              <ModelSettings />
            </TabsContent>
            <TabsContent enableAnimation={false} value='Agents'>
              <AgentSettings />
            </TabsContent>
            <TabsContent enableAnimation={false} value='Experimental'>
              <ExperimentalSettings />
            </TabsContent>
          </ResponsiveTabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
