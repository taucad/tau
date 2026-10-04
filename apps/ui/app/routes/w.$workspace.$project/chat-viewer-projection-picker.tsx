import { useEffect, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { RJSFSchema } from '@rjsf/utils';
import type { Evaluation } from '@taucad/runtime';
import { workbenchRecords } from '@taucad/workbench';
import { Box, Boxes, ChevronDown, RefreshCcwDot, SlidersHorizontal } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { Separator } from '@taucad/ui/components/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { compileParameterManifest, projectJsonSchemaToParameterDeclaration } from '@taucad/parameters';
import type { ParameterManifest } from '@taucad/parameters';
import { sha256StringSync } from '@taucad/utils/hash';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import type { ParameterEdit } from '#components/geometry/parameters/rjsf-context.js';
import { mergeFormDefaults } from '#components/geometry/parameters/rjsf-utils.js';
import { useGraphicsSelector } from '#hooks/use-graphics.js';
import { useProject } from '#hooks/use-project.js';
import { selectCadEvaluation } from '#machines/cad.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { extractModifiedProperties } from '#utils/object.utils.js';
import { setLocalInstanceChoice, useLocalInstanceChoice } from '#workbench-records/local-instance.js';
import { newViewRecord } from '#workbench-records/projection.js';
import { useWorkbenchViewCommands } from '#workbench-records/view-actions.js';

type ViewOffer = Extract<Evaluation, { success: true }>['views'][number];
type ViewOptions = NonNullable<ViewOffer['options']>;

/** The bottom viewer bar's hairline (`chat-viewer-controls.tsx`). */
const Hairline = (): React.JSX.Element => (
  <Separator orientation='vertical' className='mx-0 first:hidden data-[orientation=vertical]:h-4' />
);

/** A labelled menu trigger in the bar: the bottom bar's ToolToggle at its labelled width. */
const menuTriggerClassName = 'w-auto max-w-40 min-w-0 gap-1 px-2 text-xs data-[state=open]:bg-accent';

/**
 * The viewer's view bar, top left: a sibling of the bottom viewer bar holding the view menu (two or more views, or a
 * pinned view the model no longer offers), the instance menu (when the view offers instances) and the view's options
 * (when it declares any). With none of them it renders nothing. Its menus and options panel stay inside the viewer.
 */
export function ViewerProjectionPicker({
  viewId,
  entryPath,
  cadActor,
  onOpenBeside,
}: {
  readonly viewId: string;
  readonly entryPath: string;
  readonly cadActor: ActorRefFrom<typeof cadMachine>;
  readonly onOpenBeside?: (viewId: string) => void;
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
  if (!showSwitch && !showInstances && !offered?.options) {
    return undefined;
  }
  const choose = (id: string): void => {
    // The first view is the default: choosing it follows whatever the model offers first.
    const nextId = id === evaluation.views[0]?.id ? undefined : id;
    setLocalInstanceChoice(viewId, undefined);
    chooseProjection({ viewCommands, viewId, entryPath, evaluation, nextId });
  };
  const editViewState = (change: {
    readonly options?: Record<string, unknown>;
    readonly authoredInstance?: string | undefined;
  }): void => {
    if (!offered) {
      return;
    }
    void viewCommands.edit(viewId, (current) => {
      const nextRecord = current ?? newViewRecord(entryPath);
      const states = nextRecord.kernelViews ?? [];
      const prior = states.find((view) => view.id === offered.id) ?? { id: offered.id };
      return workbenchRecords.view.schema.parse({
        ...nextRecord,
        kernelViews: [...states.filter((view) => view.id !== offered.id), { ...prior, ...change }],
      });
    });
  };
  const chooseInstance = (id: string): void => {
    if (!offered) {
      return;
    }
    if (id.startsWith('local:')) {
      setLocalInstanceChoice(viewId, { evaluationId: evaluation.id, viewId: offered.id, instanceId: id });
    } else {
      setLocalInstanceChoice(viewId, undefined);
      editViewState({ authoredInstance: id === '' ? undefined : id });
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
        <ViewMenu
          views={evaluation.views}
          selected={selected}
          title={title}
          boundary={boundary}
          onChoose={choose}
          onOpenBeside={onOpenBeside}
        />
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
      {offered?.options ? (
        <>
          <Hairline />
          <ViewOptionsPanel
            viewTitle={offered.title}
            viewKey={offered.id}
            options={offered.options}
            values={state?.options ?? {}}
            boundary={boundary}
            onChange={(options) => {
              editViewState({ options });
            }}
          />
        </>
      ) : null}
    </div>
  );
}

/** The view menu: each offered view once, with the viewer's 1–3 shortcuts, and Open beside. */
function ViewMenu({
  views,
  selected,
  title,
  boundary,
  onChoose,
  onOpenBeside,
}: {
  readonly views: readonly ViewOffer[];
  /** The pinned view id; undefined follows the first view. */
  readonly selected: string | undefined;
  readonly title: string;
  readonly boundary: HTMLElement | undefined;
  readonly onChoose: (id: string) => void;
  readonly onOpenBeside: ((viewId: string) => void) | undefined;
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
        {onOpenBeside && views.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Open beside</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {views.map((view) => (
                  <DropdownMenuItem
                    key={view.id}
                    onSelect={() => {
                      onOpenBeside(view.id);
                    }}
                  >
                    {view.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        ) : null}
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

const transientEdit: ParameterEdit = { kind: 'transient' };

/** A view's compiled option form, or why it cannot be shown, for the schema it was compiled from. */
type CompiledOptions = { readonly schema: RJSFSchema } & (
  | { readonly manifest: ParameterManifest }
  | { readonly reason: string }
);

/** Compile a view's option schema into the manifest the shared Parameters form reads. */
const compileViewOptionsManifest = async (
  viewKey: string,
  schema: RJSFSchema,
  defaults: Record<string, unknown>,
): Promise<ParameterManifest> => {
  // SAFETY: `sha256StringSync` returns the 64 lowercase hex digits a content digest carries.
  const revision = `sha256:${sha256StringSync(JSON.stringify({ schema, defaults }))}` as ParameterManifest['revision'];
  return compileParameterManifest({
    declaration: projectJsonSchemaToParameterDeclaration({
      schema,
      defaults,
      schemaId: `urn:taucad:view-options:${encodeURIComponent(viewKey)}`,
      schemaName: 'ViewOptions',
    }),
    scope: { kind: 'provider', provider: 'view', configuration: viewKey },
    source: { id: `view:${viewKey}`, version: revision, revision, capability: 'json-structure' },
    dependency: revision,
    middleware: revision,
  });
};

/** The view's options toggle and its panel: the view's option schema in the shared Parameters form. */
function ViewOptionsPanel({
  viewTitle,
  viewKey,
  options,
  values,
  boundary,
  onChange,
}: {
  readonly viewTitle: string;
  readonly viewKey: string;
  readonly options: ViewOptions;
  readonly values: Record<string, unknown>;
  readonly boundary: HTMLElement | undefined;
  readonly onChange: (options: Record<string, unknown>) => void;
}): React.JSX.Element {
  const schema = options.schema as RJSFSchema;
  const isModified = Object.keys(extractModifiedProperties(values, options.defaults)).length > 0;
  const label = `${viewTitle} options`;
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={isModified ? `${label} (changed)` : label}
              className='relative data-[state=open]:bg-accent'
            >
              <SlidersHorizontal aria-hidden='true' className='size-4' />
              {isModified ? (
                <span aria-hidden='true' className='absolute top-1 right-1 size-1.5 rounded-full bg-warning' />
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side='bottom'>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align='start'
        side='bottom'
        sideOffset={6}
        collisionBoundary={boundary}
        collisionPadding={8}
        aria-label={label}
        className='flex max-h-(--radix-popover-content-available-height) w-104 max-w-(--radix-popover-content-available-width) flex-col overflow-hidden p-0'
      >
        <div className='flex h-10 shrink-0 items-center gap-2 border-b pr-1.5 pl-3'>
          <h2 className='flex-1 truncate text-sm font-medium'>{label}</h2>
          <Button
            variant='ghost'
            size='xs'
            disabled={!isModified}
            className='text-muted-foreground hover:text-foreground'
            onClick={() => {
              onChange(options.defaults);
            }}
          >
            <RefreshCcwDot aria-hidden='true' />
            Reset
          </Button>
        </div>
        <div className='min-h-0 overflow-y-auto p-1'>
          <ViewOptionsForm
            viewKey={viewKey}
            schema={schema}
            defaults={options.defaults}
            values={values}
            onChange={(modified) => {
              // Saved whole, so a kernel reads every declared value, not only the changed ones.
              onChange(mergeFormDefaults(schema, options.defaults, modified));
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ViewOptionsForm({
  viewKey,
  schema,
  defaults,
  values,
  onChange,
}: {
  readonly viewKey: string;
  readonly schema: RJSFSchema;
  readonly defaults: Record<string, unknown>;
  readonly values: Record<string, unknown>;
  readonly onChange: (modified: Record<string, unknown>) => void;
}): React.JSX.Element {
  const displaySymbol = useGraphicsSelector((snapshot) => snapshot.context.displayUnits.length.symbol);
  const [compiled, setCompiled] = useState<CompiledOptions>();
  useEffect(() => {
    let isCancelled = false;
    const compile = async (): Promise<void> => {
      let next: CompiledOptions;
      try {
        next = { schema, manifest: await compileViewOptionsManifest(viewKey, schema, defaults) };
      } catch (error) {
        next = { schema, reason: error instanceof Error ? error.message : String(error) };
      }
      if (!isCancelled) {
        setCompiled(next);
      }
    };
    // async-iife: bootstrap -- the manifest derives from the offered schema; a newer offer supersedes it.
    void compile();
    return () => {
      isCancelled = true;
    };
  }, [viewKey, schema, defaults]);
  if (compiled?.schema !== schema) {
    return (
      <p role='status' aria-busy='true' className='px-2 py-3 text-xs text-muted-foreground'>
        Preparing options…
      </p>
    );
  }
  if ('reason' in compiled) {
    return <p className='px-2 py-3 text-xs text-muted-foreground'>These options cannot be shown: {compiled.reason}</p>;
  }
  return (
    <Parameters
      presentation='embedded'
      enableSearch={false}
      parameters={values}
      defaultParameters={defaults}
      jsonSchema={schema}
      units={{ length: { displaySymbol } }}
      parameterManifest={compiled.manifest}
      parameterEdit={transientEdit}
      emptyMessage='No options'
      emptyDescription='This view declares no options.'
      onParametersChange={onChange}
    />
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
