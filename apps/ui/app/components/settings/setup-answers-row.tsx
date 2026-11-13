import { useState } from 'react';
import { Link } from 'react-router';
import { resetLeaf } from '@taucad/preferences';
import type { PersonProfile } from '@taucad/preferences';
import { SettingsRow } from '#components/settings/settings-item.js';
import { setupAnswersCopy } from '#components/settings/setup-answers-copy.js';
import { goalCopy, languageCopy, toolCopy } from '#components/onboarding/setup-copy.js';
import { usePersonRecord } from '#preferences/use-person-record.js';
import { useOnboardingTelemetry } from '#telemetry/onboarding-telemetry.js';
import { Button } from '@taucad/ui/components/button';

/** Setup's address. Opened from here it counts as Help, as any address without an entry does. */
const setupAddress = '/welcome';

/**
 * The three answers as the row shows them, each "Not answered" when absent.
 *
 * @param profile - The stored profile.
 * @returns The labelled lines, in setup's order.
 */
export const setupAnswerLines = (profile: PersonProfile): ReadonlyArray<Readonly<{ label: string; text: string }>> => {
  const list = (items: readonly string[]): string =>
    items.length === 0 ? setupAnswersCopy.notAnswered : items.join(', ');
  return [
    { label: setupAnswersCopy.makes, text: list(profile.goals.map((goal) => goalCopy[goal].label)) },
    {
      label: setupAnswersCopy.tool,
      text: profile.tool === undefined ? setupAnswersCopy.notAnswered : toolCopy[profile.tool],
    },
    { label: setupAnswersCopy.reads, text: list(profile.languages.map((language) => languageCopy[language])) },
  ];
};

/** Whether the profile holds any answer. */
const hasAnswers = (profile: PersonProfile): boolean =>
  profile.goals.length > 0 || profile.tool !== undefined || profile.languages.length > 0;

/**
 * Settings → Agents' Setup answers row: the three answers on this device, Edit (opens setup) and Clear (empties the
 * profile, so the next admitted turn carries no person block).
 *
 * @returns The row.
 */
export function SetupAnswersRow(): React.JSX.Element | undefined {
  const { profile, writeProfile } = usePersonRecord();
  const telemetry = useOnboardingTelemetry();
  const [isClearRefused, setIsClearRefused] = useState(false);

  const handleClear = (): void => {
    const result = writeProfile({ goals: [], tool: resetLeaf, languages: [] });
    setIsClearRefused(result === 'refused');
    telemetry.setupAnswersCleared();
  };

  return (
    <SettingsRow
      settingId='setup-answers'
      title={setupAnswersCopy.rowTitle}
      description={
        <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5'>
          {setupAnswerLines(profile).map(({ label, text }) => (
            <div key={label} className='contents'>
              <dt>{label}</dt>
              <dd className='text-foreground'>{text}</dd>
            </div>
          ))}
        </dl>
      }
      control={
        <>
          <Button size='control' asChild variant='outline'>
            <Link to={setupAddress}>{setupAnswersCopy.edit}</Link>
          </Button>
          <Button size='control' variant='outline' disabled={!hasAnswers(profile)} onClick={handleClear}>
            {setupAnswersCopy.clear}
          </Button>
        </>
      }
    >
      {isClearRefused ? (
        <p role='alert' className='text-xs text-muted-foreground'>
          {setupAnswersCopy.clearRefused}
        </p>
      ) : undefined}
    </SettingsRow>
  );
}
