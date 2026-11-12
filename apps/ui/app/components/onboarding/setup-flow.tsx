import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { GizmoStyleId, GoalId, LanguageId, MousePresetId, ToolId } from '@taucad/preferences';
import { resetLeaf } from '@taucad/preferences';
import { Button } from '@taucad/ui/components/button';
import { Heading } from '@taucad/ui/components/heading';
import { cn } from '@taucad/ui/utils/cn';
import { searchParameterName } from '@taucad/ui-core/constants/search-parameter.constants';
import { useFeature } from '#flags/use-feature.js';
import { settingsSectionSchema } from '#hooks/use-settings-dialog.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { deviceRecordStore, personRecordStores } from '#preferences/person-record.store.js';
import type { SectionWriteResult } from '#preferences/section-store.js';
import { useDeviceRecord } from '#preferences/use-device-record.js';
import { usePersonRecord } from '#preferences/use-person-record.js';
import { SetupAnswersPanel } from '#components/onboarding/setup-answers-panel.js';
import { setupChromeCopy, setupStepCopy, setupStorageCopy, stepCountLabel } from '#components/onboarding/setup-copy.js';
import type { GizmoChoiceId, SetupStepId } from '#components/onboarding/setup-copy.js';
import { SetupFinish } from '#components/onboarding/setup-finish.js';
import { SetupHowStep } from '#components/onboarding/setup-how-step.js';
import { readKernelLanguages } from '#components/onboarding/setup-kernel-languages.js';
import { announceChangedRows, answerRows, hasTakenTour, setupSteps } from '#components/onboarding/setup-model.js';
import { SetupBackgroundStep, SetupGoalsStep } from '#components/onboarding/setup-question-steps.js';
import { SetupViewerStep } from '#components/onboarding/setup-viewer-step.js';
import { useSetupTelemetry } from '#components/onboarding/setup-telemetry.js';
import type { SetupEntry } from '#telemetry/onboarding-telemetry.js';

/** Settings → Viewer, while the dialog has that section. */
const viewerSettingsSection = settingsSectionSchema.safeParse('viewer');

/** Where setup is: one of its steps, or the screen after Finish. */
type Stage = SetupStepId | 'done';

/**
 * The header: the step bars, the step count and Skip. After Finish it shows only the title.
 *
 * @param properties - The steps, where setup is and the skip action.
 * @returns The header.
 */
function SetupHeader({
  steps,
  current,
  index,
  onSkip,
}: {
  readonly steps: readonly SetupStepId[];
  readonly current: Stage;
  readonly index: number;
  readonly onSkip: () => void;
}): React.JSX.Element {
  const isDone = current === 'done';
  return (
    <header className='flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6'>
      <span className='text-sm font-semibold tracking-tight'>{setupChromeCopy.pageTitle}</span>
      {isDone ? null : (
        <nav aria-label={setupChromeCopy.stepsLabel} className='order-3 w-full sm:order-none sm:w-auto'>
          <ol className='flex items-center gap-1.5'>
            {steps.map((step, position) => (
              <li key={step} className='flex items-center gap-1.5' aria-current={step === current ? 'step' : undefined}>
                <span
                  className={cn('h-1.5 w-8 rounded-full sm:w-12', position <= index ? 'bg-primary' : 'bg-border')}
                  aria-hidden='true'
                />
                <span className='sr-only'>
                  {setupStepCopy[step].name}
                  {position < index ? `, ${setupChromeCopy.stepDone}` : null}
                  {position === index ? `, ${setupChromeCopy.stepCurrent}` : null}
                </span>
              </li>
            ))}
            <li className='ms-1 text-xs text-muted-foreground' aria-hidden='true'>
              {stepCountLabel(index + 1, steps.length)}
            </li>
          </ol>
        </nav>
      )}
      {isDone ? null : (
        <Button variant='ghost' size='sm' onClick={onSkip}>
          {setupChromeCopy.skip}
        </Button>
      )}
    </header>
  );
}

/** What the route supplies: the step to open at and the actions that leave setup. */
export type SetupFlowProps = Readonly<{
  /** How setup was reached, for `onboarding_setup_opened`. */
  entry: SetupEntry;
  /** The step to open at, such as `how` from Help → "How Tau works". A step setup does not have opens step 1. */
  initialStep?: SetupStepId;
  /** Start a replay of the tour, from step 4 once the tour has ended. */
  onReplayTour?: () => void;
  /** Desktop: open a folder of projects, from the screen after Finish. */
  onOpenFolder?: () => Promise<void>;
}>;

