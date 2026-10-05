import { useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { Evaluation } from '@taucad/runtime';
import { workbenchRecords } from '@taucad/workbench';
import { Box, Boxes, ChevronDown } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { Separator } from '@taucad/ui/components/separator';
import { useProject } from '#hooks/use-project.js';
import { selectCadEvaluation } from '#machines/cad.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { setLocalInstanceChoice, useLocalInstanceChoice } from '#workbench-records/local-instance.js';
import { newViewRecord } from '#workbench-records/projection.js';
import { useWorkbenchViewCommands } from '#workbench-records/view-actions.js';

type ViewOffer = Extract<Evaluation, { success: true }>['views'][number];

/** The bottom viewer bar's hairline (`chat-viewer-controls.tsx`). */
const Hairline = (): React.JSX.Element => (
  <Separator orientation='vertical' className='mx-0 first:hidden data-[orientation=vertical]:h-4' />
);

/** A labelled menu trigger in the bar: the bottom bar's ToolToggle at its labelled width. */
const menuTriggerClassName = 'w-auto max-w-40 min-w-0 gap-1 px-2 text-xs data-[state=open]:bg-accent';

/**
 * The viewer's view bar, top left: a sibling of the bottom viewer bar holding the view menu (two or more views, or a
 * pinned view the model no longer offers) and the instance menu (when the view offers instances). With neither it
 * renders nothing. Its menus stay inside the viewer. A view's options are Kernel settings in Viewer settings.
 */
export function ViewerProjectionPicker({
  viewId,
  entryPath,
  cadActor,
}: {
  readonly viewId: string;
  readonly entryPath: string;
  readonly cadActor: ActorRefFrom<typeof cadMachine>;
}): React.JSX.Element | undefined {
  const evaluation = useSelector(cadActor, selectCadEvaluation);
  const { viewRecords } = useProject();
  const viewCommands = useWorkbenchViewCommands();
  const record = viewRecords.get(viewId);
  const selected = record?.selectedKernelView;
  const localChoice = useLocalInstanceChoice(viewId);
  // The viewer frame bounds every menu and panel the bar opens.
  const [boundary, setBoundary] = useState<HTMLElement>();
  if (!evaluation?.success) {
    return undefined;
  }
  const offered = selected ? evaluation.views.find((view) => view.id === selected) : evaluation.views[0];
  const state = record?.kernelViews?.find((view) => view.id === offered?.id);
  const showSwitch = evaluation.views.length > 1 || Boolean(selected && !offered);
  const localForView = localChoice?.viewId === offered?.id ? localChoice : undefined;
  const selectedInstance = localForView?.instanceId ?? state?.authoredInstance ?? '';
  const showInstances = Boolean(offered?.instances?.length) || selectedInstance !== '';
  if (!showSwitch && !showInstances) {
    return undefined;
  }
  const choose = (id: string): void => {
    // The first view is the default: choosing it follows whatever the model offers first.
    const nextId = id === evaluation.views[0]?.id ? undefined : id;
    setLocalInstanceChoice(viewId, undefined);
    chooseProjection({ viewCommands, viewId, entryPath, evaluation, nextId });
  };
  const editViewState = async (
    kernelViewId: string,
    change: { readonly authoredInstance?: string | undefined },
  ): Promise<boolean> =>
    viewCommands.edit(viewId, (current) => {
      const nextRecord = current ?? newViewRecord(entryPath);
      const states = nextRecord.kernelViews ?? [];
      const prior = states.find((view) => view.id === kernelViewId) ?? { id: kernelViewId };
      return workbenchRecords.view.schema.parse({
        ...nextRecord,
        kernelViews: [...states.filter((view) => view.id !== kernelViewId), { ...prior, ...change }],
      });
    });
  const chooseInstance = (id: string): void => {
    if (!offered) {
      return;
    }
    if (id.startsWith('local:')) {
      setLocalInstanceChoice(viewId, { evaluationId: evaluation.id, viewId: offered.id, instanceId: id });
    } else {
      setLocalInstanceChoice(viewId, undefined);
      void editViewState(offered.id, { authoredInstance: id === '' ? undefined : id });
    }
  };
  const title = offered?.title ?? `${selected} unavailable`;
  return (
    <div
      ref={(node) => {
        setBoundary(node?.closest<HTMLElement>('[data-viewer-frame]') ?? undefined);
      }}
      role='group'
      aria-label='View controls'
      data-slot='view-controls'
      className='pointer-events-auto flex h-9 max-w-full min-w-0 items-center gap-1 rounded-lg border bg-sidebar p-1 text-muted-foreground shadow-xs [&_button]:font-normal [&_button:focus-visible]:text-foreground [&_button:hover]:text-foreground [&_button[data-state=open]]:text-foreground'
    >
      {showSwitch ? (
        <ViewMenu views={evaluation.views} selected={selected} title={title} boundary={boundary} onChoose={choose} />
      ) : null}
      {offered && showInstances ? (
        <>
          <Hairline />
          <InstanceMenu
            viewTitle={offered.title}
            instances={offered.instances ?? []}
            selected={selectedInstance}
            expired={localForView && localForView.evaluationId !== evaluation.id ? localForView.instanceId : undefined}
            boundary={boundary}
            onChoose={chooseInstance}
          />
        </>
      ) : null}
    </div>
  );
}

/** The view menu: each offered view once, with the viewer's 1–3 shortcuts. */
function ViewMenu({
  views,
  selected,
  title,
  boundary,
  onChoose,
}: {
  readonly views: readonly ViewOffer[];
  /** The pinned view id; undefined follows the first view. */
  readonly selected: string | undefined;
  readonly title: string;
  readonly boundary: HTMLElement | undefined;
  readonly onChoose: (id: string) => void;
}): React.JSX.Element {
  const isUnavailable = selected !== undefined && !views.some((view) => view.id === selected);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon-sm' aria-label={`View: ${title}`} className={menuTriggerClassName}>
          <Box aria-hidden='true' className='size-4 shrink-0' />
          <span className='truncate'>{title}</span>
          <ChevronDown aria-hidden='true' className='size-3 shrink-0' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        side='bottom'
        className='w-56'
        collisionBoundary={boundary}
        aria-label='Pane view'
      >
        <DropdownMenuLabel>View</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={selected ?? views[0]?.id ?? ''} onValueChange={onChoose}>
          {isUnavailable ? (
            <DropdownMenuRadioItem disabled value={selected}>
              {selected} (unavailable)
            </DropdownMenuRadioItem>
          ) : null}
          {views.map((view, index) => (
            <DropdownMenuRadioItem key={view.id} value={view.id}>
              {view.title}
              {/* The viewer's 1–3 keys choose the first three views. */}
              {index < 3 && views.length > 1 ? (
                <DropdownMenuShortcut aria-hidden='true'>{index + 1}</DropdownMenuShortcut>
              ) : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The instance menu: the whole view or one of its instances, and a local choice a rebuild expired. */
function InstanceMenu({
  viewTitle,
  instances,
  selected,
  expired,
  boundary,
  onChoose,
}: {
  readonly viewTitle: string;
  readonly instances: NonNullable<ViewOffer['instances']>;
  /** The chosen instance id; empty for the whole view. */
  readonly selected: string;
  /** A local instance from an earlier evaluation, still chosen. */
  readonly expired: string | undefined;
  readonly boundary: HTMLElement | undefined;
  readonly onChoose: (id: string) => void;
}): React.JSX.Element {
  const label =
    instances.find((instance) => instance.id === selected)?.title ??
    (selected === '' ? 'Whole view' : `${selected}${expired === selected ? ' (expired)' : ''}`);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={`${viewTitle} instance: ${label}`}
          className={menuTriggerClassName}
        >
          <Boxes aria-hidden='true' className='size-4 shrink-0' />
          <span className='truncate'>{label}</span>
          <ChevronDown aria-hidden='true' className='size-3 shrink-0' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        side='bottom'
        className='w-56'
        collisionBoundary={boundary}
        aria-label={`${viewTitle} instance`}
      >
        <DropdownMenuLabel>Instance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={selected} onValueChange={onChoose}>
          <DropdownMenuRadioItem value=''>Whole view</DropdownMenuRadioItem>
          {expired ? (
            <DropdownMenuRadioItem disabled value={expired}>
              {expired} (expired)
            </DropdownMenuRadioItem>
          ) : null}
          {instances.map((instance) => (
            <DropdownMenuRadioItem key={instance.id} value={instance.id}>
              {instance.title}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function chooseProjection({
  viewCommands,
  viewId,
  entryPath,
  evaluation,
  nextId,
}: {
  readonly viewCommands: ReturnType<typeof useWorkbenchViewCommands>;
  readonly viewId: string;
  readonly entryPath: string;
  readonly evaluation: Extract<Evaluation, { success: true }>;
  readonly nextId: string | undefined;
}): void {
  const nextOffer = evaluation.views.find((view) => view.id === nextId);
  void viewCommands.edit(viewId, (current) => {
    const record = current ?? newViewRecord(entryPath);
    const states = record.kernelViews ?? [];
    return workbenchRecords.view.schema.parse({
      ...record,
      selectedKernelView: nextId,
      kernelViews:
        nextId && nextOffer?.options && !states.some((state) => state.id === nextId)
          ? [...states, { id: nextId, options: nextOffer.options.defaults }]
          : states,
    });
  });
}
