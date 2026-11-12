import {
  Bot,
  BrainCircuit,
  Cpu,
  CreditCard,
  FlaskConical,
  HardDrive,
  Lock,
  Printer,
  Shield,
  Settings2,
  Globe,
  FolderGit2,
  Rotate3D,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SettingsSection } from '#hooks/use-settings-dialog.js';
import { useMemo } from 'react';
import { experimentalFeatureFlagNames, flagRegistry, featureFlagDefaults } from '#flags/flag.constants.js';
import type { FeatureFlagName } from '#flags/flag.constants.js';
import { useFeature } from '#flags/use-feature.js';
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
        description: 'Choose light, dark or match your system',
        keywords: ['appearance', 'dark mode', 'light mode', 'black', 'system', 'contrast', 'colour'],
      },
      {
        id: 'code-inlay-hints',
        label: 'Code inlay hints',
        description: 'Show parameter names inline in code',
        keywords: ['editor', 'appearance'],
      },
      {
        id: 'pointer-cursors',
        label: 'Pointer cursors',
        description: 'Show a hand cursor over buttons and links',
        keywords: ['appearance', 'cursor', 'hand', 'mouse', 'interactive'],
      },
      {
        id: 'accent-color',
        label: 'Accent color',
        description: 'Tint buttons, links and highlights',
        keywords: ['appearance', 'colour', 'hue'],
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
        label: 'Profile',
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
        label: 'Sign-in methods',
        description: 'Manage Google, GitHub and other sign-in providers',
        keywords: ['github', 'google', 'login'],
      },
      {
        id: 'github-permissions',
        label: 'Gist sharing',
        description: 'Share projects as GitHub Gists and review the authorization on GitHub',
        keywords: ['github', 'gist', 'revoke', 'authorization', 'oauth', 'consent'],
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
    id: 'repositories',
    label: 'Repositories',
    icon: FolderGit2,
    group: 'Personal',
    entries: [
      {
        id: 'github-repositories',
        label: 'GitHub repositories',
        description: 'Connect GitHub and choose which repositories Tau can use',
        keywords: ['github', 'write', 'permissions', 'installation', 'push', 'connect', 'repository', 'disconnect'],
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
        description: 'See your plan and manage your subscription',
        keywords: ['upgrade', 'cancel', 'payment'],
      },
      {
        id: 'plan-limits',
        label: 'Monthly credits',
        description: 'See how many monthly credits you have left',
        keywords: ['plan limits', 'usage', 'allowance'],
      },
      {
        id: 'credit-balance',
        label: 'Purchased credits',
        description: 'See your balance and add credits',
        keywords: ['top up', 'purchase', 'add credits'],
      },
      {
        id: 'automatic-reload',
        label: 'Auto-reload',
        description: 'Buy credits automatically when your balance runs low',
        keywords: ['automatic reload', 'threshold', 'payment', 'budget'],
      },
      {
        id: 'cancel-plan',
        label: 'Cancel plan',
        description: 'Cancel your plan at the end of the billing period',
        keywords: ['subscription', 'downgrade', 'stop'],
      },
    ],
  },
  {
    id: 'data-controls',
    label: 'Data controls',
    icon: Shield,
    group: 'Personal',
    entries: [
      {
        id: 'usage-diagnostics',
        label: 'Share usage and diagnostics',
        description: 'Send anonymous performance and reliability data',
        keywords: ['telemetry', 'usage', 'metrics', 'anonymous', 'diagnostics', 'privacy'],
      },
      {
        id: 'improve-service',
        label: 'Improve Tau for everyone',
        description: 'Control whether your chats are used for improving the service',
        keywords: ['training', 'sharing', 'no train', 'ai', 'privacy', 'agent', 'recording', 'summaries', 'evaluation'],
      },
      {
        id: 'desktop-analytics',
        label: 'Analytics',
        description: 'Send usage analytics to help improve Tau',
        keywords: ['analytics', 'usage', 'events', 'tracking', 'opt out', 'privacy'],
      },
      {
        id: 'hide-my-name',
        label: 'Hide my name in history',
        description: 'Other members see “Anonymous” on what you save',
        keywords: ['anonymous', 'history', 'name', 'privacy', 'author', 'pseudonym'],
      },
      {
        id: 'cookie-preferences',
        label: 'Cookie preferences',
        description: 'Choose whether Tau uses optional analytics',
        keywords: ['cookies', 'analytics', 'posthog', 'consent', 'privacy'],
      },
      {
        id: 'close-account',
        label: 'Close account',
        description: 'Close your account and delete your data',
        keywords: ['delete', 'remove'],
      },
    ],
  },
  {
    /* How 3D views look and respond (onboarding blueprint, Finding 6). Shown only while `viewerControls` is on. */
    id: 'viewer',
    label: 'Viewer',
    icon: Rotate3D,
    group: 'Workspace',
    entries: [
      /* View defaults: one entry per inheritable leaf the person can set (no up axis). */
      {
        id: 'viewer-projection',
        label: 'Projection',
        description: 'Perspective shows depth, orthographic keeps parallel edges parallel',
        keywords: ['field of view', 'fov', 'orthographic', 'perspective', 'camera', 'view defaults'],
      },
      {
        id: 'viewer-surfaces',
        label: 'Surfaces',
        description: 'Show the faces of every model',
        keywords: ['faces', 'view defaults'],
      },
      {
        id: 'viewer-edges',
        label: 'Edges',
        description: 'Outline the edges of every face',
        keywords: ['lines', 'outline', 'view defaults'],
      },
      {
        id: 'viewer-show-gizmo',
        label: 'Show gizmo',
        description: 'The orientation control in the corner of a view',
        keywords: ['view cube', 'hide gizmo', 'none', 'view defaults'],
      },
      {
        id: 'viewer-grid',
        label: 'Grid',
        description: 'A ground grid with a scale label',
        keywords: ['ground', 'floor', 'view defaults'],
      },
      {
        id: 'viewer-axes',
        label: 'Axes',
        description: 'The X, Y and Z axes at the origin',
        keywords: ['origin', 'x y z', 'view defaults'],
      },
      {
        id: 'viewer-matcap',
        label: 'Matcap',
        description: 'Shade surfaces with a studio material',
        keywords: ['material', 'shading', 'lighting', 'view defaults'],
      },
      {
        id: 'viewer-post-processing',
        label: 'Post-processing',
        description: 'Soften shadows and smooth edges on screen',
        keywords: ['ambient occlusion', 'anti-aliasing', 'effects', 'view defaults'],
      },
      {
        id: 'viewer-grid-unit',
        label: 'Grid unit',
        description: 'The length unit the grid shows',
        keywords: ['millimetre', 'inch', 'units', 'metric', 'imperial', 'view defaults'],
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
        keywords: ['cache', 'durable', 'memory', 'off', 'inspect', 'clear', 'collect', 'check size', 'free space'],
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
        description: 'Bind a printer, router or CNC mill, or add a simulated one to try',
        keywords: [
          'printer',
          'router',
          'cnc',
          'mill',
          'bambu',
          'x1c',
          'a1 mini',
          'grbl',
          'longmill',
          'carvera',
          'makera',
          'simulator',
          '3d print',
          'spindle',
          'probe',
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
        label: 'Show credits',
        description: 'Show the credits each message used',
        keywords: ['metadata', 'cost'],
      },
      {
        id: 'filesystem-context',
        label: 'Project files',
        description: 'Include the project file tree',
        keywords: ['editor', 'context', 'filesystem'],
      },
      {
        id: 'active-file',
        label: 'Active file',
        description: 'Include the file you are editing',
        keywords: ['editor', 'context'],
      },
      { id: 'open-tabs', label: 'Open tabs', description: 'Include every open editor tab', keywords: ['context'] },
      { id: 'testing-tools', label: 'Testing tools', description: 'Let the agent run and edit tests' },
      {
        id: 'default-permissions',
        label: 'Default permissions',
        description: 'Whether new chats ask before the agent gets extra folders or network access',
        keywords: ['ask', 'bypass', 'approvals', 'shell', 'sandbox'],
      },
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
        label: 'Browser storage',
        description: 'View Home storage usage and available space',
        keywords: ['quota', 'disk'],
      },
      {
        id: 'tau-cloud-projects',
        label: 'Tau Cloud projects',
        description: 'Choose where your cloud projects appear when you sign in',
        keywords: ['sync', 'backup', 'download', 'materialize', 'sign in'],
      },
    ],
  },
  {
    id: 'browser',
    label: 'Browser',
    icon: Globe,
    group: 'Workspace',
    entries: [
      {
        id: 'web-browser',
        label: 'Web browser',
        description: 'Search engine, page zoom, browsing history, cookies and site permissions',
        keywords: ['chromium', 'downloads', 'privacy'],
      },
    ],
  },
  {
    id: 'experimental',
    label: 'Experimental',
    icon: FlaskConical,
    group: 'Advanced',
    entries: experimentalFeatureFlagNames.map(
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
          : section.id === 'data-controls'
            ? { ...section, entries: section.entries.filter((entry) => entry.id !== 'close-account') }
            : section,
      );
/* Machines are hosted by the desktop services utility; the web build has no
 * host to add one to, so the section is hidden rather than shown empty. Desktop's
 * Home is a folder on disk, so it has no browser storage to show. */
const platformSections: readonly SettingsSectionDefinition[] = isDesktopTarget()
  ? cloudSections.map((section) =>
      section.id === 'filesystem'
        ? { ...section, entries: section.entries.filter((entry) => entry.id !== 'browser-storage') }
        : /* The desktop shell has no optional analytics cookies to choose; its analytics switch stands in. */
          section.id === 'data-controls'
          ? { ...section, entries: section.entries.filter((entry) => entry.id !== 'cookie-preferences') }
          : section,
    )
  : cloudSections
      .filter((section) => section.id !== 'machines' && section.id !== 'browser')
      /* The permission selector governs the desktop shell, which the web build has none of (D1). The web asks for
       * analytics consent through cookie preferences, so the desktop analytics switch is not offered there. */
      .map((section) => ({
        ...section,
        entries: section.entries.filter(
          (entry) => entry.id !== 'default-permissions' && entry.id !== 'desktop-analytics',
        ),
      }));

export const settingsSections: readonly SettingsSectionDefinition[] = platformSections
  .filter((section) => section.id !== 'machines' || featureFlagDefaults.machines)
  .map((section) => ({
    ...section,
    entries: section.entries.filter((entry) => entry.id !== 'automatic-reload' || featureFlagDefaults.automaticReload),
  }));

/**
 * Sections that exist only while a runtime flag is on. The flag is read at render (PostHog evaluates it after
 * hydration), so these are filtered by {@link useSettingsSections} rather than at module load like the build-time
 * gates above. With the flag off the section, its search results and its deep link are absent.
 */
const flaggedSections: Readonly<Partial<Record<SettingsSection, FeatureFlagName>>> = { viewer: 'viewerControls' };

/**
 * The sections this deployment shows for the given runtime flags.
 *
 * @param isOn - Whether a flag is on.
 * @returns The sections, in catalogue order.
 */
export function availableSettingsSections(
  isOn: (flag: FeatureFlagName) => boolean,
): readonly SettingsSectionDefinition[] {
  return settingsSections.filter((section) => {
    const flag = flaggedSections[section.id];
    return flag === undefined || isOn(flag);
  });
}

/**
 * The sections shown now, refreshed when a gating flag changes.
 *
 * @returns The sections, stable while the flags are.
 */
export function useSettingsSections(): readonly SettingsSectionDefinition[] {
  const viewerControls = useFeature('viewerControls');
  return useMemo(() => availableSettingsSections((flag) => flag === 'viewerControls' && viewerControls), [viewerControls]);
}

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
  sections: readonly SettingsSectionDefinition[] = availableSettingsSections(() => false),
): Array<{ section: SettingsSectionDefinition; entries: SettingDefinition[] }> {
  const normalized = normalizeSearch(query);
  if (!normalized) {
    return [];
  }
  const tokens = normalized.split(/\s+/);
  const groups = sections.map((section) => {
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
