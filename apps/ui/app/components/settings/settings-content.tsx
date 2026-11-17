import { GithubRepositorySettings } from '#components/settings/github-repository-settings.js';
import { BrowserSettingsPanel } from '#components/browser/browser-settings.js';
import { AccountSettings } from '#components/auth/settings/account/account-settings.js';
import { SecuritySettings } from '#components/auth/settings/security/security-settings.js';
import { CloudBillingSettings } from '#cloud/settings-billing.js';
import { FileSystemSettings } from '#components/settings/filesystem-settings.js';
import { GeneralSettings } from '#components/settings/general-settings.js';
import { DataControlsSettings } from '#components/settings/data-controls-settings.js';
import { ExperimentalSettings } from '#components/settings/experimental-settings.js';
import { ModelSettings } from '#components/settings/model-settings.js';
import { AgentSettings } from '#components/settings/agent-settings.js';
import { SettingsAuthGate } from '#components/settings/settings-auth-gate.js';
import { RemoteComputeSettings } from '#components/settings/remote-compute-settings.js';
import { ComputeReuseSettings } from '#components/settings/compute-reuse-settings.js';
import { MachinesSettings } from '#components/settings/machines-settings.js';
import { ViewerSettings } from '#components/settings/viewer/viewer-settings.js';
import type { SettingsSection } from '@taucad/settings-ui/components/settings/settings-section';
import { SettingsItem } from '@taucad/settings-ui/components/settings/settings-item';
import { DeploymentSettingsProvider } from '#components/settings/deployment-settings-provider.js';

/**
 * Keep authenticated sections behind their existing gate and mount only the active section. Its settings render
 * only when this deployment offers them, so the section receives the gated catalogue.
 */
export function SettingsContent({ section }: { readonly section: SettingsSection }): React.JSX.Element {
  return (
    <DeploymentSettingsProvider>
      <SectionContent section={section} />
    </DeploymentSettingsProvider>
  );
}

function SectionContent({ section }: { readonly section: SettingsSection }): React.JSX.Element {
  switch (section) {
    case 'browser': {
      return (
        <SettingsItem settingId='web-browser'>
          <BrowserSettingsPanel />
        </SettingsItem>
      );
    }
    case 'general': {
      return <GeneralSettings />;
    }
    case 'account': {
      return (
        <SettingsAuthGate>
          <SettingsItem settingId='profile'>
            <AccountSettings />
          </SettingsItem>
        </SettingsAuthGate>
      );
    }
    case 'security': {
      return (
        <SettingsAuthGate>
          <SecuritySettings />
        </SettingsAuthGate>
      );
    }
    case 'repositories': {
      return (
        <SettingsAuthGate>
          <GithubRepositorySettings />
        </SettingsAuthGate>
      );
    }
    case 'billing': {
      return (
        <SettingsAuthGate>
          <CloudBillingSettings />
        </SettingsAuthGate>
      );
    }
    case 'data-controls': {
      return <DataControlsSettings />;
    }
    case 'viewer': {
      return <ViewerSettings />;
    }
    case 'compute': {
      return (
        <>
          <SettingsItem settingId='compute-reuse'>
            <ComputeReuseSettings />
          </SettingsItem>
          <SettingsAuthGate>
            <SettingsItem settingId='tau-host'>
              <RemoteComputeSettings />
            </SettingsItem>
          </SettingsAuthGate>
        </>
      );
    }
    case 'machines': {
      return (
        <SettingsItem settingId='machines'>
          <MachinesSettings />
        </SettingsItem>
      );
    }
    case 'models': {
      return (
        <SettingsItem settingId='model-picker'>
          <ModelSettings />
        </SettingsItem>
      );
    }
    case 'agents': {
      return <AgentSettings />;
    }
    case 'filesystem': {
      return <FileSystemSettings />;
    }
    case 'experimental': {
      return <ExperimentalSettings />;
    }
  }
}
