import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Ellipsis, ListRestart, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { Button, buttonVariants } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import type { MachineSettingsRecord } from '@taucad/types';
import { slicingPreferences } from '@taucad/slicer/preferences';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import type { MachineSettingsHandle } from '#components/print/use-machine-settings.js';
import type { BambuStudioMode } from '#components/print/use-bambu-studio.js';
import { NamePopover } from '#components/revisions/name-popover.js';
import type { NameFormCopy } from '#components/revisions/name-popover.js';

const slug = (name: string): string =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-|-$/gu, '')
    .slice(0, 48) || 'profile';
const nextId = (name: string, existing: Readonly<Record<string, unknown>>): string => {
  const base = slug(name);
  let id = base;
  for (let index = 2; Object.hasOwn(existing, id); index += 1) {
    id = `${base}-${index}`;
  }
  return id;
};

const replacementId = (profiles: MachineSettingsRecord['profiles'], activeId: string): string | undefined =>
  activeId !== 'default' && profiles['default'] ? 'default' : Object.keys(profiles).find((id) => id !== activeId);

const profileLimit = 16;
const nameLimit = 128;

/** A verb that names a profile, in the naming form every revision surface uses. */
type Naming = 'rename' | 'copy' | 'empty';
/** A verb that loses settings, confirmed with the profile named. */
type Confirmation = 'reset' | 'reset-all' | 'delete';

const namingCopy = (naming: Naming, name: string): NameFormCopy =>
  ({
    rename: {
      label: `New name for ${name}`,
      placeholder: name,
      initial: name,
      note: 'Its settings stay as they are.',
      saveLabel: 'Rename profile',
    },
    copy: {
      label: `Name for the copy of ${name}`,
      placeholder: `${name} copy`,
      initial: `${name} copy`,
      note: 'The copy starts with these settings; changing one leaves the other as it is.',
      saveLabel: 'Duplicate profile',
    },
    empty: {
      label: 'Name for the new profile',
      placeholder: 'New profile',
      note: 'It uses the printer’s defaults until you change a setting.',
      saveLabel: 'Create profile',
    },
  })[naming];

const confirmationCopy = (
  confirmation: Confirmation,
  name: string,
  replacement: string | undefined,
): Readonly<{ title: string; description: string; action: string }> =>
  ({
    reset: {
      title: `Reset “${name}” to defaults?`,
      description:
        'Its print settings return to the printer’s defaults. Other profiles, and settings Tau does not recognise, stay as they are.',
      action: 'Reset profile',
    },
    'reset-all': {
      title: 'Reset all profiles for this printer type?',
      description:
        'Every profile’s print settings return to the printer’s defaults. Names, the chosen profile and settings Tau does not recognise stay as they are.',
      action: 'Reset all profiles',
    },
    delete: {
      title: `Delete “${name}”?`,
      description: `“${replacement ?? ''}” becomes the profile for printers of this type.`,
      action: 'Delete profile',
    },
  })[confirmation];

/**
 * A verb in the profile menu; an unavailable one stays in place and says why (DESIGN, explain unavailable
 * actions), as the composer's attach item does.
 *
 * @param properties - The glyph, the verb, why it is unavailable (if it is) and what choosing it does.
 * @returns The menu item.
 */
function ProfileVerb({
  icon: Icon,
  label,
  reason,
  variant,
  onSelect,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly reason?: string;
  readonly variant?: 'destructive';
  readonly onSelect: () => void;
}): React.JSX.Element {
  return reason === undefined ? (
    <DropdownMenuItem variant={variant} onSelect={onSelect}>
      <Icon aria-hidden />
      {label}
    </DropdownMenuItem>
  ) : (
    <DropdownMenuItem disabled variant={variant} className='h-auto items-start'>
      <Icon aria-hidden className='mt-0.5' />
      <span className='flex flex-col'>
        {label}
        <span className='text-xs text-muted-foreground'>{reason}</span>
      </span>
    </DropdownMenuItem>
  );
}

/**
 * The Profile row's More: each verb with its glyph, as a revision branch's More is. Naming verbs open the
 * shared naming form under the menu's button; verbs that lose settings confirm with the profile named.
 *
 * @param properties - The settings handle, the saved profiles and the active one.
 * @returns The menu, its naming form and its confirmation.
 */
