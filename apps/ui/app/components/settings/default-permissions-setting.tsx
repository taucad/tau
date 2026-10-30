import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@taucad/ui/components/button';
import { RadioGroup, RadioGroupItem } from '@taucad/ui/components/radio-group';
import {
  bypassConfirmation,
  permissionModeAnnouncement,
  permissionModeOptions,
  promptInjectionDisclosure,
} from '#components/chat/permission-mode-copy.js';
import { toast } from '#components/ui/sonner.js';
import type { PermissionMode } from '#filesystem/desktop-permissions.js';
import { useDefaultPermissionMode } from '#hooks/use-permission-mode.js';

/**
 * Settings → Agents → Default permissions (blueprint D19, RQ2a, RQ4): the mode new desktop chats copy when they are
 * created. Existing chats keep their own. Choosing Bypass draws the RQ2 confirmation in place, Cancel focused, because
 * a dialog inside the Settings dialog is not allowed; Escape or Cancel keeps Ask and focus returns to the checked
 * radio. The prompt-injection disclosure sits under the choice.
 *
 * @public
 */
export function DefaultPermissionsSetting(): React.JSX.Element | undefined {
  const { mode, setMode, isSaving } = useDefaultPermissionMode();
  const [isConfirming, setIsConfirming] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const radios = useRef(new Map<PermissionMode, HTMLButtonElement>());
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const disclosureId = useId();

  useEffect(() => {
    if (isConfirming) {
      cancelRef.current?.focus();
    }
  }, [isConfirming]);
  /* The radios are always mounted, so focus can return to one before the confirmation unmounts. */
  const focusRadio = (target: PermissionMode): void => {
    radios.current.get(target)?.focus();
  };

  if (mode === undefined) {
    return undefined;
  }

  const apply = async (next: PermissionMode, confirmed: boolean): Promise<void> => {
    try {
      const applied = await setMode(next, confirmed);
      setAnnouncement(permissionModeAnnouncement(applied, 'default'));
      focusRadio(applied);
    } catch {
      toast.error('Tau could not change the default permissions.');
      focusRadio(mode);
    }
  };

  const cancel = (): void => {
    focusRadio(mode);
    setIsConfirming(false);
  };

  return (
    <div className='flex flex-col gap-3 py-3.5'>
      <div className='flex flex-col gap-0.5'>
        <span className='text-sm font-medium' id={titleId}>
          Default permissions
        </span>
        <span className='text-xs text-muted-foreground'>For new chats. Existing chats keep their own.</span>
      </div>
      <RadioGroup
        aria-labelledby={titleId}
        aria-describedby={disclosureId}
        className='gap-2.5'
        value={mode}
        disabled={isSaving}
        onValueChange={(value) => {
          const next = value as PermissionMode;
          if (next === mode) {
            return;
          }
          if (next === 'bypass') {
            setIsConfirming(true);
            return;
          }
          void apply(next, false);
        }}
      >
        {permissionModeOptions.map((option) => {
          const id = `default-permissions-${option.value}`;
          return (
            <label key={option.value} htmlFor={id} className='flex cursor-action items-start gap-3'>
              <RadioGroupItem
                id={id}
                value={option.value}
                className='mt-0.5'
                ref={(element) => {
                  if (element === null) {
                    radios.current.delete(option.value);
                  } else {
                    radios.current.set(option.value, element);
                  }
                }}
              />
              <span className='flex flex-col gap-0.5'>
                <span className='text-sm'>{option.name}</span>
                <span className='text-xs text-muted-foreground'>{option.description}</span>
              </span>
            </label>
          );
        })}
      </RadioGroup>
      <p className='text-xs text-muted-foreground' id={disclosureId}>
        {promptInjectionDisclosure}
      </p>
      {isConfirming ? (
        <div
          role='group'
          aria-labelledby={`${titleId}-confirm`}
          aria-describedby={bodyId}
          className='flex flex-col gap-3 rounded-md border border-warning/40 p-3'
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              /* Keep the Settings dialog open: Escape here only backs out of Bypass. */
              event.stopPropagation();
              event.preventDefault();
              cancel();
            }
          }}
        >
          <span className='text-sm font-medium' id={`${titleId}-confirm`}>
            {bypassConfirmation.title}
          </span>
          <span className='text-xs text-muted-foreground' id={bodyId}>
            {bypassConfirmation.body}
          </span>
          <div className='flex justify-end gap-2'>
            <Button
              ref={cancelRef}
              type='button'
              variant='outline'
              size='sm'
              title={bypassConfirmation.cancelDescription}
              onClick={cancel}
            >
              {bypassConfirmation.cancel}
            </Button>
            <Button
              type='button'
              size='sm'
              title={bypassConfirmation.confirmDefault}
              onClick={() => {
                setIsConfirming(false);
                void apply('bypass', true);
              }}
            >
              {bypassConfirmation.confirm}
            </Button>
          </div>
        </div>
      ) : null}
      <span role='status' aria-live='polite' className='sr-only'>
        {announcement}
      </span>
    </div>
  );
}
