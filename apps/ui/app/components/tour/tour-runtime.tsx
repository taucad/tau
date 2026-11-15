/**
 * The product tour on a project page: the tour actor, the driver that connects it to the editor, and the tip on
 * screen. This module is a lazy chunk, loaded by `tour-host.tsx` only while a guided tour is wanted and not ended, or
 * while a replay was asked for.
 */

import { Fragment, useCallback, useRef, useState } from 'react';
import { Compass, X } from 'lucide-react';
import { useActorRef, useSelector } from '@xstate/react';
import { effectivePreset } from '@taucad/preferences';
import { Button } from '@taucad/ui/components/button';
import { CoachMark } from '@taucad/ui/components/coach-mark';
import { Heading } from '@taucad/ui/components/heading';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { getPlatform } from '@taucad/ui/utils/keys';
import { useCommandPaletteItems } from '#components/layout/command-palette.js';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';
import { gizmoChoice } from '#components/onboarding/setup-model.js';
import {
  tourChromeCopy,
  tourCheckPrompt,
  tourConceptCopy,
  tourGestureCopy,
  tourMenuCopy,
  tourPaletteHint,
  tourTipCopy,
  tourTipLabel,
} from '#components/tour/tour-copy.js';
import type { TourTipCopy } from '#components/tour/tour-copy.js';
import type { LegendBinding } from '#components/onboarding/setup-model.js';
import { tourDriverLogic } from '#components/tour/tour-driver.js';
import type { TourDriverInput } from '#components/tour/tour-driver.js';
import { subscribeTourActions } from '#components/tour/tour-actions.js';
import { useTourAnchorRegistry } from '#components/tour/tour-anchors.js';
import type { TourAnchorRegistry } from '#components/tour/tour-anchors.js';
import { resolveTourPlacement } from '#components/tour/tour-placement.js';
import type { TourPlacement } from '#components/tour/tour-placement.js';
import { tourSession } from '#components/tour/tour-session.js';
import { selectFocusedChatId } from '#components/tour/tour-signals.js';
import { readTourStored, subscribeTourStored } from '#components/tour/tour-stored.js';
import { useFeature } from '#flags/use-feature.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useProject } from '#hooks/use-project.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { selectTourTip, tourMachine } from '#machines/tour.machine.js';
import type { TourTip } from '#machines/tour.machine.js';
import { personRecordStores, deviceRecordStore } from '#preferences/person-record.store.js';
import { usePersonRecord } from '#preferences/use-person-record.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { useOnboardingTelemetry } from '#telemetry/onboarding-telemetry.js';
import { deriveAvailableFormats } from '#utils/export-formats.utils.js';

const sameTip = (left: TourTip | undefined, right: TourTip | undefined): boolean =>
  left?.step === right?.step &&
  left?.mode === right?.mode &&
  left?.isReviewing === right?.isReviewing &&
  left?.hasPrevious === right?.hasPrevious &&
  left?.isLast === right?.isLast;

/** The formats the main entry's kernel writes, as the Export pane lists them. */
const useMainEntryFormats = (): readonly string[] => {
  const { projectRef } = useProject();
  const unit = useSelector(projectRef, (state) => state.context.geometryUnits.get(state.context.mainEntryPath));
  const formats = useSelector(unit, (state) =>
    state === undefined
      ? ''
      : deriveAvailableFormats(state.context.kernelClient, state.context.activeKernelId)
          .map(({ format }) => format.toUpperCase())
          .join(' '),
  );
  return formats === '' ? [] : formats.split(' ');
};

/**
 * The tour on a project page.
 *
 * @returns The tip on screen, or nothing.
 */
export function TourRuntime(): React.JSX.Element | undefined {
  const { projectRef, editorRef } = useProject();
  const chats = useChatSessionStore();
  const telemetry = useOnboardingTelemetry();

  /* The tour starts first, then the driver, so every event the tour emits is heard: the tour shows and reports
   * nothing until the driver's first report of what is on screen. */
  const tourRef = useActorRef(tourMachine, {
    input: { ...readTourStored(), replay: tourSession.read().isReplay },
  });
  const driverInput: TourDriverInput = {
    tour: tourRef,
    sources: {
      project: projectRef,
      editor: editorRef,
      chats: {
        subscribeChat: (chatId, listener) => chats.subscribeChat(chatId, listener),
        read: (chatId) => {
          const session = chats.get(chatId);
          return session === undefined ? undefined : { status: session.chat.status, messages: session.messages };
        },
      },
      actions: subscribeTourActions,
      stored: { read: readTourStored, subscribe: subscribeTourStored },
    },
    ports: {
      writeOnboarding: personRecordStores.onboarding.write,
      writeDevice: deviceRecordStore.write,
      telemetry,
      session: tourSession,
    },
  };
  useActorRef(tourDriverLogic, { input: driverInput });

  const tip = useSelector(tourRef, selectTourTip, sameTip);
  const arrival = useSelector(tourRef, (state) => state.context.arrival);
  const hasTestRun = useSelector(tourRef, (state) => state.context.facts.hasTestRun);
  const registry = useTourAnchorRegistry();
  if (tip === undefined || registry === undefined || arrival === undefined) {
    return undefined;
  }
  return (
    <TourTipCard
      key={`${tip.mode}-${tip.step}`}
      tip={tip}
      arrival={arrival}
      hasTestRun={hasTestRun}
      registry={registry}
      send={tourRef.send.bind(tourRef)}
      fillComposer={() => {
        const chatId = selectFocusedChatId(editorRef);
        const session = chatId === undefined ? undefined : chats.get(chatId);
        session?.draftActorRef.send({ type: 'setDraftText', text: tourCheckPrompt });
      }}
    />
  );
}

