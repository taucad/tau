import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { useTickAnimation } from '@taucad/ui/hooks/use-tick-animation';
import type {
  ShareLinkContext,
  ShareLinkExtension,
  ShareLinkMethod,
  ShareLinkProtection,
} from '#share/share-source.js';

const noExtension = (): ShareLinkExtension => ({});

type ShareEncryption = NonNullable<ShareLinkMethod['encryption']>;

const passwordBytesOf = (password: string): number => new TextEncoder().encode(password.normalize('NFC')).byteLength;

const fitsPassword = (encryption: ShareEncryption, password: string): boolean => {
  const bytes = passwordBytesOf(password);
  return bytes >= encryption.minBytes && bytes <= encryption.maxBytes;
};

/**
 * The password choice of a link method: whether to encrypt, the password and its byte count, and whether the link
 * carries it.
 *
 * @param props - The bounds, the current choices and where changes go.
 * @returns The fields.
 */
function ShareLinkEncryption({
  encryption,
  isEncrypted,
  password,
  shouldIncludePassword,
  isLocked,
  onEncryptedChange,
  onPasswordChange,
  onIncludePasswordChange,
}: {
  readonly encryption: ShareEncryption;
  readonly isEncrypted: boolean;
  readonly password: string;
  readonly shouldIncludePassword: boolean;
  readonly isLocked: boolean;
  readonly onEncryptedChange: (encrypted: boolean) => void;
  readonly onPasswordChange: (password: string) => void;
  readonly onIncludePasswordChange: (includePassword: boolean) => void;
}): React.JSX.Element {
  const passwordBytes = passwordBytesOf(password);
  return (
    <>
      <div className='flex items-start gap-2'>
        <Checkbox
          id='portable-share-encrypted'
          checked={isEncrypted}
          disabled={isLocked}
          onCheckedChange={(checked) => {
            onEncryptedChange(checked === true);
          }}
        />
        <Label htmlFor='portable-share-encrypted' className='font-normal'>
          Encrypt with a password
        </Label>
      </div>
      {isEncrypted ? (
        <div className='ml-6 flex flex-col gap-3'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='portable-share-password'>Password</Label>
            <Input
              id='portable-share-password'
              type='password'
              autoComplete='new-password'
              value={password}
              disabled={isLocked}
              aria-invalid={password.length > 0 && !fitsPassword(encryption, password)}
              onChange={(event) => {
                onPasswordChange(event.target.value);
              }}
            />
            <p className='text-xs text-muted-foreground'>
              Use {encryption.minBytes}–{encryption.maxBytes} UTF-8 bytes ({passwordBytes} entered).
            </p>
          </div>
          <div className='flex items-start gap-2'>
            <Checkbox
              id='portable-share-include-password'
              checked={shouldIncludePassword}
              disabled={isLocked}
              onCheckedChange={(checked) => {
                onIncludePasswordChange(checked === true);
              }}
            />
            <Label htmlFor='portable-share-include-password' className='font-normal'>
              Include password in the link
            </Label>
          </div>
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
    return <Loader2 className='size-4 animate-spin' aria-hidden />;
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
        <div key={option.id} className='flex items-start gap-2'>
          <Checkbox
            id={`portable-share-${option.id}`}
            checked={values[option.id] === true}
            disabled={isLocked}
            onCheckedChange={(checked) => {
              onChange(option.id, checked === true);
            }}
          />
          <Label htmlFor={`portable-share-${option.id}`} className='font-normal'>
            {option.label}
          </Label>
        </div>
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
    <Button ref={buttonRef} type='button' disabled={isDisabled} onClick={primary?.onActivate ?? onShare}>
      <ShareLinkActionIcon isBusy={isBusy} isCopied={isCopied} icon={icon} />
      <span>{primary?.label ?? label}</span>
    </Button>
  );
}

const clipboardDenied = 'The link was created but clipboard access was denied. Copy it below.';

/**
 * The body of a link method: what the link is, its password and other options, any callouts its extension adds, and
 * the button that makes the link, copies it and confirms the copy with a tick.
 *
 * @param props - The method, how a copy is announced, and where the body reports that it is busy.
 * @returns The notice, choices, callouts, link field and action row.
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

  const share = async (): Promise<void> => {
    const controller = new AbortController();
    operationRef.current?.abort();
    operationRef.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      if (shareUrl) {
        await navigator.clipboard.writeText(shareUrl);
        triggerCopiedTick();
        notify?.('Link copied');
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
        notify?.(method.copiedMessage);
      } catch {
        setError(clipboardDenied);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sharing failed.');
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
  const notice = encrypted && encryption ? encryption.notice : method.notice;
  const isLocked = busy || Boolean(shareUrl);
  const error = operationError ?? extension.error;

  return (
    <div className='flex flex-col gap-4'>
      <div className='rounded-lg border bg-muted/30 p-4'>
        <div className='flex items-start gap-3'>
          {method.notice.icon}
          <div className='min-w-0 text-sm'>
            <p className='font-medium'>{notice.title}</p>
            <p className='mt-1 text-muted-foreground'>{notice.text}</p>
          </div>
        </div>
      </div>
      {hasChoices ? (
        <div className='flex flex-col gap-3'>
          {encryption ? (
            <ShareLinkEncryption
              encryption={encryption}
              isEncrypted={encrypted}
              password={password}
              shouldIncludePassword={includePassword}
              isLocked={isLocked}
              onEncryptedChange={setEncrypted}
              onPasswordChange={setPassword}
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
      {error ? (
        <div className='rounded-md border border-feature/40 bg-feature/10 px-3 py-2 text-sm text-feature'>{error}</div>
      ) : null}
      {warning ? (
        <div className='rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm'>{warning}</div>
      ) : null}
      {shareUrl ? <Input aria-label='Share link' readOnly value={shareUrl} /> : null}
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
