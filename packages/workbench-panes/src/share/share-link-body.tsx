import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Loader } from '@taucad/ui/components/loader';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { PasswordInput } from '@taucad/ui/components/password-input';
import { useTickAnimation } from '@taucad/ui/hooks/use-tick-animation';
import type {
  ShareLinkContext,
  ShareLinkExtension,
  ShareLinkMethod,
  ShareLinkProtection,
} from '#share/share-source.js';
import { ShareNotice } from '#share/share-notice.jsx';
import { generateSharePassword } from '#share/share-password.js';

const noExtension = (): ShareLinkExtension => ({});

type ShareEncryption = NonNullable<ShareLinkMethod['encryption']>;

const passwordBytesOf = (password: string): number => new TextEncoder().encode(password.normalize('NFC')).byteLength;

const fitsPassword = (encryption: ShareEncryption, password: string): boolean => {
  const bytes = passwordBytesOf(password);
  return bytes >= encryption.minBytes && bytes <= encryption.maxBytes;
};

/**
 * The words under the password field: the rule while the password is short or fits, the fix once it is too long.
 * Validation counts UTF-8 bytes; the words say characters, which is what a person counts.
 *
 * @param encryption - The method's password bounds.
 * @param password - The password typed so far.
 * @returns One sentence.
 */
const passwordHelp = (encryption: ShareEncryption, password: string): string =>
  passwordBytesOf(password) > encryption.maxBytes
    ? 'This password is too long. Use a shorter one.'
    : `Use at least ${String(encryption.minBytes)} characters.`;

/**
 * One checkbox with its label and, when given, a line under the label that the checkbox is described by.
 *
 * @param props - The checkbox's id, label, optional description, value and where a change goes.
 * @returns The row.
 */
