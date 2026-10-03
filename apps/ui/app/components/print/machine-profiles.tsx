import { useEffect, useMemo, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import type { MachineSettingsRecord } from '@taucad/types';
import { slicingPreferences } from '@taucad/slicer/preferences';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import type { MachineSettingsHandle } from '#components/print/use-machine-settings.js';
import type { BambuStudioMode } from '#components/print/use-bambu-studio.js';

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

/** The saved profile selector and its adjacent management menu. */
export function MachineProfiles({
  settings,
  studio,
}: {
  readonly settings: MachineSettingsHandle;
  readonly studio: BambuStudioMode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [confirmation, setConfirmation] = useState<'delete' | 'reset' | 'reset-all'>();
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
  const active = record?.profiles[activeId];
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
          disabled: Object.keys(profiles).length >= 16,
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
  const atLimit = saved.length >= 16;
  const validName = name.trim().length > 0 && name.trim().length <= 128;
  const choose = (value: string): void => {
    settings.updateRecord((current) => {
      if (!value.startsWith('starting:')) {
        return { ...current, activeProfile: value };
      }
      const process = studio.processes.find((preset) => `starting:${preset.name}` === value);
      if (!process || Object.keys(current.profiles).length >= 16) {
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
  const manage = (action: 'rename' | 'copy' | 'empty' | 'delete'): void => {
    if ((action === 'copy' || action === 'empty') && atLimit) {
      setMessage('Keep up to 16 profiles for each machine type.');
      return;
    }
    if (action !== 'delete' && !validName) {
      setMessage('Enter a profile name.');
      return;
    }
    settings.updateRecord((current) => {
      const profile = current.profiles[current.activeProfile]!;
      if (action === 'rename') {
        return {
          ...current,
          profiles: {
            ...current.profiles,
            [current.activeProfile]: { ...profile, name: name.trim() },
          },
        };
      }
      if (action === 'delete') {
        const remaining = Object.fromEntries(
          Object.entries(current.profiles).filter(([id]) => id !== current.activeProfile),
        );
        const replacement = replacementId(current.profiles, current.activeProfile);
        return replacement ? { ...current, activeProfile: replacement, profiles: remaining } : current;
      }
      const id = nextId(name, current.profiles);
      return {
        ...current,
        activeProfile: id,
        profiles: {
          ...current.profiles,
          [id]: {
            name: name.trim(),
            configurations: action === 'copy' ? structuredClone(profile.configurations) : {},
          },
        },
      };
    });
    setConfirmation(undefined);
    setMessage(undefined);
    if (action !== 'rename') {
      setOpen(false);
    }
  };
  const replacement = saved.find(({ value }) => value === replacementId(profiles, activeId));
  return (
    <div className='space-y-2' role='group' aria-label='Machine profiles'>
      <PrintSetupRow label='Profile'>
        <div className='flex min-w-0 flex-1 items-center'>
          <ParameterSelect
            label='Profile'
            value={activeId}
            groups={groups}
            isDisabled={settings.selectionBlocked}
            onChange={choose}
          />
          <Popover
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              setName(active?.name ?? 'Default');
              setConfirmation(undefined);
              setMessage(undefined);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type='button'
                size='xs'
                variant='ghost'
                className='ml-1 shrink-0'
                aria-label='Manage profiles'
                title='Manage profiles'
                disabled={settings.selectionBlocked}
              >
                <Ellipsis aria-hidden className='size-4' />
              </Button>
            </PopoverTrigger>
            <PopoverContent align='end' className='w-72 max-w-[calc(100vw-2rem)] space-y-3'>
              <h4 className='text-sm font-medium'>Manage “{active?.name ?? 'Default'}”</h4>
              <label className='block space-y-1 text-xs'>
                Profile name
                <Input
                  aria-label='Profile name'
                  value={name}
                  maxLength={128}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
              </label>
              <div className='flex flex-wrap gap-2'>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={!validName}
                  onClick={() => {
                    manage('rename');
                  }}
                >
                  Rename
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={!validName || atLimit}
                  onClick={() => {
                    manage('copy');
                  }}
                >
                  Save a copy
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={!validName || atLimit}
                  onClick={() => {
                    manage('empty');
                  }}
                >
                  New empty profile
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                Copies are independent. Empty profiles use the machine’s defaults until edited.
              </p>
              {message && (
                <p role='alert' className='text-xs'>
                  {message}
                </p>
              )}
              {atLimit && (
                <p className='text-xs text-muted-foreground'>Keep up to 16 profiles for each machine type.</p>
              )}
              {confirmation ? (
                <div className='space-y-2 border-t pt-3'>
                  <p className='text-sm'>
                    {confirmation === 'delete' ? (
                      <>
                        Delete “{active?.name}”? “{replacement?.label}” becomes active for this type.
                      </>
                    ) : confirmation === 'reset-all' ? (
                      <>
                        Reset all profiles for this machine type? Names, selection and unknown configuration sections
                        are retained.
                      </>
                    ) : (
                      <>
                        Reset “{active?.name ?? 'Default'}” to defaults? Other profiles and unknown configuration
                        sections are retained.
                      </>
                    )}
                  </p>
                  <div className='flex gap-2'>
                    <Button
                      size='sm'
                      variant='destructive'
                      onClick={() => {
                        if (confirmation === 'delete') {
                          manage('delete');
                        } else {
                          settings.reset(confirmation === 'reset-all');
                          setConfirmation(undefined);
                        }
                      }}
                    >
                      Confirm {confirmation === 'reset-all' ? 'reset all profiles' : confirmation}
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        setConfirmation(undefined);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className='flex flex-wrap gap-2'>
                  <Button
                    size='sm'
                    variant='ghost'
                    disabled={settings.pending > 0}
                    onClick={() => {
                      setConfirmation('reset');
                    }}
                  >
                    Reset to defaults
                  </Button>
                  <Button
                    size='sm'
                    variant='ghost'
                    disabled={settings.pending > 0}
                    onClick={() => {
                      setConfirmation('reset-all');
                    }}
                  >
                    Reset all profiles for this type
                  </Button>
                  <Button
                    size='sm'
                    variant='ghost'
                    disabled={!replacement || settings.pending > 0}
                    onClick={() => {
                      setConfirmation('delete');
                    }}
                  >
                    Delete profile
                  </Button>
                </div>
              )}
              {settings.pending > 0 && (
                <p className='text-xs text-muted-foreground'>Wait for pending saves before deleting.</p>
              )}
              {!replacement && <p className='text-xs text-muted-foreground'>Keep at least one profile.</p>}
            </PopoverContent>
          </Popover>
        </div>
      </PrintSetupRow>
      {settings.pending > 0 && (
        <p role='status' className='text-xs text-muted-foreground'>
          Saving changes…
        </p>
      )}
      {settings.error && (
        <div role='alert' className='space-y-2 rounded-md border p-2 text-sm'>
          <p>
            {settings.failure
              ? `Changes to “${profiles[settings.failure.profileId]?.name ?? settings.failure.profileId}” were not saved. `
              : ''}
            {settings.error}
          </p>
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
