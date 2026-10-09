import {
  Bot,
  BrainCircuit,
  Cpu,
  CreditCard,
  FlaskConical,
  HardDrive,
  Lock,
  Printer,
  Settings2,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SettingsSection } from '#hooks/use-settings-dialog.js';
import { featureFlagNames, flagRegistry } from '#flags/flag.constants.js';
import { tauCloudEnabled } from '#cloud/cloud-enabled.js';
import { isDesktopTarget } from '#lib/build-target.js';

export type SettingDefinition = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly keywords?: readonly string[];
};

export type SettingsSectionDefinition = {
  readonly id: SettingsSection;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly group: string;
  readonly entries: readonly SettingDefinition[];
};

/** Navigation and search share this catalogue; entries point to explicit settings landmarks. */
const settingsCatalog = [
  {
    id: 'general',
    label: 'General',
    icon: Settings2,
    group: 'Personal',
    entries: [
      {
        id: 'theme',
        label: 'Theme',
        description: 'Select your preferred color scheme',
        keywords: ['appearance', 'dark mode', 'light mode', 'black', 'system', 'contrast', 'colour'],
      },
      {
        id: 'code-inlay-hints',
        label: 'Code Inlay Hints',
        description: 'Show inline parameter names in code editors',
        keywords: ['appearance'],
      },
      {
        id: 'pointer-cursors',
        label: 'Use pointer cursors',
        description: 'Change the cursor to a pointer when hovering over interactive elements',
        keywords: ['appearance', 'cursor', 'hand', 'mouse', 'interactive'],
      },
      {
        id: 'accent-color',
        label: 'Accent Color',
        description: 'Customize the primary accent color',
        keywords: ['appearance', 'colour', 'hue'],
      },
      {
        id: 'privacy',
        label: 'Privacy',
        description: 'Choose how your data and usage metrics are used to improve Tau',
        keywords: ['training', 'sharing', 'no train', 'telemetry', 'usage', 'metrics', 'anonymous'],
      },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    icon: User,
    group: 'Personal',
    entries: [
      {
        id: 'profile',
        label: 'User profile',
        description: 'Change your name and avatar',
        keywords: ['picture', 'photo'],
      },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    icon: Lock,
    group: 'Personal',
    entries: [
      {
        id: 'password',
        label: 'Password',
        description: 'Manage your sign-in password when password authentication is enabled',
      },
      {
        id: 'linked-accounts',
        label: 'Linked accounts',
        description: 'Manage connected sign-in providers',
        keywords: ['github', 'google', 'login'],
      },
      {
        id: 'active-sessions',
        label: 'Active sessions',
        description: 'Review devices and revoke sessions',
        keywords: ['logout', 'sign out'],
      },
    ],
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: CreditCard,
    group: 'Personal',
    entries: [
      {
        id: 'plan',
        label: 'Plan',
        description: 'Manage your subscription and usage limits',
        keywords: ['upgrade', 'cancel', 'payment'],
      },
      {
        id: 'credit-balance',
        label: 'Credit balance',
        description: 'View your balance and add credits',
        keywords: ['top up', 'purchase'],
      },
      {
        id: 'automatic-reload',
        label: 'Automatic reload',
        description: 'Automatically buy credits when your balance is low',
        keywords: ['threshold', 'payment', 'budget'],
      },
      {
        id: 'close-account',
        label: 'Close Tau account',
        description: 'Close your account and delete your data',
        keywords: ['delete', 'remove'],
      },
    ],
  },
  {
    id: 'compute',
    label: 'Compute',
    icon: Cpu,
    group: 'Workspace',
    entries: [
      {
        id: 'compute-reuse',
        label: 'Compute reuse',
        description: 'Choose how local CAD work reuses expensive results',
        keywords: ['cache', 'durable', 'memory', 'off', 'inspect', 'clear', 'collect'],
      },
      {
        id: 'tau-host',
        label: 'Tau Host',
        description: 'Pair and manage remote compute devices',
        keywords: ['local', 'remote', 'rendering', 'revoke'],
      },
    ],
  },
  {
    id: 'machines',
    label: 'Machines',
    icon: Printer,
    group: 'Workspace',
    entries: [
      {
        id: 'machines',
        label: 'Machines',
        description: 'Add a simulated X1C or bind a Bambu Lab X1C on your network',
        keywords: [
          'printer',
          'bambu',
          'x1c',
          'simulator',
          '3d print',
          'bind',
          'access code',
          'keychain',
          'remove',
          'forget',
          /* What each machine's details show. */
          'firmware',
          'nozzle',
          'build volume',
          'enclosure',
          'kinematics',
          'toolhead',
          'bed',
          'plate',
          'chamber',
          'fan',
          'material system',
          'ams',
          'filament',
          'camera',
          'lan mode',
          'speed profile',
          'slicing',
          'demo speed',
          'bed leveling',
          'flow calibration',
          'timelapse',
        ],
      },
    ],
  },
  {
    id: 'models',
    label: 'Models',
    icon: Bot,
    group: 'Workspace',
    entries: [
      {
        id: 'model-picker',
        label: 'Available models',
        description: 'Choose which AI models appear in the chat model picker',
        keywords: ['provider', 'recommended', 'enable', 'disable'],
      },
    ],
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: BrainCircuit,
    group: 'Workspace',
    entries: [
      {
        id: 'show-credits',
        label: 'Show Credits',
        description: 'Display the Tau credits charged for each message in the chat history',
        keywords: ['metadata', 'cost'],
      },
      {
        id: 'filesystem-context',
        label: 'Filesystem',
        description: 'Include a snapshot of the project file tree',
        keywords: ['editor', 'context'],
      },
      {
        id: 'active-file',
        label: 'Active File',
        description: 'Include the currently focused file',
        keywords: ['editor', 'context'],
      },
      { id: 'open-tabs', label: 'Open Tabs', description: 'Include all open editor tabs', keywords: ['context'] },
      { id: 'testing-tools', label: 'Enable Testing Tools', description: 'Allow the agent to run and edit tests' },
    ],
  },
  {
    id: 'filesystem',
    label: 'Filesystem',
    icon: HardDrive,
    group: 'Workspace',
    entries: [
      {
        id: 'workspaces',
        label: 'Workspaces',
        description: 'Connect folders on your disk and manage access',
        keywords: ['directory', 'local', 'disconnect', 'permission'],
      },
      {
        id: 'browser-storage',
        label: 'Browser Storage',
        description: 'View Home storage usage and available space',
        keywords: ['quota', 'disk'],
      },
      {
        id: 'tau-cloud-projects',
        label: 'Tau Cloud Projects',
        description: 'Bring your Tau Cloud projects to this device when you sign in',
        keywords: ['sync', 'backup', 'download', 'materialize', 'sign in'],
      },
    ],
  },
  {
    id: 'experimental',
    label: 'Experimental',
    icon: FlaskConical,
    group: 'Advanced',
    entries: featureFlagNames.map(
      (flag) =>
        ({
          id: `flag-${flag}`,
          label: flagRegistry[flag].label,
          description: flagRegistry[flag].description,
          keywords: ['feature', 'flags'],
        }) as const,
    ),
  },
] as const satisfies readonly SettingsSectionDefinition[];

export type SettingId = (typeof settingsCatalog)[number]['entries'][number]['id'];
const cloudSections: readonly SettingsSectionDefinition[] = tauCloudEnabled
  ? settingsCatalog
  : settingsCatalog
      .filter((section) => section.id !== 'billing')
      .map((section) =>
        section.id === 'agents'
          ? { ...section, entries: section.entries.filter((entry) => entry.id !== 'show-credits') }
          : section,
      );
/* Machines are hosted by the desktop services utility; the web build has no
 * host to add one to, so the section is hidden rather than shown empty. Desktop's
 * Home is a folder on disk, so it has no browser storage to show. */
export const settingsSections: readonly SettingsSectionDefinition[] = isDesktopTarget()
  ? cloudSections.map((section) =>
      section.id === 'filesystem'
        ? { ...section, entries: section.entries.filter((entry) => entry.id !== 'browser-storage') }
        : section,
    )
  : cloudSections.filter((section) => section.id !== 'machines');

function normalizeSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Match every query word, prioritizing setting names over descriptions and aliases. */
export function searchSettings(
  query: string,
): Array<{ section: SettingsSectionDefinition; entries: SettingDefinition[] }> {
  const normalized = normalizeSearch(query);
  if (!normalized) {
    return [];
  }
  const tokens = normalized.split(/\s+/);
  const groups = settingsSections.map((section) => {
    const ranked = section.entries
      .flatMap((entry) => {
        const label = normalizeSearch(entry.label);
        const text = normalizeSearch(
          [section.label, entry.label, entry.description, ...(entry.keywords ?? [])].join(' '),
        );
        if (!tokens.every((token) => text.includes(token))) {
          return [];
        }
        const rank =
          label === normalized
            ? 0
            : label.startsWith(normalized)
              ? 1
              : tokens.every((token) => label.includes(token))
                ? 2
                : 3;
        return [{ entry, rank }];
      })
      .sort((left, right) => left.rank - right.rank);
    return { section, entries: ranked.map(({ entry }) => entry), rank: ranked[0]?.rank ?? 4 };
  });
  return groups
    .filter((group) => group.entries.length > 0)
    .sort((left, right) => left.rank - right.rank)
    .map(({ section, entries }) => ({ section, entries }));
}
