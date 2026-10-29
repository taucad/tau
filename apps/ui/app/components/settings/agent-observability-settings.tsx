import { Switch } from '@taucad/ui/components/switch';
import { SettingsGroup, SettingsItem, SettingsRow } from '#components/settings/settings-item.js';
import type { TelemetryPurpose, TelemetryPurposeState } from '#hooks/use-telemetry-purposes.js';
import { telemetryPurposes, useTelemetryPurposes } from '#hooks/use-telemetry-purposes.js';

type PurposeCopy = { label: string; description: string };

/**
 * One entry per purpose, saying what is kept and what for. The switches are independent, so no copy implies that
 * answering one answers another.
 */
const purposeCopy: Record<TelemetryPurpose, PurposeCopy> = {
  summary: {
    label: 'Task summaries',
    description: 'Counts, timings and outcomes of your agent tasks, without prompts or designs',
  },
  feedback: {
    label: 'Ratings and corrections',
    description: 'Your ratings of agent replies and whether you accepted or corrected them, without the reply itself',
  },
  content: {
    label: 'Full task capture',
    description: 'Your prompts, designs and agent replies, so a task can be replayed',
  },
  diagnosis: {
    label: 'Incident review',
    description: 'Let Tau staff read a captured task while investigating a problem',
  },
  reuse: {
    label: 'Evaluation examples',
    description: 'Use captured tasks to test and improve the agent',
  },
  training: {
    label: 'Model training',
    description: 'Use captured tasks to train models',
  },
};

/** Why a switch cannot be changed, for the refusals the account cannot answer its way out of. */
const blockedCopy: Record<string, string> = {
  'notice-unapproved': 'Not available yet',
  'project-fenced': 'Unavailable while this project is being deleted',
  'project-not-owned': 'Unavailable for another account’s project',
  'project-mixed-source': 'Unavailable for projects with another account’s material',
  'tier-excluded': 'Never used on your plan',
  'tier-unverified': 'Unavailable while your plan cannot be confirmed',
};

/** Refusals that say something about a switch the owner could otherwise flip. */
const decisionCopy: Record<string, string> = {
  'notice-superseded': 'The notice changed, so decide again',
};

const statusOf = (state: TelemetryPurposeState): string | undefined =>
  state.refusal === undefined ? undefined : (blockedCopy[state.refusal] ?? decisionCopy[state.refusal]);

/**
 * The account's agent-recording permissions: what Tau may keep from agent tasks, and what for.
 *
 * Every switch shows the server's effective answer, never a local default. The switches always render, so the owner
 * can see what exists even while the answer is loading or unavailable; they are only enabled once the server has
 * answered with a notice in force.
 *
 * @param props - `projectId` scopes the answer to one project.
 * @returns The Agent recording group.
 */
export function AgentObservabilitySettings(props: Readonly<{ projectId?: string }> = {}): React.JSX.Element {
  const { stateOf, canDecide, isLoading, error, decide, isDeciding } = useTelemetryPurposes(
    props.projectId === undefined ? {} : { projectId: props.projectId },
  );
  const isAnswered = !isLoading && !error;

  return (
    <SettingsItem settingId='agent-observability'>
      <SettingsGroup
        title='Agent recording'
        info={
          <>
            <p>
              Optional permissions for what Tau may keep from your agent tasks, to fix problems and improve the agent.
            </p>
            <p>Each one is off until you turn it on, and is separate from usage and diagnostics.</p>
          </>
        }
      >
        {telemetryPurposes.map((purpose) => {
          const state = stateOf(purpose);
          const copy = purposeCopy[purpose];
          const isBlocked = state.refusal !== undefined && state.refusal in blockedCopy;
          // A grant the plan or project overrides still shows as held, so it can always be withdrawn.
          const isHeld = isBlocked && state.granted;
          const status = isAnswered && canDecide ? statusOf(state) : undefined;
          return (
            <SettingsRow
              key={purpose}
              title={copy.label}
              description={status === undefined ? copy.description : `${copy.description} · ${status}`}
              control={
                <Switch
                  aria-label={copy.label}
                  checked={state.allowed || isHeld}
                  disabled={!isAnswered || !canDecide || (isBlocked && !isHeld) || isDeciding}
                  onCheckedChange={(granted) => {
                    decide({ purpose, granted });
                  }}
                />
              }
            />
          );
        })}
        {isAnswered && canDecide ? undefined : (
          <p role='status' className='py-3 text-xs text-muted-foreground'>
            {isLoading
              ? 'Loading your choices…'
              : error
                ? 'Couldn’t load your choices. Check your connection and refresh.'
                : 'Agent recording isn’t available yet. Everything stays off.'}
          </p>
        )}
      </SettingsGroup>
    </SettingsItem>
  );
}