type TourTipCardProps = Readonly<{
  tip: TourTip;
  arrival: 'empty' | 'prompt';
  hasTestRun: boolean;
  registry: TourAnchorRegistry;
  send: (event: { type: 'next' | 'back' | 'pause' | 'skip' | 'replayClosed' }) => void;
  fillComposer: () => void;
}>;

/** The control "Show me" operates for a tip placed beside a reveal control. */
const useShowMe = (
  step: TourTip['step'],
  placement: TourPlacement,
  registry: TourAnchorRegistry,
): (() => void) | undefined => {
  const workspace = useProjectWorkspace({ enableNoContext: true });
  const { revealId } = placement;
  if (placement.kind !== 'reveal' || revealId === undefined) {
    return undefined;
  }
  return () => {
    if (revealId === 'chat-lane') {
      registry.element('activity-test')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (revealId === 'workbench-open-tab') {
      workspace?.openPanel(step === 'adjust' ? 'parameters' : 'export');
      return;
    }
    /* A tab-bar entry on the phone layout: pressing it shows the region the tip is about. */
    registry.element(revealId)?.click();
  };
};

function TourTipCard({ tip, arrival, hasTestRun, registry, send, fillComposer }: TourTipCardProps): React.JSX.Element {
  const { profile, viewer } = usePersonRecord();
  const isViewerControlsEnabled = useFeature('viewerControls');
  const { open: openSettings } = useSettingsDialog();
  const isNarrow = useIsMobile();
  const formats = useMainEntryFormats();
  const [isFocusInTip, setIsFocusInTip] = useState(false);
  const tipElement = useRef<HTMLDivElement | undefined>(undefined);
  const returnFocusTo = useRef<HTMLElement | undefined>(undefined);
  const isReplay = tip.mode === 'replay';

  const copy = tourTipCopy(tip.step, {
    mode: tip.mode,
    arrival,
    goals: profile.goals,
    mapping: effectivePreset(viewer, profile),
    gizmo: gizmoChoice(viewer, profile),
    formats,
    host: isDesktopTarget() ? 'desktop' : 'browser',
    hasTestRun,
  });
  const placement = resolveTourPlacement({
    step: tip.step,
    registry,
    facts: { hasTestRun, isNarrow },
    view: globalThis.window,
  });
  const showMe = useShowMe(tip.step, placement, registry);
  const isFallback = placement.kind === 'fallback';
  const label = tourTipLabel(tip.index, copy.title);

  const focusTip = (): void => {
    const active = tipElement.current?.ownerDocument.activeElement;
    if (active instanceof HTMLElement && !tipElement.current?.contains(active)) {
      returnFocusTo.current = active;
    }
    tipElement.current?.focus();
  };
  const returnFocus = (): void => {
    const target = returnFocusTo.current;
    returnFocusTo.current = undefined;
    if (target?.isConnected === true) {
      target.focus();
    }
  };
  const close = (): void => {
    returnFocus();
    send({ type: isReplay ? 'replayClosed' : 'pause' });
  };

  /* A replay was asked for, so its tip takes focus when it appears; a guided tip never does. */
  const attachTip = useCallback(
    // oxlint-disable-next-line no-restricted-types -- React passes null to a ref callback on detach.
    (element: HTMLDivElement | null) => {
      tipElement.current = element ?? undefined;
      if (element !== null && isReplay) {
        const active = element.ownerDocument.activeElement;
        if (active instanceof HTMLElement && !element.contains(active) && returnFocusTo.current === undefined) {
          returnFocusTo.current = active;
        }
        element.focus();
      }
    },
    [isReplay],
  );

  useCommandPaletteItems(
    'product-tour',
    (): CommandPaletteItem[] => [
      {
        id: 'tour-focus-tip',
        label: isFocusInTip ? tourMenuCopy.returnFromTip : tourMenuCopy.goToTip,
        group: 'Help',
        icon: <Compass />,
        action: isFocusInTip ? returnFocus : focusTip,
      },
    ],
    [isFocusInTip],
  );

  return (
    <CoachMark
      ref={attachTip}
      anchor={placement.anchor}
      label={label}
      side={placement.side}
      align={placement.align}
      className={tip.step === 'look' ? 'w-[min(17rem,calc(100vw-2rem))]' : 'w-[min(20rem,calc(100vw-2rem))]'}
      data-testid='tour-tip'
      data-placement={placement.kind}
      onEscape={close}
      onFocus={() => {
        setIsFocusInTip(true);
      }}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
          setIsFocusInTip(false);
        }
      }}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='flex flex-col gap-0.5'>
          <span className='text-muted-foreground'>
            {tourConceptCopy[tip.step]} · {tourChromeCopy.position(tip.index)}
            {isReplay ? '' : ` · ${tourPaletteHint(getPlatform())}`}
          </span>
          <Heading level={2} variant='label'>
            {copy.title}
          </Heading>
        </div>
        <Button
          variant='ghost'
          size='icon-xs'
          aria-label={isReplay ? tourChromeCopy.closeTour : tourChromeCopy.pause}
          className='pointer-coarse:size-8'
          onClick={close}
        >
          <X />
        </Button>
      </div>
      <TipBody
        copy={copy}
        onChangeControls={
          isViewerControlsEnabled && !isFallback
            ? () => {
                openSettings('viewer');
              }
            : undefined
        }
      />
      {copy.tryIt === undefined || isFallback ? null : <p className='font-medium'>{copy.tryIt}</p>}
      {showMe === undefined ? null : (
        <Button variant='outline' size='xs' className='self-start pointer-coarse:h-8' onClick={showMe}>
          {tourChromeCopy.showMe}
        </Button>
      )}
      {copy.action === undefined || isFallback ? null : (
        <Button variant='outline' size='xs' className='self-start pointer-coarse:h-8' onClick={fillComposer}>
          {copy.action}
        </Button>
      )}
      <div className='flex flex-wrap items-center justify-between gap-2'>
        {isFallback ? (
          <span />
        ) : (
          <Button
            variant='ghost'
            size='xs'
            className='pointer-coarse:h-8'
            onClick={() => {
              returnFocus();
              send({ type: 'skip' });
            }}
          >
            {isReplay ? tourChromeCopy.close : tourChromeCopy.skip}
          </Button>
        )}
        <span className='flex items-center gap-1.5'>
          {isFallback ? null : (
            <Button
              variant='outline'
              size='xs'
              className='pointer-coarse:h-8'
              disabled={!tip.hasPrevious}
              onClick={() => {
                send({ type: 'back' });
              }}
            >
              {tourChromeCopy.back}
            </Button>
          )}
          {/* Next only marks this tip seen. It never performs the action the tip describes. */}
          <Button
            size='xs'
            className='pointer-coarse:h-8'
            onClick={() => {
              if (tip.isLast) {
                returnFocus();
              }
              send({ type: 'next' });
            }}
          >
            {tip.isLast ? tourChromeCopy.done : tourChromeCopy.next}
          </Button>
        </span>
      </div>
    </CoachMark>
  );
}

