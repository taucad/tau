/**
 * The desktop Terminal pane (blueprint W6, D21, I8, I9, A13–A15): a person's own shell in the project folder, drawn by
 * the lazily loaded AurigaX renderer over `window.tau.terminal`.
 *
 * - Opening the pane starts one session when its project becomes available. Exits and refusals require an explicit retry.
 * - Extra access is approved here, in pane chrome Tau draws, against the request id the host minted. Output is
 *   terminal data on a canvas; it can describe a decision but never make one (I9).
 * - The session lives while the pane is mounted, hidden or not, and ends when the pane closes, the project changes
 *   or the Terminal stops being available. Closing a pane whose session runs asks first: Keep open, Hide or Close
 *   and stop. A project change ends it unconditionally and opens a fresh session for the new project.
 */

import { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { SquareTerminal } from 'lucide-react';
import { terminalAccessSchema, terminalLimits } from '@taucad/types/desktop-terminal';
import type {
  DesktopTerminalBridge,
  DesktopTerminalSession,
  TerminalAccess,
  TerminalExitReason,
  TerminalHostFrame,
  TerminalRefusal,
} from '@taucad/types/desktop-terminal';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '@taucad/ui/components/context-menu';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { cookieName } from '#constants/cookie.constants.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useProject } from '#hooks/use-project.js';
import { useTerminalAvailability } from '#components/terminal/terminal-availability.js';
import type { TerminalAvailability } from '#components/terminal/terminal-availability.js';
import type { TerminalRendererOptions, TerminalRendererView } from '#components/terminal/terminal-renderer.js';
import { outputSlices } from '#components/terminal/terminal-output-text.js';
import { TerminalCloseContext, TerminalCloseDecision } from '#components/terminal/terminal-close.js';
import type { TerminalCloseChoice } from '#components/terminal/terminal-close.js';
import { TerminalNavigationGuard } from '#components/terminal/terminal-navigation-guard.js';
import { highContrastQuery, highContrastRatio, readTerminalTheme } from '#components/terminal/terminal-theme.js';

/** Loads the renderer; the default imports it lazily so no other surface pays for it. @public */
export type TerminalRendererLoader = (options: TerminalRendererOptions) => Promise<TerminalRendererView>;

const loadTerminalRenderer: TerminalRendererLoader = async (options) => {
  const { createTerminalRenderer } = await import('#components/terminal/terminal-renderer.js');
  return createTerminalRenderer(options);
};

type AccessRequest = Readonly<{ requestId: string; access: TerminalAccess; expiresAt: string }>;

type PaneState =
  | Readonly<{ phase: 'idle' }>
  | Readonly<{ phase: 'starting' }>
  | Readonly<{ phase: 'running'; projectLabel: string; access: TerminalAccess }>
  | Readonly<{
      phase: 'ended';
      reason: TerminalExitReason;
      exitCode: Extract<TerminalHostFrame, { type: 'exited' }>['exitCode'];
    }>
  | Readonly<{ phase: 'refused'; refusal: TerminalRefusal }>;

const fontFamily = "'Geist Mono', ui-monospace, monospace";
const fontSize = 13;
const scrollbackLines = 10_000;
// Bound synchronous bridge startup separately from the host's ongoing backpressure window.
const initialFrameLimit = 64;

const endedCopy: Record<TerminalExitReason, string> = {
  'shell-exited': 'The shell exited.',
  closed: 'The Terminal was closed.',
  replaced: 'The Terminal restarted with new access.',
  'project-changed': 'The Terminal ended because the project changed.',
  'host-stopped': "The Terminal ended because Tau's shell service stopped.",
};

/** Split a comma- or line-separated field into entries. */
const entries = (value: string): string[] =>
  value
    .split(/[\n,]/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

/** The trusted card for one host-minted access request. */
function TerminalAccessDecision({
  request,
  onDecide,
}: {
  readonly request: AccessRequest;
  readonly onDecide: (decision: 'allow' | 'deny') => void;
}): React.JSX.Element {
  const titleId = useId();
  const rows = [
    { label: 'Read', values: request.access.read },
    { label: 'Write', values: request.access.write },
    { label: 'Network', values: request.access.domains },
  ].filter((row) => row.values.length > 0);
  return (
    <section
      aria-labelledby={titleId}
      data-slot='terminal-access-decision'
      data-request-id={request.requestId}
      className='flex flex-col gap-2 border-b bg-card p-3 text-sm'
    >
      <h4 id={titleId} className='font-medium'>
        Allow this Terminal more access?
      </h4>
      <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
        {rows.map((row) => (
          <div key={row.label} className='contents'>
            <dt className='text-muted-foreground'>{row.label}</dt>
            <dd className='font-mono break-all'>{row.values.join(', ')}</dd>
          </div>
        ))}
      </dl>
      <p className='text-muted-foreground'>
        Allowing starts a new Terminal with this access. Nothing you typed is sent again.
      </p>
      <div className='flex gap-2'>
        <Button
          size='sm'
          onClick={() => {
            onDecide('allow');
          }}
        >
          Allow and restart
        </Button>
        <Button
          size='sm'
          variant='outline'
          onClick={() => {
            onDecide('deny');
          }}
        >
          Deny
        </Button>
      </div>
    </section>
  );
}

/** The person's own request for extra access; the host answers with a request id the card above decides. */
function TerminalAccessForm({
  inputRef,
  onSubmit,
  onCancel,
}: {
  readonly inputRef: React.Ref<HTMLInputElement>;
  readonly onSubmit: (access: TerminalAccess) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const [read, setRead] = useState('');
  const [write, setWrite] = useState('');
  const [domains, setDomains] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const id = useId();
  return (
    <form
      aria-label='Request Terminal access'
      className='flex flex-col gap-2 border-b bg-card p-3 text-sm'
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = terminalAccessSchema.safeParse({
          read: entries(read),
          write: entries(write),
          domains: entries(domains).map((domain) => domain.toLowerCase()),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Check the folders and hosts.');
          return;
        }
        if (parsed.data.read.length + parsed.data.write.length + parsed.data.domains.length === 0) {
          setError('Name at least one folder or host.');
          return;
        }
        setError(undefined);
        onSubmit(parsed.data);
      }}
    >
      <label htmlFor={`${id}-read`}>Folders to read</label>
      <Input
        ref={inputRef}
        id={`${id}-read`}
        autoFocus
        value={read}
        placeholder='/path/to/folder'
        onChange={(event) => {
          setRead(event.target.value);
        }}
      />
      <label htmlFor={`${id}-write`}>Folders to write</label>
      <Input
        id={`${id}-write`}
        value={write}
        onChange={(event) => {
          setWrite(event.target.value);
        }}
      />
      <label htmlFor={`${id}-domains`}>Hosts to reach</label>
      <Input
        id={`${id}-domains`}
        value={domains}
        placeholder='registry.npmjs.org'
        onChange={(event) => {
          setDomains(event.target.value);
        }}
      />
      <p className='text-muted-foreground'>
        Separate entries with commas. Up to {terminalLimits.accessEntries} of each.
      </p>
      {error ? (
        <p role='alert' className='text-destructive'>
          {error}
        </p>
      ) : null}
      <div className='flex gap-2'>
        <Button size='sm' type='submit'>
          Request access
        </Button>
        <Button size='sm' type='button' variant='outline' onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The Terminal pane body.
 *
 * @param props - The availability from the shared predicate and, for tests, a renderer loader.
 * @returns The pane.
 * @public
 */
export function TerminalPane({
  availability,
  loadRenderer = loadTerminalRenderer,
  onRunningChange,
}: {
  readonly availability: TerminalAvailability;
  readonly loadRenderer?: TerminalRendererLoader;
  /** Told the running session's project label, and `undefined` once no session runs. */
  readonly onRunningChange?: (projectLabel: string | undefined) => void;
}): React.JSX.Element {
  const actionsDescriptionId = useId();
  const [state, setState] = useState<PaneState>({ phase: 'idle' });
  const [accessRequest, setAccessRequest] = useState<AccessRequest | undefined>(undefined);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  const [findTerm, setFindTerm] = useState<string | undefined>(undefined);
  const menuActionRef = useRef(false);
  const actionInputRef = useRef<HTMLInputElement>(null);
  const restartRef = useRef(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);
  const closeHost = useContext(TerminalCloseContext);
  const [screenReaderMode] = useCookie(cookieName.terminalScreenReader, true);
  const hostRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<TerminalRendererView | undefined>(undefined);
  const sessionRef = useRef<DesktopTerminalSession | undefined>(undefined);
  /* Bumped on every start and teardown, so a renderer that finishes loading for an abandoned start is disposed. */
  const generationRef = useRef(0);
  const startRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const screenReaderModeRef = useRef(screenReaderMode);
  /* The project root and bridge the current or last session was started against. */
  const targetRef = useRef<{ projectRoot: string; bridge: DesktopTerminalBridge } | undefined>(undefined);

  /* The phase a close request reads; a request arrives from outside React, after the render it acts on. */
  const phaseRef = useRef<PaneState['phase']>(state.phase);
  useLayoutEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);
  const runningLabel = state.phase === 'running' ? state.projectLabel : undefined;
  useEffect(() => {
    onRunningChange?.(runningLabel);
  }, [onRunningChange, runningLabel]);
  /* A running session holds the page's unload, so Tau desktop asks before closing or reloading the window stops it
   * (T15). Only while it runs: no other page state ever holds an unload. */
  const isRunning = state.phase === 'running';
  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const holdUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    globalThis.addEventListener('beforeunload', holdUnload);
    return () => {
      globalThis.removeEventListener('beforeunload', holdUnload);
    };
  }, [isRunning]);

  const projectRoot = availability.status === 'available' ? availability.projectRoot : undefined;
  const bridge = availability.status === 'available' ? availability.bridge : undefined;

  const teardown = useCallback(() => {
    generationRef.current += 1;
    restartRef.current = false;
    sessionRef.current?.close();
    sessionRef.current = undefined;
    viewRef.current?.dispose();
    viewRef.current = undefined;
  }, []);

  /* The pane closing, the project changing or the Terminal becoming unavailable all end the session. */
  useEffect(
    () => () => {
      const target = targetRef.current;
      if (!target || target.projectRoot !== projectRoot || target.bridge !== bridge) {
        return;
      }
      targetRef.current = undefined;
      teardown();
      setState({ phase: 'idle' });
      setAccessRequest(undefined);
      setIsConfirmingClose(false);
    },
    [projectRoot, bridge, teardown],
  );

  /* A running session holds the host's close for the person's choice; any other phase closes at once. */
  useEffect(
    () =>
      closeHost?.register(() => {
        if (phaseRef.current !== 'running') {
          return false;
        }
        setIsConfirmingClose(true);
        return true;
      }),
    [closeHost],
  );

  const chooseClose = useCallback(
    (choice: TerminalCloseChoice) => {
      setIsConfirmingClose(false);
      switch (choice) {
        case 'keep': {
          viewRef.current?.focus();
          break;
        }
        case 'hide': {
          closeHost?.hide();
          break;
        }
        case 'stop': {
          targetRef.current = undefined;
          teardown();
          setState({ phase: 'idle' });
          closeHost?.close();
          break;
        }
      }
    },
    [closeHost, teardown],
  );

  useEffect(() => {
    screenReaderModeRef.current = screenReaderMode;
    viewRef.current?.setScreenReaderMode(screenReaderMode);
  }, [screenReaderMode]);

  /* Keep the grid fitted while the pane is resized, hidden and shown again. */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || state.phase !== 'running') {
      return;
    }
    let frame: number | undefined;
    const observer = new ResizeObserver(() => {
      if (frame !== undefined) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = undefined;
        const size = viewRef.current?.fit();
        if (size && host.isConnected && host.clientWidth > 0) {
          sessionRef.current?.resize(size);
        }
      });
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
  }, [state.phase]);

  const start = useCallback(async () => {
    const host = hostRef.current;
    if (!host || projectRoot === undefined || bridge === undefined) {
      return;
    }
    teardown();
    targetRef.current = { projectRoot, bridge };
    const generation = generationRef.current;
    setState({ phase: 'starting' });
    setIsRequestingAccess(false);
    setFindTerm(undefined);
    setIsConfirmingClose(false);
    setAccessRequest(undefined);
    setNotice(undefined);
    let view: TerminalRendererView;
    try {
      view = await loadRenderer({
        host,
        fontFamily,
        fontSize,
        theme: readTerminalTheme(host),
        scrollback: scrollbackLines,
        screenReaderMode: screenReaderModeRef.current,
        minimumContrastRatio: globalThis.matchMedia(highContrastQuery).matches ? highContrastRatio : 1,
        reducedMotion: globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches,
        onLinkActivate(uri) {
          /* The desktop navigation policy sends http(s) to the person's browser and opens nothing in the app. */
          globalThis.open(uri, '_blank', 'noopener,noreferrer');
        },
        onLeave() {
          chromeRef.current?.focus();
        },
      });
    } catch {
      if (generation === generationRef.current) {
        setState({
          phase: 'refused',
          refusal: {
            code: 'sandbox-unavailable',
            message: "The Terminal's renderer could not load.",
            recovery: 'Restart Tau, then start the Terminal.',
          },
        });
      }
      return;
    }
    if (generation !== generationRef.current) {
      view.dispose();
      return;
    }
    viewRef.current = view;
    /* Counts the shells this port has served. An access replacement keeps the port but starts the host's offsets
     * again at zero, so output of the replaced shell that paints afterwards acknowledges nothing: its offset would be
     * beyond the new shell's, which the host refuses as an invalid frame and ends the Terminal. */
    let shell = 0;
    const onFrame = (frame: TerminalHostFrame): void => {
      if (generation !== generationRef.current) {
        return;
      }
      switch (frame.type) {
        case 'opened': {
          setState({ phase: 'running', projectLabel: frame.session.projectLabel, access: frame.session.access });
          view.focus();
          break;
        }
        case 'output': {
          const { offset } = frame;
          const painting = shell;
          view.write(frame.data, () => {
            if (generation === generationRef.current && painting === shell) {
              sessionRef.current?.ack(offset);
            }
          });
          break;
        }
        case 'access-requested': {
          setIsRequestingAccess(false);
          setAccessRequest({ requestId: frame.requestId, access: frame.access, expiresAt: frame.expiresAt });
          break;
        }
        case 'exited': {
          /* The close question is about a running session; once it ends, closing needs no answer. */
          setIsConfirmingClose(false);
          setAccessRequest(undefined);
          if (frame.reason === 'replaced') {
            shell += 1;
            /* The fresh session's `opened` follows; clear the old screen so its output is not mistaken for the new
             * shell's (RIS, which AurigaX handles in the engine). */
            view.write('\u001Bc', () => undefined);
            setNotice(endedCopy.replaced);
            setState({ phase: 'starting' });
            break;
          }
          sessionRef.current = undefined;
          if (restartRef.current) {
            restartRef.current = false;
            void startRef.current?.();
            break;
          }
          setState({ phase: 'ended', reason: frame.reason, exitCode: frame.exitCode });
          break;
        }
        case 'refused': {
          if (frame.code === 'request-expired') {
            setAccessRequest(undefined);
            setNotice(`${frame.message} ${frame.recovery}`);
            break;
          }
          sessionRef.current = undefined;
          setIsConfirmingClose(false);
          setAccessRequest(undefined);
          restartRef.current = false;
          setState({ phase: 'refused', refusal: frame });
          break;
        }
      }
    };
    const size = view.fit();
    let session: DesktopTerminalSession | undefined;
    const initialFrames: TerminalHostFrame[] = [];
    let initialOutputBytes = 0;
    const startup = { overflow: false };
    let hasFailed = false;
    view.onData((data) => {
      if (generation !== generationRef.current) {
        return;
      }
      for (const slice of outputSlices(data, terminalLimits.inputCharacters)) {
        session?.input(slice);
      }
    });
    try {
      // Attach input before launching; synchronous frames wait until their session can acknowledge paint.
      session = bridge.open({ projectRoot, size }, (frame) => {
        if (hasFailed || startup.overflow || generation !== generationRef.current) {
          return;
        }
        if (session !== undefined) {
          onFrame(frame);
          return;
        }
        const bytes = frame.type === 'output' ? frame.data.length * 2 : 0;
        if (
          initialFrames.length >= initialFrameLimit ||
          bytes > terminalLimits.unacknowledgedBytes - initialOutputBytes
        ) {
          startup.overflow = true;
          initialFrames.length = 0;
          return;
        }
        initialOutputBytes += bytes;
        initialFrames.push(frame);
      });
      if (generation !== generationRef.current) {
        session.close();
        return;
      }
      sessionRef.current = session;
      if (startup.overflow) {
        throw new Error('Terminal startup exceeded its frame bound.');
      }
      for (const frame of initialFrames) {
        onFrame(frame);
      }
    } catch {
      hasFailed = true;
      if (generation === generationRef.current) {
        teardown();
        setState({
          phase: 'refused',
          refusal: {
            code: startup.overflow ? 'invalid-frame' : 'pty-unavailable',
            message: startup.overflow
              ? 'The Terminal sent too much startup data.'
              : 'The Terminal could not connect to its shell.',
            recovery: 'Try again.',
          },
        });
      }
    } finally {
      initialFrames.length = 0;
    }
  }, [bridge, loadRenderer, projectRoot, teardown]);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useEffect(() => {
    if (projectRoot === undefined || bridge === undefined) {
      return;
    }
    let cancelled = false;
    // Defer one microtask so StrictMode's setup/cleanup replay cannot open two sessions.
    queueMicrotask(() => {
      if (!cancelled && targetRef.current === undefined) {
        void startRef.current?.();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectRoot, bridge]);

  useKeybinding(
    { key: 'F10', shiftKey: true },
    () => {
      const root = chromeRef.current;
      if (root) {
        const bounds = root.getBoundingClientRect();
        root.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: bounds.left, clientY: bounds.top }));
      }
    },
    {
      scope: 'global',
      ignoreInputs: false,
      enabled: () => isRunning && chromeRef.current?.contains(document.activeElement) === true,
    },
  );

  if (availability.status === 'omitted') {
    return <div className='size-full' />;
  }
  if (availability.status === 'unavailable') {
    return (
      <PanelEmptyState icon={SquareTerminal} title='Terminal unavailable' description={availability.message}>
        <p className='max-w-xs text-sm text-muted-foreground'>{availability.recovery}</p>
      </PanelEmptyState>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={chromeRef}
          tabIndex={-1}
          role='region'
          aria-label='Terminal'
          aria-describedby={actionsDescriptionId}
          className='flex size-full flex-col outline-none focus-visible:focus-outline'
        >
          <span id={actionsDescriptionId} className='sr-only'>
            Press Shift+F10 for Terminal actions.
          </span>
          {isConfirmingClose && state.phase === 'running' ? (
            <TerminalCloseDecision projectLabel={state.projectLabel} onChoose={chooseClose} />
          ) : null}
          {notice ? (
            <p role='status' className='border-b px-3 py-2 text-xs text-muted-foreground'>
              {notice}
            </p>
          ) : null}
          {accessRequest ? (
            <TerminalAccessDecision
              request={accessRequest}
              onDecide={(decision) => {
                sessionRef.current?.decideAccess(accessRequest.requestId, decision);
                setAccessRequest(undefined);
                if (decision === 'deny') {
                  setNotice('Access request denied. The Terminal keeps its current access.');
                }
              }}
            />
          ) : null}
          {isRequestingAccess && state.phase === 'running' ? (
            <TerminalAccessForm
              inputRef={actionInputRef}
              onSubmit={(access) => {
                sessionRef.current?.requestAccess(access);
              }}
              onCancel={() => {
                setIsRequestingAccess(false);
              }}
            />
          ) : null}
          <div className='relative min-h-0 flex-1'>
            <div ref={hostRef} data-slot='terminal' className='absolute inset-0 overflow-hidden bg-background p-1' />
            {state.phase === 'running' && findTerm !== undefined ? (
              <Input
                ref={actionInputRef}
                aria-label='Find in Terminal'
                className='absolute top-2 right-2 h-7 w-40 bg-background text-xs'
                autoFocus
                value={findTerm}
                onChange={(event) => {
                  setFindTerm(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && findTerm.length > 0) {
                    event.preventDefault();
                    const found = viewRef.current?.search(findTerm, event.shiftKey) ?? false;
                    setNotice(found ? undefined : `No match for “${findTerm}”.`);
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    viewRef.current?.clearFind();
                    setFindTerm(undefined);
                    viewRef.current?.focus();
                  }
                }}
              />
            ) : null}
            {state.phase === 'idle' || state.phase === 'starting' || availability.status === 'checking' ? (
              <span role='status' aria-label='Starting Terminal' aria-busy='true' className='sr-only'>
                Starting Terminal…
              </span>
            ) : null}
            {state.phase === 'ended' || state.phase === 'refused' ? (
              <div
                role='status'
                className='absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 border-t bg-card p-3 text-sm'
              >
                <span className='min-w-0 flex-1'>
                  {state.phase === 'ended'
                    ? `${endedCopy[state.reason]}${state.exitCode === null ? '' : ` Exit code ${String(state.exitCode)}.`}`
                    : `${state.refusal.message} ${state.refusal.recovery}`}
                </span>
                <Button
                  size='sm'
                  onClick={() => {
                    void start();
                  }}
                >
                  {state.phase === 'ended' ? 'Start a new Terminal' : 'Try again'}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label='Terminal actions'
        onCloseAutoFocus={(event) => {
          if (menuActionRef.current) {
            event.preventDefault();
            menuActionRef.current = false;
            actionInputRef.current?.focus();
          }
        }}
      >
        <ContextMenuItem
          disabled={!isRunning}
          onSelect={() => {
            menuActionRef.current = true;
            setIsRequestingAccess(true);
            setFindTerm(undefined);
          }}
        >
          Request access
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!isRunning}
          onSelect={() => {
            menuActionRef.current = true;
            setFindTerm('');
            setIsRequestingAccess(false);
          }}
        >
          Find
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!isRunning}
          onSelect={() => {
            restartRef.current = true;
            setFindTerm(undefined);
            setIsRequestingAccess(false);
            sessionRef.current?.close();
          }}
        >
          Restart
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * The Terminal pane for the current project, gated by the shared predicate. The Workbench catalog and the narrow
 * layout both mount this. While its session runs, leaving the project asks first.
 *
 * @param props - The workbench profile; a shared or public view omits the Terminal.
 * @returns The pane.
 * @public
 */
export function ProjectTerminalPane({
  profile = 'editor',
}: {
  readonly profile?: 'editor' | 'shared';
}): React.JSX.Element {
  const { projectId } = useProject();
  const [runningLabel, setRunningLabel] = useState<string | undefined>(undefined);
  return (
    <>
      <TerminalPane availability={useTerminalAvailability(projectId, profile)} onRunningChange={setRunningLabel} />
      {/* Only a running session holds the router's blocker (T15). */}
      {runningLabel === undefined ? null : (
        <TerminalNavigationGuard projectId={projectId} projectLabel={runningLabel} />
      )}
    </>
  );
}