/**
 * Setup at `/welcome` (Finding 2): three questions and one explainer, each optional, each showing what its answer
 * changes, with Skip one press away. Every answer is written to the device record when it is given, so setup is an
 * editor for the record: opened again, it shows what is stored.
 *
 * @param properties - The starting step and the leaving actions.
 * @returns The setup page.
 */
export function SetupFlow({ entry, initialStep, onReplayTour, onOpenFolder }: SetupFlowProps): React.JSX.Element {
  const navigate = useNavigate();
  const isViewerControlsEnabled = useFeature('viewerControls');
  const isWarehouseEnabled = useFeature('partsWarehouse');
  const steps = setupSteps(isViewerControlsEnabled);
  const { profile, viewer, onboarding, writeProfile, writeViewer, writeOnboarding } = usePersonRecord();
  const { device, writeDevice } = useDeviceRecord();
  const kernels = useMemo(() => readKernelLanguages(), []);
  const isDesktop = isDesktopTarget();
  const telemetry = useSetupTelemetry(entry);

  const [stage, setStage] = useState<Stage>(initialStep ?? 'goals');
  const [announcement, setAnnouncement] = useState('');
  const [isStorageRefused, setIsStorageRefused] = useState(false);
  const [isTourWanted, setIsTourWanted] = useState(onboarding.tour.wanted ?? true);
  const heading = useRef<HTMLHeadingElement>(null);
  const shownStage = useRef<Stage>(stage);

  /* A step this setup does not have (step 3 with `viewerControls` off) opens step 1. */
  const current: Stage = stage === 'done' || steps.includes(stage) ? stage : 'goals';
  const index = current === 'done' ? steps.length : steps.indexOf(current);

  useEffect(() => {
    /* Opening setup counts as offered, so home stops inviting; a later Skip or Finish only rises from it. */
    writeOnboarding({ setupStatus: 'offered' });
  }, [writeOnboarding]);

  useEffect(() => {
    /* Move focus to the new step's heading so a screen-reader user hears where they are; not on first paint. */
    if (shownStage.current !== current) {
      shownStage.current = current;
      heading.current?.focus();
    }
  }, [current]);

  const rows = answerRows({ profile, viewer, device, kernels, isViewerControlsEnabled });

  /** The record as the stores hold it now, after a write in this handler. */
  const readRecord = (): Readonly<{ profile: typeof profile; viewer: typeof viewer; device: typeof device }> => ({
    profile: personRecordStores.profile.read(),
    viewer: personRecordStores.viewer.read(),
    device: deviceRecordStore.read(),
  });

  /** Write one answer, then announce the rows it changed and say whether the device kept it. */
  const answer = (write: () => SectionWriteResult): void => {
    const result = write();
    const after = answerRows({ ...readRecord(), kernels, isViewerControlsEnabled });
    setAnnouncement(announceChangedRows(rows, after));
    setIsStorageRefused(result !== 'saved');
  };

  const answers = {
    goals: (goals: GoalId[]) => {
      answer(() => writeProfile({ goals }));
      telemetry.profileChanged(readRecord().profile);
    },
    tool: (tool: ToolId) => {
      answer(() => writeProfile({ tool }));
      telemetry.profileChanged(readRecord().profile);
    },
    languages: (languages: LanguageId[]) => {
      answer(() => writeProfile({ languages }));
    },
    preset: (preset: MousePresetId) => {
      answer(() => writeViewer({ controls: { preset } }));
      telemetry.presetSelected(preset, profile);
    },
    gizmo: (choice: GizmoChoiceId) => {
      if (choice === 'none') {
        telemetry.gizmoHidden();
      } else {
        telemetry.gizmoSelected(choice, profile);
      }
      answer(() =>
        choice === 'none'
          ? writeViewer({ viewDefaults: { 'display.gizmo': false } })
          : writeViewer({
              gizmo: { style: choice satisfies GizmoStyleId },
              ...(viewer.viewDefaults['display.gizmo'] === false
                ? { viewDefaults: { 'display.gizmo': resetLeaf } }
                : {}),
            }),
      );
    },
    trackpad: (isTrackpad: boolean) => {
      const inputDevice = isTrackpad ? 'trackpad' : 'mouse';
      answer(() => writeDevice({ inputDevice }));
      telemetry.inputDeviceChanged(inputDevice);
    },
  };

  const goTo = (next: Stage): void => {
    setAnnouncement('');
    setStage(next);
  };

  const finish = (): void => {
    if (current !== 'done') {
      telemetry.stepCompleted(current, readRecord());
    }
    const result = writeOnboarding({ setupStatus: 'completed', wanted: isTourWanted });
    telemetry.completed({ steps, record: readRecord(), isTourWanted });
    setIsStorageRefused(result !== 'saved');
    goTo('done');
  };

  const skip = (): void => {
    if (current !== 'done') {
      telemetry.skipped(current);
    }
    writeOnboarding({ setupStatus: 'skipped' });
    void navigate('/');
  };

  const isDone = current === 'done';
  const hasPanel = current === 'goals' || current === 'background';
  const storageLine = isStorageRefused ? setupStorageCopy.refused : current === 'goals' ? setupStorageCopy.saved : '';

  return (
    <div className='mx-auto flex min-h-full w-full max-w-5xl flex-col' data-testid='setup-flow'>
      <SetupHeader steps={steps} current={current} index={index} onSkip={skip} />

      <div className={cn('grid min-w-0 flex-1 gap-6 p-4 sm:p-6', hasPanel ? 'lg:grid-cols-[minmax(0,1fr)_17rem]' : '')}>
        <div className='flex min-w-0 flex-col gap-5'>
          {isDone ? (
            <SetupFinish
              headingRef={heading}
              profile={profile}
              viewer={viewer}
              device={device}
              isTourWanted={isTourWanted}
              isDesktop={isDesktop}
              isViewerControlsEnabled={isViewerControlsEnabled}
              onStartBuilding={() => {
                void navigate('/');
              }}
              onOpenFolder={onOpenFolder}
              onOpenViewerSettings={
                viewerSettingsSection.success
                  ? () => {
                      void navigate(`/?${searchParameterName.settings}=${viewerSettingsSection.data}`);
                    }
                  : undefined
              }
              onChangeAnswers={() => {
                goTo(steps[0] ?? 'goals');
              }}
            />
          ) : (
            <>
              <div className='flex flex-col gap-1'>
                <Heading ref={heading} level={1} variant='section' tabIndex={-1} className='outline-none'>
                  {setupStepCopy[current].heading}
                </Heading>
                <p className='text-sm text-muted-foreground'>{setupStepCopy[current].intro}</p>
              </div>
              {current === 'goals' ? <SetupGoalsStep profile={profile} onGoalsChange={answers.goals} /> : null}
              {current === 'background' ? (
                <SetupBackgroundStep
                  profile={profile}
                  onToolChange={answers.tool}
                  onLanguagesChange={answers.languages}
                />
              ) : null}
              {current === 'viewer' ? (
                <SetupViewerStep
                  profile={profile}
                  viewer={viewer}
                  device={device}
                  onPresetChange={answers.preset}
                  onGizmoChange={answers.gizmo}
                  onTrackpadChange={answers.trackpad}
                />
              ) : null}
              {current === 'how' ? (
                <SetupHowStep
                  profile={profile}
                  isDesktop={isDesktop}
                  isWarehouseEnabled={isWarehouseEnabled}
                  hasTakenTour={hasTakenTour(onboarding)}
                  isTourWanted={isTourWanted}
                  onTourWantedChange={setIsTourWanted}
                  onReplayTour={onReplayTour}
                />
              ) : null}
            </>
          )}
          <p
            className={cn('text-xs', isStorageRefused ? 'text-foreground' : 'text-muted-foreground')}
            role='status'
            data-testid='setup-storage-status'
          >
            {storageLine}
          </p>
        </div>
        {hasPanel ? <SetupAnswersPanel rows={rows} announcement={announcement} /> : null}
      </div>

      {isDone ? null : (
        <footer className='flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-6'>
          <Button
            variant='ghost'
            onClick={() => {
              goTo(steps[index - 1] ?? current);
            }}
            disabled={index === 0}
          >
            <ArrowLeft />
            {setupChromeCopy.back}
          </Button>
          {index === steps.length - 1 ? (
            <Button onClick={finish}>{setupChromeCopy.finish}</Button>
          ) : (
            <Button
              onClick={() => {
                telemetry.stepCompleted(current, readRecord());
                goTo(steps[index + 1] ?? 'done');
              }}
            >
              {setupChromeCopy.continue}
              <ArrowRight />
            </Button>
          )}
        </footer>
      )}
    </div>
  );
}
