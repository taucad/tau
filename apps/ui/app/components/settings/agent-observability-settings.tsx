import { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { Loader } from '@taucad/ui/components/loader';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Switch } from '@taucad/ui/components/switch';
import { SettingsItem, SettingsSectionCard } from '#components/settings/settings-item.js';
import type { TelemetryPurpose, TelemetryPurposeState } from '#hooks/use-telemetry-purposes.js';
import { telemetryPurposes, useTelemetryPurposes } from '#hooks/use-telemetry-purposes.js';

type PurposeCopy = { label: string; description: string };

/**
 * One entry per purpose. Each says what is recorded and what it is for, in the
 * account holder's terms: the switches are independent, so the copy never
 * implies that answering one answers another.
 */
const purposeCopy: Record<TelemetryPurpose, PurposeCopy> = {
  summary: {
    label: 'Task summaries',
    description:
      'Record pseudonymous summaries of your agent tasks — counts, timings, models and outcomes — linked to your account. No prompts, designs or messages.',
  },
  content: {
    label: 'Full task capture',
    description:
      'Record the prompts, designs, tool calls and replies of your agent tasks, so a run can be replayed and diagnosed.',
  },
  diagnosis: {
    label: 'Incident diagnosis',
    description:
      'Let a named Tau operator read a captured task while investigating a specific incident or quality question. Restricted readers; no reusable copy.',
  },
  reuse: {
    label: 'Evaluation examples',
    description:
      'Allow a captured task to be selected into Tau’s evaluation set, used to measure and improve the agent. The copy inherits this task’s expiry.',
  },
  training: {
    label: 'Model training',
    description:
      'Allow a captured task to be used to train or fine-tune a model. Separate from every other purpose and never implied by them.',
  },
};

/** What each refusal means to the account holder. */
const refusalCopy: Record<string, string> = {
  'notice-unapproved': 'Not available yet. Tau has not published the notice this permission is given against.',
  'no-decision': 'Off until you turn it on.',
  'notice-superseded': 'The notice changed. Review it and decide again.',
  withdrawn: 'Off because you turned it off.',
  'project-fenced': 'Unavailable: this project is being deleted.',
  'project-not-owned': 'Unavailable: this project belongs to another account.',
  'project-mixed-source': 'Unavailable: this project contains another account’s material.',
  'tier-excluded': 'Not available on your plan. Paid plans are never used for this.',
  'tier-unverified': 'Unavailable while your plan cannot be confirmed.',
};

/** Refusals the account cannot answer its way out of, so the switch is not offered. */
const structuralRefusals = new Set([
  'notice-unapproved',
  'project-fenced',
  'project-not-owned',
  'project-mixed-source',
  'tier-excluded',
  'tier-unverified',
]);

const explain = (state: TelemetryPurposeState): string => {
  if (state.allowed) {
    return 'On.';
  }
  return (state.refusal === undefined ? undefined : refusalCopy[state.refusal]) ?? 'Off.';
};

/**
 * The account's agent-observability permissions.
 *
 * Every switch shows the server's effective answer rather than the account's
 * raw preference: a purpose the plan or the project excludes reads as off and
 * explains why, and nothing is shown as on because a field is missing.
 *
 * @param props - `projectId` scopes the answer to one project.
 * @returns The settings card.
 */
export function AgentObservabilitySettings(props: Readonly<{ projectId?: string }> = {}): React.JSX.Element {
  const { stateOf, canDecide, isLoading, error, decide, isDeciding } = useTelemetryPurposes(
    props.projectId === undefined ? {} : { projectId: props.projectId },
  );
  const describedBy = useId();

  return (
    <SettingsItem settingId='agent-observability'>
      <SettingsSectionCard>
        <CardHeader>
          <CardTitle>Agent recording</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <p className='text-sm text-muted-foreground'>
            These permissions are separate from each other and from the usage and diagnostics switch above. Each one is
            off until you turn it on.
          </p>
          {isLoading ? (
            <div className='flex items-center justify-center py-4'>
              <Loader className='size-5 text-muted-foreground' />
            </div>
          ) : error ? (
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <AlertCircle className='size-4 shrink-0' />
              <span>Unable to load agent recording permissions. Check your connection and refresh.</span>
            </div>
          ) : (
            telemetryPurposes.map((purpose) => {
              const state = stateOf(purpose);
              const copy = purposeCopy[purpose];
              const blocked = state.refusal !== undefined && structuralRefusals.has(state.refusal);
              // A grant the plan or project overrides still shows as held, so it can always be withdrawn.
              const held = blocked && state.granted;
              return (
                <label
                  key={purpose}
                  className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'
                >
                  <span className='flex flex-col gap-1'>
                    <span className='font-medium'>{copy.label}</span>
                    <span id={`${describedBy}-${purpose}`} className='text-sm text-muted-foreground'>
                      {copy.description} {explain(state)}
                    </span>
                  </span>
                  <Switch
                    aria-label={copy.label}
                    aria-describedby={`${describedBy}-${purpose}`}
                    checked={state.allowed || held}
                    disabled={(blocked && !held) || isDeciding || !canDecide}
                    onCheckedChange={(granted) => {
                      decide({ purpose, granted });
                    }}
                  />
                </label>
              );
            })
          )}
        </CardContent>
      </SettingsSectionCard>
    </SettingsItem>
  );
}
