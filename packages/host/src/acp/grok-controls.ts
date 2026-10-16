import type { SessionConfigOption } from '@agentclientprotocol/sdk';
import type { JsonObject } from '@taucad/agent-host';

/** Adapter-owned selectors; never forwarded as standard Grok config IDs. */
export const grokPermissionConfigId = 'tau.grok.permissions';
export const grokPlanningConfigId = 'tau.grok.planning';

/** A requested policy, not a claim that Grok's managed policy accepted it. */
export type GrokPermissionMode = 'ask' | 'auto' | 'always-approve';
/** Standard session mode IDs supported by the native Grok agent. */
export type GrokPlanningMode = 'default' | 'plan';

/**
 * Parse a selection without broadening an invalid value to automatic approval.
 * @param value - Untrusted persisted or user-selected value.
 * @returns A supported policy, or nothing.
 */
export const grokPermissionModeOf = (value: unknown): GrokPermissionMode | undefined =>
  value === 'ask' || value === 'auto' || value === 'always-approve' ? value : undefined;

/**
 * Grok's standard session mode IDs are separate from permission policy.
 * @param value - Untrusted mode value.
 * @returns A supported planning mode, or nothing.
 */
export const grokPlanningModeOf = (value: unknown): GrokPlanningMode | undefined =>
  value === 'default' || value === 'plan' ? value : undefined;

/**
 * Only offer this bridge for the native Grok protocol version we verified.
 * @param agentId - Selected adapter identity.
 * @param metadata - Native initialize metadata.
 * @returns Whether this native agent supports the verified bridge.
 */
export const grokControlsSupported = (
  agentId: string,
  metadata: Readonly<Record<string, unknown>> | undefined,
): boolean => {
  if (agentId !== 'grok' || metadata?.['grokShell'] !== true) {
    return false;
  }
  const version = metadata['agentVersion'];
  const match = typeof version === 'string' ? /^(\d+)\.(\d+)\.(\d+)(?:\s|$|\+)/.exec(version) : undefined;
  if (!match) {
    return false;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major > 1 || (major === 1 && (minor > 0 || patch >= 52));
};

/**
 * A remote availability hint, not the resolved local/managed policy.
 * Missing or malformed fields do not erase a prior hint; null means unknown.
 * @param previous - Most recent remote hint.
 * @param params - The settings notification payload.
 * @returns Updated hint, with absence representing unknown availability.
 */
export const grokAutoAvailability = (previous: boolean | undefined, params: JsonObject): boolean | undefined => {
  const value = params['auto_permission_mode_enabled'];
  return value === null ? undefined : typeof value === 'boolean' ? value : previous;
};

/**
 * Explicit flags prevent a user's global default leaking into a Tau chat.
 * Warm reload alone cannot downgrade permissions; also apply the notification.
 * @param mode - The chat's selected permission policy.
 * @returns Metadata for new/load/resume.
 */
export const grokPermissionMetadata = (mode: GrokPermissionMode): JsonObject => ({
  yoloMode: mode === 'always-approve',
  autoMode: mode === 'auto',
});

/**
 * Process-scoped notification: callers must launch Grok with --no-leader.
 * Both flags are required to make Auto/Always approve to Ask a real downgrade.
 * Delivery is not an acknowledgment of effective policy.
 * @param mode - The chat's selected permission policy.
 * @returns Vendor notification with explicit mutually exclusive flags.
 */
export const grokPermissionNotification = (
  mode: GrokPermissionMode,
): {
  readonly method: '_x.ai/yolo_mode_changed';
  readonly params: JsonObject;
} => ({
  method: '_x.ai/yolo_mode_changed',
  /* eslint-disable @typescript-eslint/naming-convention -- Vendor notification keys are snake_case. */
  params: {
    clientIdentifier: 'tau-host',
    yolo_mode: mode === 'always-approve',
    auto_mode: mode === 'auto',
    permission_mode: mode,
  },
  /* eslint-enable @typescript-eslint/naming-convention -- End of vendor notification keys. */
});

/**
 * Planning has a standard request acknowledgment, unlike permission policy.
 * @param sessionId - Vendor session receiving this mode change.
 * @param mode - Selected planning mode.
 * @returns A standard ACP mode request.
 */
export const grokPlanningRequest = (
  sessionId: string,
  mode: GrokPlanningMode,
): {
  readonly method: 'session/set_mode';
  readonly params: { readonly sessionId: string; readonly modeId: GrokPlanningMode };
} => ({
  method: 'session/set_mode',
  params: { sessionId, modeId: mode },
});

/**
 * Shared composer options for the adapter's selected policy and planning mode.
 * Unknown availability does not advertise Auto. A previously selected Auto
 * policy stays visible; the dispatcher must refuse it if availability is lost.
 * @param options - Selected controls and known Auto availability.
 * @param options.permission - Selected permission policy.
 * @param options.planning - Selected planning mode.
 * @param options.autoAvailable - Whether Auto has been advertised available.
 * @returns Permission and planning selects for the shared composer.
 */
export const grokControlOptions = ({
  permission,
  planning,
  autoAvailable,
}: {
  readonly permission: GrokPermissionMode;
  readonly planning: GrokPlanningMode;
  readonly autoAvailable: boolean | undefined;
}): SessionConfigOption[] => {
  return [
    {
      id: grokPermissionConfigId,
      name: 'Permissions',
      category: 'mode',
      type: 'select',
      currentValue: permission,
      options: [
        { value: 'ask', name: 'Ask', description: 'Ask before tools that require approval.' },
        ...(autoAvailable === true || permission === 'auto'
          ? [
              {
                value: 'auto',
                name: 'Auto',
                description: 'Let Grok assess tool approvals. Some actions still need approval.',
              },
            ]
          : []),
        {
          value: 'always-approve',
          name: 'Always approve',
          description:
            'Allow Grok tools, including file edits and commands. Managed policy may still require approval.',
        },
      ],
    },
    {
      id: grokPlanningConfigId,
      name: 'Planning',
      category: 'planning',
      type: 'select',
      currentValue: planning,
      options: [
        { value: 'default', name: 'Build', description: 'Work on the requested changes.' },
        { value: 'plan', name: 'Plan', description: 'Prepare a plan for approval before implementation.' },
      ],
    },
  ];
};
