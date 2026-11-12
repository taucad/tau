import type { GoalId, LanguageId, PersonProfile, ToolId } from '@taucad/preferences';
import { goalIds, languageIds, toolIds } from '@taucad/preferences';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { RadioGroup, RadioGroupItem } from '@taucad/ui/components/radio-group';
import { ToggleGroup, ToggleGroupItem } from '@taucad/ui/components/toggle-group';
import { backgroundCopy, goalCopy, languageCopy, setupStepCopy, toolCopy } from '#components/onboarding/setup-copy.js';
import { toggleGoal, toggleLanguage } from '#components/onboarding/setup-model.js';

const optionClassName =
  'flex min-h-11 items-start gap-3 rounded-lg border bg-card px-3 py-2.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/40';

const isToolId = (value: string): value is ToolId => (toolIds as readonly string[]).includes(value);
const isLanguageId = (value: string): value is LanguageId => (languageIds as readonly string[]).includes(value);

/**
 * Step 1: six goals, "Just exploring" exclusive. Each change is written at once.
 *
 * @param properties - The profile and its writer.
 * @returns The step's controls.
 */
export function SetupGoalsStep({
  profile,
  onGoalsChange,
}: {
  readonly profile: PersonProfile;
  readonly onGoalsChange: (goals: GoalId[]) => void;
}): React.JSX.Element {
  return (
    <div className='grid gap-2 sm:grid-cols-2' role='group' aria-label={setupStepCopy.goals.heading}>
      {goalIds.map((goal) => (
        <label key={goal} className={optionClassName}>
          <Checkbox
            checked={profile.goals.includes(goal)}
            onCheckedChange={(checked) => {
              onGoalsChange(toggleGoal(profile.goals, goal, checked === true));
            }}
            className='mt-0.5'
          />
          <span className='flex min-w-0 flex-col gap-0.5'>
            <span className='text-sm font-medium'>{goalCopy[goal].label}</span>
            <span className='text-xs text-muted-foreground'>{goalCopy[goal].hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * Step 2: the tool known best (twelve radios) and the languages read ("I'd rather not write code" exclusive).
 *
 * @param properties - The profile and its writers.
 * @returns The step's controls.
 */
export function SetupBackgroundStep({
  profile,
  onToolChange,
  onLanguagesChange,
}: {
  readonly profile: PersonProfile;
  readonly onToolChange: (tool: ToolId) => void;
  readonly onLanguagesChange: (languages: LanguageId[]) => void;
}): React.JSX.Element {
  return (
    <>
      <RadioGroup
        value={profile.tool ?? ''}
        onValueChange={(value) => {
          if (isToolId(value)) {
            onToolChange(value);
          }
        }}
        className='grid gap-1.5 sm:grid-cols-2'
        aria-label={backgroundCopy.toolsLabel}
      >
        {toolIds.map((tool) => (
          <label key={tool} className={`${optionClassName} items-center text-sm`}>
            <RadioGroupItem value={tool} />
            {toolCopy[tool]}
          </label>
        ))}
      </RadioGroup>
      <div className='flex flex-col gap-2'>
        <span id='setup-languages-label' className='text-sm font-medium'>
          {backgroundCopy.languagesLabel}
        </span>
        <ToggleGroup
          type='multiple'
          variant='outline'
          value={[...profile.languages]}
          onValueChange={(value) => {
            const chosen = value.filter((id) => isLanguageId(id));
            const added = chosen.find((id) => !profile.languages.includes(id));
            const removed = profile.languages.find((id) => !chosen.includes(id));
            if (added !== undefined) {
              onLanguagesChange(toggleLanguage(profile.languages, added, true));
            } else if (removed !== undefined) {
              onLanguagesChange(toggleLanguage(profile.languages, removed, false));
            }
          }}
          role='group'
          aria-labelledby='setup-languages-label'
          className='flex-wrap justify-start gap-1.5'
          spacing={1}
        >
          {languageIds.map((language) => (
            <ToggleGroupItem key={language} value={language} className='h-8 text-xs'>
              {languageCopy[language]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className='text-xs text-muted-foreground'>{backgroundCopy.languagesHint}</p>
      </div>
    </>
  );
}
