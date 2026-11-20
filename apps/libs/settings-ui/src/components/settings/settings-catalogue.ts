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
import type { SettingsSection } from '#components/settings/settings-section.js';

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

/** A feature flag the host offers under Experimental, with the copy its row shows. */
export type ExperimentalFlagCopy = {
  readonly name: string;
  readonly label: string;
  readonly description: string;
};

/** Every section but Experimental, whose entries are the host's feature flags. */
const baseSections = [
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
      /* Navigation. */
      {
        id: 'viewer-mouse-controls',
        label: 'Mouse controls',
        description: 'Which buttons orbit, pan and zoom',
        keywords: [
          'mouse',
          'orbit',
          'pan',
          'zoom',
          'rotate',
          'preset',
          'navigation',
          'camera',
          'solidworks',
          'blender',
        ],
      },
      {
        id: 'viewer-orbit-style',
        label: 'Orbit style',
        description: 'Keep the view upright, or turn it freely over the top',
        keywords: [
          'orbit',
          'turntable',
          'free',
          'trackball',
          'arcball',
          'tumble',
          'constrained',
          'roll',
          'rotate',
          'upright',
          'navigation',
        ],
      },
      {
        id: 'viewer-zoom-to-cursor',
        label: 'Zoom to cursor',
        description: 'Zoom toward the pointer instead of the view centre',
        keywords: ['zoom', 'pointer', 'wheel', 'navigation'],
      },
      {
        id: 'viewer-orbit-around-cursor',
        label: 'Orbit around cursor',
        description: 'Rotate about the point under the pointer',
        keywords: ['orbit', 'rotate', 'pivot', 'pointer', 'navigation'],
      },
      {
        id: 'viewer-invert-zoom',
        label: 'Invert zoom',
        description: 'Scroll up to zoom out',
        keywords: ['zoom', 'reverse', 'wheel', 'scroll', 'direction'],
      },
      /* Gizmo. Show gizmo is the View defaults row. */
      {
        id: 'viewer-gizmo-style',
        label: 'Gizmo style',
        description: 'The orientation control you click to snap views',
        keywords: ['view cube', 'cube', 'axis balls', 'axes', 'triad', 'orientation'],
      },
      /* View defaults: one entry per row of the group. */
      {
        id: 'viewer-projection',
        label: 'Projection',
        description: 'Perspective shows depth, orthographic keeps parallel edges parallel',
        keywords: ['field of view', 'fov', 'orthographic', 'perspective', 'camera', 'view defaults'],
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
      {
        id: 'use-setup-answers',
        label: 'Use my setup answers',
        description: 'Tau tells the agent what you make and the code you read',
        keywords: ['onboarding', 'goals', 'languages', 'privacy', 'context', 'person'],
      },
      {
        id: 'setup-answers',
        label: 'Setup answers',
        description: 'What you told setup: what you make, the tool you know and the code you read',
        keywords: ['onboarding', 'welcome', 'goals', 'tool', 'languages', 'edit', 'clear'],
      },
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
        label: 'Cloud projects',
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
] as const satisfies readonly SettingsSectionDefinition[];

/** The id of a setting: a catalogue entry, or `flag-<name>` for an Experimental feature flag. */
export type SettingId = (typeof baseSections)[number]['entries'][number]['id'] | `flag-${string}`;

/**
 * The whole settings catalogue, ungated. Navigation and search share it; entries point to explicit settings
 * landmarks. The host removes what its deployment does not offer (Tau Cloud, desktop, flags) before showing it.
 *
 * @param flags - The feature flags shown under Experimental, in order, with their copy.
 * @returns Every section, in navigation order.
 */
export function createSettingsCatalogue(flags: readonly ExperimentalFlagCopy[]): readonly SettingsSectionDefinition[] {
  return [
    ...baseSections,
    {
      id: 'experimental',
      label: 'Experimental',
      icon: FlaskConical,
      group: 'Advanced',
      entries: flags.map(({ name, label, description }) => ({
        id: `flag-${name}`,
        label,
        description,
        keywords: ['feature', 'flags'],
      })),
    },
  ];
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Match every query word, prioritizing setting names over descriptions and aliases.
 *
 * @param query - What the person typed.
 * @param sections - The sections to search: the host's catalogue after its own gating.
 * @returns The matching sections, best match first, each with its matching entries.
 */
export function searchSettings(
  query: string,
  sections: readonly SettingsSectionDefinition[],
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