function ShareLinkCheckbox({
  id,
  label,
  description,
  isChecked,
  isLocked,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly description?: string | undefined;
  readonly isChecked: boolean;
  readonly isLocked: boolean;
  readonly onChange: (checked: boolean) => void;
}): React.JSX.Element {
  const descriptionId = useId();
  return (
    <div className='flex items-start gap-2'>
      <span className='flex h-lh shrink-0 items-center text-sm'>
        <Checkbox
          id={id}
          checked={isChecked}
          disabled={isLocked}
          aria-describedby={description === undefined ? undefined : descriptionId}
          onCheckedChange={(checked) => {
            onChange(checked === true);
          }}
        />
      </span>
      <div className='flex min-w-0 flex-col gap-1'>
        <Label htmlFor={id} className='font-normal pointer-coarse:min-h-6'>
          {label}
        </Label>
        {description === undefined ? null : (
          <p id={descriptionId} className='text-xs text-muted-foreground'>
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The password choice of a link method: whether to protect the link, the password with ways to make a new one and copy
 * it, and whether the link carries it. Once the link exists the choices are held, but the password can still be shown
 * and copied, because a link without it is no use until the password is sent too.
 *
 * @param props - The bounds, the current choices and where changes go.
 * @returns The fields.
 */
function ShareLinkEncryption({
  encryption,
  isEncrypted,
  password,
  shouldIncludePassword,
  isBusy,
  isLocked,
  onEncryptedChange,
  onPasswordChange,
  onGeneratePassword,
  onCopyPassword,
  onIncludePasswordChange,
}: {
  readonly encryption: ShareEncryption;
  readonly isEncrypted: boolean;
  readonly password: string;
  readonly shouldIncludePassword: boolean;
  readonly isBusy: boolean;
  readonly isLocked: boolean;
  readonly onEncryptedChange: (encrypted: boolean) => void;
  readonly onPasswordChange: (password: string) => void;
  readonly onGeneratePassword: () => void;
  readonly onCopyPassword: () => void;
  readonly onIncludePasswordChange: (includePassword: boolean) => void;
}): React.JSX.Element {
  const helpId = useId();
  return (
    <>
      <ShareLinkCheckbox
        id='portable-share-encrypted'
        label='Protect with a password'
        description={
          isEncrypted ? 'The project is encrypted on this device. People need the password to open it.' : undefined
        }
        isChecked={isEncrypted}
        isLocked={isLocked}
        onChange={onEncryptedChange}
      />
      {isEncrypted ? (
        <div className='ml-6 flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='portable-share-password'>Password</Label>
            <PasswordInput
              id='portable-share-password'
              autoComplete='new-password'
              value={password}
              disabled={isBusy}
              readOnly={isLocked}
              aria-invalid={password.length > 0 && !fitsPassword(encryption, password)}
              aria-describedby={helpId}
              onChange={(event) => {
                onPasswordChange(event.target.value);
              }}
            />
            <p id={helpId} className='text-xs text-muted-foreground'>
              {passwordHelp(encryption, password)}
            </p>
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={isLocked}
                aria-label='Generate a new password'
                onClick={onGeneratePassword}
              >
                <RefreshCw className='size-3.5' aria-hidden />
                <span>Generate</span>
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={isBusy || password.length === 0}
                onClick={onCopyPassword}
              >
                <Copy className='size-3.5' aria-hidden />
                <span>Copy password</span>
              </Button>
            </div>
          </div>
          <ShareLinkCheckbox
            id='portable-share-include-password'
            label='Include password in the link'
            description={
              shouldIncludePassword
                ? 'Anyone with the link can open the project.'
                : 'People need the link and the password. Send the password separately.'
            }
            isChecked={shouldIncludePassword}
            isLocked={isLocked}
            onChange={onIncludePasswordChange}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * The primary button's icon: a spinner while busy, the copy tick after a copy, else the method's own.
 *
 * @param props - Whether the body is busy, whether the tick is showing, and the method's icon.
 * @returns A spinner, a tick or the method's icon.
 */
function ShareLinkActionIcon({
  isBusy,
  isCopied,
  icon: Icon,
}: {
  readonly isBusy: boolean;
  readonly isCopied: boolean;
  readonly icon: ShareLinkMethod['action']['icon'];
}): React.JSX.Element {
  if (isBusy) {
    return <Loader className='size-4' />;
  }
  return isCopied ? <Check className='size-3.5' aria-hidden /> : <Icon className='size-3.5' aria-hidden />;
}

/**
 * A link method's on/off options, one checkbox each.
 *
 * @param props - The options, their values, whether they are locked, and where a change goes.
 * @returns The checkboxes.
 */
function ShareLinkOptions({
  options,
  values,
  isLocked,
  onChange,
}: {
  readonly options: NonNullable<ShareLinkMethod['options']>;
  readonly values: Readonly<Record<string, boolean>>;
  readonly isLocked: boolean;
  readonly onChange: (id: string, value: boolean) => void;
}): React.JSX.Element {
  return (
    <>
      {options.map((option) => (
        <ShareLinkCheckbox
          key={option.id}
          id={`portable-share-${option.id}`}
          label={option.label}
          description={option.description}
          isChecked={values[option.id] === true}
          isLocked={isLocked}
          onChange={(checked) => {
            onChange(option.id, checked);
          }}
        />
      ))}
    </>
  );
}

/**
 * The body's primary action: the button that shares, or what the extension puts in its place.
 *
 * @param props - The extension's replacement, the button's state, its icon and label, and the share it runs.
 * @returns The button or the replacement element.
 */
function ShareLinkPrimary({
  primary,
  buttonRef,
  isBusy,
  isCopied,
  isDisabled,
  icon,
  label,
  onShare,
}: {
  readonly primary: ShareLinkExtension['primary'];
  readonly buttonRef: React.Ref<HTMLButtonElement>;
  readonly isBusy: boolean;
  readonly isCopied: boolean;
  readonly isDisabled: boolean;
  readonly icon: ShareLinkMethod['action']['icon'];
  readonly label: string;
  readonly onShare: () => void;
}): React.ReactNode {
  if (primary !== undefined && 'element' in primary) {
    return primary.element;
  }
  return (
    <Button
      ref={buttonRef}
      type='button'
      disabled={isDisabled}
      aria-busy={isBusy}
      onClick={primary?.onActivate ?? onShare}
    >
      <ShareLinkActionIcon isBusy={isBusy} isCopied={isCopied} icon={icon} />
      <span>{primary?.label ?? label}</span>
    </Button>
  );
}

/**
 * The link once it exists, in a read-only field that selects itself, and a reminder when the password is not in it.
 *
 * @param props - The field's ref, the link, and whether the link leaves the password out.
 * @returns The field and, when the password is left out, the reminder.
 */
function ShareLinkResult({
  linkRef,
  shareUrl,
  isPasswordLeftOut,
}: {
  readonly linkRef: React.Ref<HTMLInputElement>;
  readonly shareUrl: string;
  readonly isPasswordLeftOut: boolean;
}): React.JSX.Element {
  return (
    <>
      <Input
        ref={linkRef}
        aria-label='Share link'
        readOnly
        value={shareUrl}
        onFocus={(event) => {
          event.target.select();
        }}
      />
      {isPasswordLeftOut ? (
        <ShareNotice tone='info'>This link doesn’t include the password. Send the password separately.</ShareNotice>
      ) : null}
    </>
  );
}

const clipboardDenied = "Couldn't copy the link. Select it above and copy it.";
const passwordClipboardDenied = "Couldn't copy the password. Show it, then select it and copy it.";
const shareFailed = "Couldn't create the link. Try again.";

/**
 * The body of a link method: its password and other options, any callouts its extension adds, the link once made, and
 * the button that makes the link, copies it and confirms the copy with a tick. The first press makes and copies the
 * link; later presses copy it, and the options are held once it exists.
 *
 * @param props - The method, how a copy is announced, and where the body reports that it is busy.
 * @returns The choices, callouts, link field, notices and action row.
 */
export function ShareLinkBody({
  method,
  notify,
  onBusyChange,
}: {
  readonly method: ShareLinkMethod;
  readonly notify: ((message: string) => void) | undefined;
  readonly onBusyChange: (busy: boolean) => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [operationError, setError] = useState<string>();
  const [shareUrl, setShareUrl] = useState<string>();
  const [warning, setWarning] = useState<string>();
  const [encrypted, setEncrypted] = useState(false);
  const [password, setPassword] = useState('');
  const [includePassword, setIncludePassword] = useState(true);
  const [options, setOptions] = useState<Readonly<Record<string, boolean>>>({});
  const operationRef = useRef<AbortController | undefined>(undefined);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  /* Set when the clipboard refused the link, so the field it now shows takes focus with the link selected. */
  const [shouldSelectLink, setShouldSelectLink] = useState(false);
  const { ticked: copied, trigger: triggerCopiedTick } = useTickAnimation();

  const reset = useCallback((): void => {
    setShareUrl(undefined);
    setWarning(undefined);
    setError(undefined);
  }, []);
  const focusPrimary = useCallback((): void => {
    primaryRef.current?.focus();
  }, []);
  const context = useMemo(
    (): ShareLinkContext => ({
      busy,
      setBusy,
      setError,
      shareUrl,
      setShareUrl,
      reset,
      focusPrimary,
    }),
    [busy, focusPrimary, reset, shareUrl],
  );
  /* The method's hook runs once per body; the pane keys the body by method, so the hook's identity never changes here. */
  const useExtension = method.useExtension ?? noExtension;
  const extension = useExtension(context);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(
    () => () => {
      operationRef.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (shouldSelectLink && shareUrl !== undefined) {
      linkRef.current?.focus();
      linkRef.current?.select();
      setShouldSelectLink(false);
    }
  }, [shareUrl, shouldSelectLink]);

  /* The copy starts inside the press, before any await, so Safari still counts it as the person's gesture. */
  const copyPassword = async (): Promise<void> => {
    const copying = navigator.clipboard.writeText(password);
    setError(undefined);
    try {
      await copying;
      notify?.('Password copied');
    } catch {
      setError(passwordClipboardDenied);
    }
  };

  /* Turning protection on offers a strong password; one the person typed is kept. */
  const changeProtection = (next: boolean): void => {
    setEncrypted(next);
    if (next && password === '' && method.encryption !== undefined) {
      setPassword(generateSharePassword(method.encryption));
    }
  };

  const refuseCopy = (): void => {
    setError(clipboardDenied);
    setShouldSelectLink(true);
  };

  const share = async (): Promise<void> => {
    const controller = new AbortController();
    operationRef.current?.abort();
    operationRef.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      if (shareUrl) {
        try {
          await navigator.clipboard.writeText(shareUrl);
          triggerCopiedTick();
          notify?.('Link copied');
        } catch {
          refuseCopy();
        }
        return;
      }
      const protection: ShareLinkProtection = encrypted
        ? { kind: 'password', password, includePassword }
        : { kind: 'none' };
      const outcome = await (extension.share ?? method.share)({
        protection,
        options,
        signal: controller.signal,
      });
      setWarning(outcome.warning);
      if ('error' in outcome) {
        setError(outcome.error);
        return;
      }
      setShareUrl(outcome.url);
      try {
        await navigator.clipboard.writeText(outcome.url);
        triggerCopiedTick();
        notify?.('Link copied');
      } catch {
        refuseCopy();
      }
    } catch {
      setError(shareFailed);
    } finally {
      if (operationRef.current === controller) {
        operationRef.current = undefined;
      }
      setBusy(false);
    }
  };

  const { encryption } = method;
  const passwordValid = !encrypted || encryption === undefined || fitsPassword(encryption, password);
  const hasChoices = encryption !== undefined || (method.options?.length ?? 0) > 0;
  const isLocked = busy || Boolean(shareUrl);
  const error = operationError ?? extension.error;

  return (
    <div className='flex flex-col gap-4'>
      {hasChoices ? (
        <div className='flex flex-col gap-4'>
          {encryption ? (
            <ShareLinkEncryption
              encryption={encryption}
              isEncrypted={encrypted}
              password={password}
              shouldIncludePassword={includePassword}
              isBusy={busy}
              isLocked={isLocked}
              onEncryptedChange={changeProtection}
              onPasswordChange={setPassword}
              onGeneratePassword={() => {
                setPassword(generateSharePassword(encryption));
              }}
              onCopyPassword={() => {
                void copyPassword();
              }}
              onIncludePasswordChange={setIncludePassword}
            />
          ) : null}
          {method.options === undefined ? null : (
            <ShareLinkOptions
              options={method.options}
              values={options}
              isLocked={isLocked}
              onChange={(id, value) => {
                setOptions((current) => ({ ...current, [id]: value }));
              }}
            />
          )}
        </div>
      ) : null}
      {extension.callouts}
      {shareUrl ? (
        <ShareLinkResult linkRef={linkRef} shareUrl={shareUrl} isPasswordLeftOut={encrypted && !includePassword} />
      ) : null}
      {warning ? <ShareNotice tone='warning'>{warning}</ShareNotice> : null}
      {error ? <ShareNotice tone='error'>{error}</ShareNotice> : null}
      <div className='flex flex-wrap justify-end gap-2'>
        {extension.actions}
        <ShareLinkPrimary
          primary={extension.primary}
          buttonRef={primaryRef}
          isBusy={busy}
          isCopied={copied}
          isDisabled={busy || !passwordValid || extension.isPending === true}
          icon={method.action.icon}
          label={shareUrl ? 'Copy link' : method.action.label}
          onShare={() => {
            void share();
          }}
        />
      </div>
    </div>
  );
}
