import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Loader } from '@taucad/ui/components/loader';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { PasswordInput } from '@taucad/ui/components/password-input';
import { useTickAnimation } from '@taucad/ui/hooks/use-tick-animation';
import { copyText } from '@taucad/ui/utils/clipboard';
import type { CopyTextOutcome } from '@taucad/ui/utils/clipboard';
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
 * The link once it exists, in a read-only field that selects itself; what to do when the clipboard refused it; and a
 * reminder when the password is not in it.
 *
 * @param props - The field's ref, the link, whether the link leaves the password out and whether the copy was refused.
 * @returns The field and the notes that apply.
 */
function ShareLinkResult({
  linkRef,
  shareUrl,
  isPasswordLeftOut,
  isCopyRefused,
}: {
  readonly linkRef: React.Ref<HTMLInputElement>;
  readonly shareUrl: string;
  readonly isPasswordLeftOut: boolean;
  readonly isCopyRefused: boolean;
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
      {isCopyRefused ? <ShareNotice tone='info'>Select the link and copy it.</ShareNotice> : null}
      {isPasswordLeftOut ? (
        <ShareNotice tone='info'>This link doesn’t include the password. Send the password separately.</ShareNotice>
      ) : null}
    </>
  );
}

const passwordClipboardDenied = "Couldn't copy the password. Show it, then select it and copy it.";
const shareFailed = "Couldn't create the link. Try again.";

/** A share that answered why there is no link; its sentence is the one the body shows. */
class ShareRefusal extends Error {}

/**
 * The body of a link method: its password and other options, any callouts its extension adds, the link once made, and
 * the button that makes the link, copies it and confirms the copy with a tick. The copy starts inside the press, while
 * the link is still being made (`copyText`), so no browser refuses it for lack of a gesture; when the clipboard still
 * refuses, the link is shown selected for the person to copy. A method that remakes its link makes a fresh one on every
 * press and never holds its options; any other makes the link once, copies it on later presses and holds its options.
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
  const [isCopyRefused, setIsCopyRefused] = useState(false);
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
    const copying = copyText(password);
    setError(undefined);
    const { isCopied } = await copying;
    if (isCopied) {
      notify?.('Password copied');
    } else {
      setError(passwordClipboardDenied);
    }
  };

  const remakesLink = method.shouldRemakeLink === true;
  /* A link the next press copies as it is, rather than making a new one. */
  const holdsLink = shareUrl !== undefined && !remakesLink;
  /* A link that remakes itself is stale once a choice changes, so the field that showed it goes. */
  const choose = (change: () => void): void => {
    change();
    if (remakesLink) {
      setShareUrl(undefined);
      setWarning(undefined);
      setIsCopyRefused(false);
    }
  };

  /* Turning protection on offers a strong password; one the person typed is kept. */
  const changeProtection = (next: boolean): void => {
    choose(() => {
      setEncrypted(next);
      if (next && password === '' && method.encryption !== undefined) {
        setPassword(generateSharePassword(method.encryption));
      }
    });
  };

  /**
   * Makes the link the press asked for, telling the body what it answered as it arrives.
   *
   * @param signal - Aborted when the body goes away or another press starts.
   * @returns The link; a share that answered why there is none rejects with that sentence.
   */
  const makeLink = async (signal: AbortSignal): Promise<string> => {
    const protection: ShareLinkProtection = encrypted
      ? { kind: 'password', password, includePassword }
      : { kind: 'none' };
    const outcome = await (extension.share ?? method.share)({ protection, options, signal });
    setWarning(outcome.warning);
    if ('error' in outcome) {
      throw new ShareRefusal(outcome.error);
    }
    setShareUrl(outcome.url);
    return outcome.url;
  };

  const finishCopy = async (copying: Promise<CopyTextOutcome>, controller?: AbortController): Promise<void> => {
    try {
      const { isCopied } = await copying;
      if (isCopied) {
        triggerCopiedTick();
        notify?.('Link copied');
      } else {
        setIsCopyRefused(true);
        setShouldSelectLink(true);
      }
    } catch (error) {
      setError(error instanceof ShareRefusal ? error.message : shareFailed);
    } finally {
      if (controller !== undefined && operationRef.current === controller) {
        operationRef.current = undefined;
        setBusy(false);
      }
    }
  };

  /* Synchronous to the press: `copyText` is handed the link, or the promise of it, before anything is awaited. */
  const share = (): void => {
    setError(undefined);
    setIsCopyRefused(false);
    if (holdsLink) {
      void finishCopy(copyText(shareUrl));
      return;
    }
    const controller = new AbortController();
    operationRef.current?.abort();
    operationRef.current = controller;
    setShareUrl(undefined);
    setWarning(undefined);
    setBusy(true);
    void finishCopy(copyText(makeLink(controller.signal)), controller);
  };

  const { encryption } = method;
  const passwordValid = !encrypted || encryption === undefined || fitsPassword(encryption, password);
  const hasChoices = encryption !== undefined || (method.options?.length ?? 0) > 0;
  const isLocked = busy || holdsLink;
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
              onPasswordChange={(next) => {
                choose(() => {
                  setPassword(next);
                });
              }}
              onGeneratePassword={() => {
                choose(() => {
                  setPassword(generateSharePassword(encryption));
                });
              }}
              onCopyPassword={() => {
                void copyPassword();
              }}
              onIncludePasswordChange={(next) => {
                choose(() => {
                  setIncludePassword(next);
                });
              }}
            />
          ) : null}
          {method.options === undefined ? null : (
            <ShareLinkOptions
              options={method.options}
              values={options}
              isLocked={isLocked}
              onChange={(id, value) => {
                choose(() => {
                  setOptions((current) => ({ ...current, [id]: value }));
                });
              }}
            />
          )}
        </div>
      ) : null}
      {extension.callouts}
      {shareUrl ? (
        <ShareLinkResult
          linkRef={linkRef}
          shareUrl={shareUrl}
          isPasswordLeftOut={encrypted && !includePassword}
          isCopyRefused={isCopyRefused}
        />
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
          label={holdsLink ? 'Copy link' : method.action.label}
          onShare={share}
        />
      </div>
    </div>
  );
}
