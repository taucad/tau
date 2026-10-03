import { useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { Evaluation } from '@taucad/runtime';
import { workbenchRecords } from '@taucad/workbench';
import { Box, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { useProject } from '#hooks/use-project.js';
import { selectCadEvaluation } from '#machines/cad.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { setLocalInstanceChoice, useLocalInstanceChoice } from '#workbench-records/local-instance.js';
import { newViewRecord } from '#workbench-records/projection.js';
import { useWorkbenchViewCommands } from '#workbench-records/view-actions.js';

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
  const [optionError, setOptionError] = useState<string | undefined>();
  const localChoice = useLocalInstanceChoice(viewId);
  if (!evaluation?.success) {
    return undefined;
  }
  const offered = selected ? evaluation.views.find((view) => view.id === selected) : evaluation.views[0];
  const state = record?.kernelViews?.find((view) => view.id === offered?.id);
  const isUnavailable = Boolean(selected && !offered);
  const showSwitch = evaluation.views.length > 1 || isUnavailable;
  const localForView = localChoice?.viewId === offered?.id ? localChoice : undefined;
  const selectedInstance = localForView?.instanceId ?? state?.authoredInstance ?? '';
  const choose = (id: string): void => {
    const nextId = id === '' ? undefined : id;
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
  const schemaProperties = offered?.options?.schema.properties ?? {};
  const values = { ...offered?.options?.defaults, ...state?.options };
  const editOption = (key: string, value: unknown): void => {
    const next = Object.fromEntries(Object.entries(values).filter(([name]) => name !== key));
    if (value !== undefined) {
      next[key] = value;
    }
    editViewState({ options: next });
  };
  if (!showSwitch && !offered?.instances?.length && !offered?.options && selectedInstance === '') {
    return undefined;
  }
  return (
    <div role='group' aria-label='Projection controls' className='flex max-w-full items-center gap-1'>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type='button'
            variant='overlay'
            size='sm'
            aria-label={`Projection view: ${offered?.title ?? `${selected} unavailable`}`}
            className='max-w-36 min-w-0 gap-1.5 rounded-full shadow-sm'
          >
            <Box aria-hidden='true' className='size-4 shrink-0' />
            <span className='truncate'>{offered?.title ?? `${selected} unavailable`}</span>
            <ChevronDown aria-hidden='true' className='size-3 shrink-0 text-muted-foreground' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align='start'
          side='bottom'
          className='w-48 max-w-[calc(100vw-1rem)] rounded-lg'
          aria-label='Pane view'
        >
          <DropdownMenuRadioGroup value={selected ?? ''} onValueChange={choose}>
            <DropdownMenuRadioItem value=''>Default ({evaluation.views[0]?.title ?? 'view'})</DropdownMenuRadioItem>
            {isUnavailable ? (
              <DropdownMenuRadioItem value={selected ?? ''} disabled>
                {selected} (unavailable)
              </DropdownMenuRadioItem>
            ) : null}
            {evaluation.views.map((view) => (
              <DropdownMenuRadioItem key={view.id} value={view.id}>
                {view.title}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {onOpenBeside && evaluation.views.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Open beside…</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {evaluation.views.map((view) => (
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
      {offered && (Boolean(offered.instances?.length) || selectedInstance !== '') ? (
        <select
          aria-label={`${offered.title} instance`}
          className='h-7 max-w-28 min-w-0 rounded border border-border bg-background px-1 text-xs text-foreground focus-visible:focus-outline'
          value={selectedInstance}
          onChange={(event) => {
            chooseInstance(event.target.value);
          }}
        >
          <option value=''>Whole view</option>
          {localForView && localForView.evaluationId !== evaluation.id ? (
            <option value={localForView.instanceId}>{localForView.instanceId} (expired)</option>
          ) : null}
          {offered.instances?.map((instance) => (
            <option key={instance.id} value={instance.id}>
              {instance.title}
            </option>
          ))}
        </select>
      ) : null}
      {offered?.options ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button size='icon-xs' variant='ghost' aria-label={`${offered.title} options`}>
              <SlidersHorizontal aria-hidden='true' className='size-4' />
            </Button>
          </PopoverTrigger>
          <PopoverContent align='end' className='w-64'>
            <fieldset className='flex flex-col gap-2'>
              <legend className='mb-2 text-sm font-medium'>{offered.title} options</legend>
              {Object.entries(schemaProperties).map(([key, property]) => {
                if (typeof property === 'boolean') {
                  return null;
                }
                const label = property.title ?? key;
                const value = values[key];
                if (property.type === 'boolean') {
                  return (
                    <label key={key} className='flex items-center gap-2 text-xs'>
                      <input
                        type='checkbox'
                        checked={value === true}
                        onChange={(event) => {
                          editOption(key, event.target.checked);
                        }}
                      />
                      {label}
                    </label>
                  );
                }
                if (property.enum) {
                  const choices = property.enum.filter(
                    (choice): choice is string | number | boolean =>
                      typeof choice === 'string' || typeof choice === 'number' || typeof choice === 'boolean',
                  );
                  return (
                    <label key={key} className='flex flex-col gap-1 text-xs'>
                      {label}
                      <select
                        className='h-7 rounded border border-input bg-background px-1'
                        value={
                          typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
                            ? String(value)
                            : ''
                        }
                        onChange={(event) => {
                          editOption(
                            key,
                            choices.find((choice) => String(choice) === event.target.value),
                          );
                        }}
                      >
                        <option value=''>Choose…</option>
                        {choices.map((choice) => (
                          <option key={String(choice)} value={String(choice)}>
                            {String(choice)}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }
                if (property.type === 'number' || property.type === 'integer' || property.type === 'string') {
                  return (
                    <label key={key} className='flex flex-col gap-1 text-xs'>
                      {label}
                      <input
                        type={property.type === 'string' ? 'text' : 'number'}
                        className='h-7 rounded border border-input bg-background px-2'
                        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
                        onChange={(event) => {
                          editOption(
                            key,
                            event.target.type === 'number'
                              ? event.target.value === ''
                                ? undefined
                                : Number(event.target.value)
                              : event.target.value,
                          );
                        }}
                      />
                    </label>
                  );
                }
                return (
                  <label key={key} className='flex flex-col gap-1 text-xs'>
                    {label} (JSON)
                    <textarea
                      className='min-h-16 rounded border border-input bg-background px-2'
                      defaultValue={value === undefined ? '' : JSON.stringify(value)}
                      onBlur={(event) => {
                        try {
                          editOption(
                            key,
                            event.target.value === '' ? undefined : (JSON.parse(event.target.value) as unknown),
                          );
                          setOptionError(undefined);
                        } catch {
                          setOptionError(`${label} must be valid JSON.`);
                        }
                      }}
                    />
                  </label>
                );
              })}
              {optionError ? (
                <p role='alert' className='text-xs text-destructive'>
                  {optionError}
                </p>
              ) : null}
              <Button
                size='sm'
                variant='outline'
                type='button'
                onClick={() => {
                  editViewState({ options: offered.options?.defaults ?? {} });
                }}
              >
                Restore view defaults
              </Button>
            </fieldset>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
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