function ProfileMenu({
  settings,
  profiles,
  activeId,
}: {
  readonly settings: MachineSettingsHandle;
  readonly profiles: MachineSettingsRecord['profiles'];
  readonly activeId: string;
}): React.JSX.Element {
  const moreRef = useRef<HTMLButtonElement>(null);
  // The chosen verb opens its form or confirmation once the menu has handed focus back to its button.
  const chosen = useRef<Naming | Confirmation>(undefined);
  // The last verb stays while its surface closes, so the closing form or dialog keeps its words.
  const [naming, setNaming] = useState<Naming>('rename');
  const [isNaming, setIsNaming] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>('reset');
  const [isConfirming, setIsConfirming] = useState(false);
  const name = profiles[activeId]?.name ?? 'Default';
  const replacement = replacementId(profiles, activeId);
  const isAtLimit = Object.keys(profiles).length >= profileLimit;
  const savingReason = settings.pending > 0 ? 'Wait for changes to save' : undefined;
  const limitReason = isAtLimit ? `Keep up to ${profileLimit} profiles for each printer type` : undefined;
  const choose = (verb: Naming | Confirmation) => () => {
    chosen.current = verb;
  };
  const saveName = (next: string): void => {
    if (next.length > nameLimit) {
      throw new Error(`Use ${nameLimit} characters or fewer.`);
    }
    if (naming === 'rename' && next === name) {
      return;
    }
    settings.updateRecord((current) => {
      const profile = current.profiles[current.activeProfile]!;
      if (naming === 'rename') {
        return { ...current, profiles: { ...current.profiles, [current.activeProfile]: { ...profile, name: next } } };
      }
      if (Object.keys(current.profiles).length >= profileLimit) {
        return current;
      }
      const id = nextId(next, current.profiles);
      return {
        ...current,
        activeProfile: id,
        profiles: {
          ...current.profiles,
          [id]: { name: next, configurations: naming === 'copy' ? structuredClone(profile.configurations) : {} },
        },
      };
    });
  };
  const confirm = (): void => {
    if (confirmation !== 'delete') {
      settings.reset(confirmation === 'reset-all');
      return;
    }
    settings.updateRecord((current) => {
      const next = replacementId(current.profiles, current.activeProfile);
      return next === undefined
        ? current
        : {
            ...current,
            activeProfile: next,
            profiles: Object.fromEntries(
              Object.entries(current.profiles).filter(([id]) => id !== current.activeProfile),
            ),
          };
    });
  };
  const words = confirmationCopy(
    confirmation,
    name,
    replacement === undefined ? undefined : profiles[replacement]?.name,
  );
  return (
    <>
      <DropdownMenu>
        <NamePopover
          anchor={
            <DropdownMenuTrigger asChild>
              <Button
                ref={moreRef}
                type='button'
                size='icon-xs'
                variant='ghost'
                className='shrink-0'
                aria-label='Manage profiles'
                title='Manage profiles'
                disabled={settings.selectionBlocked}
              >
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
          }
          isOpen={isNaming}
          returnFocus={moreRef}
          align='end'
          {...namingCopy(naming, name)}
          onOpenChange={setIsNaming}
          onSave={saveName}
        />
        <DropdownMenuContent
          align='end'
          onCloseAutoFocus={(event) => {
            const verb = chosen.current;
            if (verb === undefined) {
              return;
            }
            chosen.current = undefined;
            event.preventDefault();
            if (verb === 'rename' || verb === 'copy' || verb === 'empty') {
              setNaming(verb);
              setIsNaming(true);
            } else {
              setConfirmation(verb);
              setIsConfirming(true);
            }
          }}
        >
          <ProfileVerb icon={Pencil} label='Rename profile…' onSelect={choose('rename')} />
          <ProfileVerb icon={Copy} label='Duplicate profile…' reason={limitReason} onSelect={choose('copy')} />
          <ProfileVerb icon={Plus} label='New empty profile…' reason={limitReason} onSelect={choose('empty')} />
          <DropdownMenuSeparator />
          <ProfileVerb icon={RotateCcw} label='Reset to defaults…' reason={savingReason} onSelect={choose('reset')} />
          <ProfileVerb
            icon={ListRestart}
            label='Reset all profiles…'
            reason={savingReason}
            onSelect={choose('reset-all')}
          />
          <DropdownMenuSeparator />
          <ProfileVerb
            icon={Trash2}
            label='Delete profile…'
            variant='destructive'
            reason={replacement === undefined ? 'Keep at least one profile' : savingReason}
            onSelect={choose('delete')}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            moreRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{words.title}</AlertDialogTitle>
            <AlertDialogDescription>{words.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={confirm}>
              {words.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** The saved profile selector and its adjacent management menu. */
export function MachineProfiles({
  settings,
  studio,
}: {
  readonly settings: MachineSettingsHandle;
  readonly studio: BambuStudioMode;
}): React.JSX.Element {
  const [message, setMessage] = useState<string>();
  const printer = studio.selection?.printer;
  const qualified = useMemo(() => {
    const profiles: Record<string, NonNullable<MachineSettingsRecord['profiles'][string]>> = {
      default: { name: 'Default', configurations: {} },
    };
    for (const process of [0.12, 0.28].flatMap((height) => {
      const preset = studio.processes.find((candidate) => candidate.layerHeight === height);
      return preset ? [preset] : [];
    })) {
      const label = process.name.replace(/ @.*$/u, '');
      const id = nextId(label, profiles);
      profiles[id] = {
        name: label,
        configurations: {
          [slicingPreferences.manifest.source.id]: {
            version: slicingPreferences.manifest.source.version,
            values: {
              process: process.name,
              ...(printer ? { printer } : {}),
            },
          },
        },
      };
    }
    return profiles;
  }, [studio.processes, printer]);
  // Starting profiles stand in only while no saved settings file exists.
  useEffect(() => {
    if (settings.file.status === 'absent') {
      settings.startingProfiles(qualified);
    }
  }, [qualified, settings.startingProfiles, settings.file.status]);
  const { record } = settings;
  const activeId = record?.activeProfile ?? 'default';
  const profiles = record?.profiles ?? {
    default: { name: 'Default', configurations: {} },
  };
  const saved = Object.entries(profiles).flatMap(([id, profile]) =>
    profile ? [{ value: id, label: profile.name }] : [],
  );
  const starting = useMemo(
    () =>
      studio.processes
        .filter(
          (process) =>
            !Object.values(profiles).some(
              (profile) =>
                profile?.configurations[slicingPreferences.manifest.source.id]?.values['process'] === process.name,
            ),
        )
        .slice(0, 15)
        .map((process) => ({
          value: `starting:${process.name}`,
          label: process.name.replace(/ @.*$/u, ''),
          disabled: Object.keys(profiles).length >= profileLimit,
        })),
    [studio.processes, profiles],
  );
  const groups =
    starting.length > 0
      ? [
          {
            label: settings.file.status === 'absent' ? 'Starting profiles' : 'Saved profiles',
            options: saved,
          },
          { label: 'Starting profiles', options: starting },
        ]
      : [{ options: saved }];
  const choose = (value: string): void => {
    settings.updateRecord((current) => {
      if (!value.startsWith('starting:')) {
        return { ...current, activeProfile: value };
      }
      const process = studio.processes.find((preset) => `starting:${preset.name}` === value);
      if (!process || Object.keys(current.profiles).length >= profileLimit) {
        return current;
      }
      const label = process.name.replace(/ @.*$/u, '');
      const id = nextId(label, current.profiles);
      return {
        ...current,
        activeProfile: id,
        profiles: {
          ...current.profiles,
          [id]: {
            name: label,
            configurations: {
              [slicingPreferences.manifest.source.id]: {
                version: slicingPreferences.manifest.source.version,
                values: {
                  process: process.name,
                  ...(printer ? { printer } : {}),
                },
              },
            },
          },
        },
      };
    });
  };
  return (
    <div className='space-y-2' role='group' aria-label='Machine profiles'>
      <PrintSetupRow label='Profile'>
        <div className='flex min-w-0 flex-1 items-center gap-1'>
          <ParameterSelect
            label='Profile'
            value={activeId}
            groups={groups}
            isDisabled={settings.selectionBlocked}
            onChange={choose}
          />
          <ProfileMenu settings={settings} profiles={profiles} activeId={activeId} />
        </div>
      </PrintSetupRow>
      {settings.pending > 0 && (
        <p role='status' className='text-xs text-muted-foreground'>
          Saving changes…
        </p>
      )}
      {settings.error && (
        <div
          role='alert'
          className='flex min-w-0 flex-col items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-2 text-xs'
        >
          <p>
            {settings.failure
              ? `Changes to “${profiles[settings.failure.profileId]?.name ?? settings.failure.profileId}” were not saved. `
              : ''}
            {settings.error}
          </p>
          {(settings.file.status === 'unavailable' ||
            settings.observation?.status === 'closed' ||
            settings.observation?.status === 'error') && (
            <Button
              size='xs'
              variant='outline'
              aria-label='Retry settings updates'
              onClick={async () => {
                try {
                  await settings.retry();
                } catch (error) {
                  setMessage(String(error));
                }
              }}
            >
              Retry updates
            </Button>
          )}
          {settings.failure?.result.status === 'uncertain' ? (
            <Button
              size='xs'
              variant='outline'
              onClick={async () => {
                try {
                  await settings.checkSave();
                } catch (error) {
                  setMessage(String(error));
                }
              }}
            >
              Check save
            </Button>
          ) : settings.failure ? (
            <Button
              size='xs'
              variant='outline'
              onClick={async () => {
                try {
                  await settings.useLatest();
                } catch (error) {
                  setMessage(String(error));
                }
              }}
            >
              Use latest saved settings
            </Button>
          ) : null}
          {message && <p>{message}</p>}
        </div>
      )}
    </div>
  );
}