/** One binding as key caps: "Shift + Left drag". */
function KeyCaps({ keys }: { readonly keys: LegendBinding }): React.JSX.Element {
  return (
    <span className='inline-flex flex-wrap items-center gap-1'>
      {keys.map((key, index) => (
        <Fragment key={key}>
          {index > 0 ? (
            <span className='text-muted-foreground' aria-hidden='true'>
              +
            </span>
          ) : null}
          <kbd className='rounded-md border bg-muted px-1.5 py-0.5 font-sans text-xs text-foreground'>{key}</kbd>
        </Fragment>
      ))}
    </span>
  );
}

function TipBody({
  copy,
  onChangeControls,
}: {
  readonly copy: TourTipCopy;
  readonly onChangeControls: (() => void) | undefined;
}): React.JSX.Element {
  const { bindings } = copy;
  return (
    <div className='flex flex-col gap-2 text-muted-foreground'>
      {bindings === undefined ? null : (
        <dl className='grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1'>
          {(['orbit', 'pan', 'zoom'] as const).map((gesture) => (
            <div key={gesture} className='contents'>
              <dt className='text-foreground'>{tourGestureCopy[gesture]}</dt>
              <dd className='text-foreground'>
                {bindings[gesture][0] === undefined ? null : <KeyCaps keys={bindings[gesture][0]} />}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p>
        {copy.text.join(' ')}
        {copy.link === undefined || onChangeControls === undefined ? null : (
          <>
            {' '}
            <Button variant='link' size='xs' className='h-auto p-0 align-baseline' onClick={onChangeControls}>
              {copy.link}
            </Button>
          </>
        )}
      </p>
    </div>
  );
}
