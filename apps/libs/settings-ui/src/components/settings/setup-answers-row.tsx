import { useState } from 'react';
import { Link } from 'react-router';
import { resetLeaf } from '@taucad/preferences';
import type { GoalId, LanguageId, PersonProfile, ToolId } from '@taucad/preferences';
import { SettingsRow } from '#components/settings/settings-item.js';
import { setupAnswersCopy } from '#components/settings/setup-answers-copy.js';
import { usePersonSettings } from '#components/settings/person-settings.js';
import { Button } from '@taucad/ui/components/button';

/** How setup names each answer; the host passes setup's own copy, so the row and setup say the same. */
export type SetupAnswerNames = Readonly<{
  goals: Readonly<Record<GoalId, Readonly<{ label: string }>>>;
  tools: Readonly<Record<ToolId, string>>;
  languages: Readonly<Record<LanguageId, string>>;
}>;

/** Setup's address. Opened from here it counts as Help, as any address without an entry does. */
const setupAddress = '/welcome';

/**
 * The three answers as the row shows them, each "Not answered" when absent.
 *
 * @param profile - The stored profile.
 * @param names - How setup names each answer.
 * @returns The labelled lines, in setup's order.
 */
export const setupAnswerLines = (
  profile: PersonProfile,
  names: SetupAnswerNames,
): ReadonlyArray<Readonly<{ label: string; text: string }>> => {
  const list = (items: readonly string[]): string =>
    items.length === 0 ? setupAnswersCopy.notAnswered : items.join(', ');
  return [
    { label: setupAnswersCopy.makes, text: list(profile.goals.map((goal) => names.goals[goal].label)) },
    {
      label: setupAnswersCopy.tool,
      text: profile.tool === undefined ? setupAnswersCopy.notAnswered : names.tools[profile.tool],
    },
    { label: setupAnswersCopy.reads, text: list(profile.languages.map((language) => names.languages[language])) },
  ];
};

/** Whether the profile holds any answer. */
const hasAnswers = (profile: PersonProfile): boolean =>
  profile.goals.length > 0 || profile.tool !== undefined || profile.languages.length > 0;

/**
 * Settings → Agents' Setup answers row: the three answers on this device, Edit (opens setup) and Clear (empties the
 * profile, so the next admitted turn carries no person block).
 *
 * @param props - How setup names each answer.
 * @returns The row.
 */
export function SetupAnswersRow({ names }: { readonly names: SetupAnswerNames }): React.JSX.Element | undefined {
  const { profile, writeProfile, telemetry } = usePersonSettings();
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
          {setupAnswerLines(profile, names).map(({ label, text }) => (
            <div key={label} className='contents'>
              <dt>{label}</dt>
              <dd className='text-foreground'>{text}</dd>
            </div>
          ))}
        </dl>
      }
      control={
        <>
          <Button asChild variant='outline'>
            <Link to={setupAddress}>{setupAnswersCopy.edit}</Link>
          </Button>
          <Button variant='outline' disabled={!hasAnswers(profile)} onClick={handleClear}>
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
