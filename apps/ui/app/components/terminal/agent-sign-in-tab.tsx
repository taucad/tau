/**
 * One external agent's sign-in, in its own workbench tab (ACP agent policy rule 10).
 *
 * The tab shows the agent's own sign-in command filled in, and runs it only when the person presses Enter or Run. Main
 * chose what runs from its own discovery; this tab only names the agent. From then on the tab is a plain terminal onto
 * that one CLI: keystrokes go to it and its output is drawn, and nothing here reads, matches or keeps either beyond the
 * renderer's in-memory scrollback, which goes when the tab closes. A link the CLI prints opens in the person's default
 * browser on Ctrl/Cmd+click, never inside Tau. The tab ends when the CLI exits, and tells the chat the exit code alone.
 * Asking for the sign-in again once it has ended starts a fresh attempt in the same tab.
 */

import { useEffect, useRef, useState } from 'react';
import { terminalLimits } from '@taucad/types/desktop-terminal';
import type {
  AgentSignInHostFrame,
  DesktopAgentSignInBridge,
  DesktopAgentSignInSession,
} from '@taucad/types/desktop-agent-sign-in';
import { Button } from '@taucad/ui/components/button';
import { externalAgentDisplayName } from '#lib/agent-host-placement.js';
import {
  reportAgentSignInExit,
  reportAgentSignInRefused,
  useAgentSignInAttempt,
} from '#components/terminal/agent-sign-ins.js';
import type { TerminalRendererView } from '#components/terminal/terminal-renderer.js';
import { outputSlices } from '#components/terminal/terminal-output-text.js';
import {
  loadTerminalRenderer,
  openTerminalLink,
  terminalViewOptions,
} from '#components/terminal/terminal-view-options.js';
import type { TerminalRendererLoader } from '#components/terminal/terminal-view-options.js';

type TabState =
  | Readonly<{ phase: 'opening' }>
  | Readonly<{ phase: 'ready' }>
  | Readonly<{ phase: 'running' }>
  | Readonly<{ phase: 'ended'; exitCode: Extract<AgentSignInHostFrame, { type: 'exited' }>['exitCode'] }>
  | Readonly<{ phase: 'refused'; message: string }>;

/** Control characters drawn literally would be terminal commands; a command line never needs one. */
// oxlint-disable-next-line no-control-regex -- matching control characters is the point: they are replaced.
const printable = (text: string): string => text.replaceAll(/[\u0000-\u001F\u007F-\u009F]/gu, '?');

type AgentSignInTabProperties = {
  readonly agentId: string;
  readonly bridge: DesktopAgentSignInBridge;
  readonly onClose: () => void;
  readonly loadRenderer?: TerminalRendererLoader;
};

/**
 * The sign-in tab's body: one attempt at a time, each a fresh session and renderer.
 *
 * @param props - The agent, the preload bridge, the tab's close action and, for tests, a renderer loader.
 * @returns The tab body.
 * @public
 */
export function AgentSignInTab(props: AgentSignInTabProperties): React.JSX.Element {
  const attempt = useAgentSignInAttempt(props.agentId);
  return <AgentSignInAttempt key={attempt} {...props} />;
}

/**
 * One sign-in attempt: the filled-in command, then the CLI until it exits.
 *
 * @param props - The agent, the preload bridge, the tab's close action and, for tests, a renderer loader.
 * @returns The attempt's body.
 */
function AgentSignInAttempt({
  agentId,
  bridge,
  onClose,
  loadRenderer = loadTerminalRenderer,
}: AgentSignInTabProperties): React.JSX.Element {
  const name = externalAgentDisplayName(agentId);
  const hostRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<(() => void) | undefined>(undefined);
  const [state, setState] = useState<TabState>({ phase: 'opening' });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    let disposed = false;
    let view: TerminalRendererView | undefined;
    let session: DesktopAgentSignInSession | undefined;
    let ready = false;
    let started = false;
    /* Frames that arrive while the renderer loads, drawn once it has. */
    const early: AgentSignInHostFrame[] = [];

    const run = (): void => {
      if (!ready || started || view === undefined) {
        return;
      }
      started = true;
      view.write('\r\n', () => undefined);
      session?.start(view.fit());
      setState({ phase: 'running' });
    };
    runRef.current = run;

    const draw = (frame: AgentSignInHostFrame): void => {
      if (view === undefined) {
        early.push(frame);
        return;
      }
      switch (frame.type) {
        case 'ready': {
          ready = true;
          view.write(
            `\u001B[2mPress Enter to run ${printable(externalAgentDisplayName(agentId))}'s own sign-in. Tau does not read what happens here.\u001B[0m\r\n$ ${printable(frame.commandLine)}`,
            () => undefined,
          );
          view.focus();
          setState({ phase: 'ready' });
          break;
        }
        case 'output': {
          view.write(frame.data, () => undefined);
          break;
        }
        case 'exited': {
          session = undefined;
          /* The exit code is all the chat hears: it carries on after an exit 0 and says how anything else ended. */
          reportAgentSignInExit(agentId, frame.exitCode ?? undefined);
          setState({ phase: 'ended', exitCode: frame.exitCode });
          break;
        }
        case 'refused': {
          session = undefined;
          reportAgentSignInRefused(agentId);
          setState({ phase: 'refused', message: frame.message });
          break;
        }
      }
    };

    session = bridge.open(agentId, (frame) => {
      if (!disposed) {
        draw(frame);
      }
    });

    const mount = async (): Promise<void> => {
      let loaded: TerminalRendererView;
      try {
        loaded = await loadRenderer({
          ...terminalViewOptions(host, false),
          onLinkActivate: openTerminalLink,
          onLeave() {
            host.blur();
          },
          onMetricsChange() {
            if (started && host.clientWidth > 0) {
              session?.resize(loaded.fit());
            }
          },
        });
      } catch {
        if (!disposed) {
          session?.close();
          reportAgentSignInRefused(agentId);
          setState({ phase: 'refused', message: "The Terminal's renderer could not load." });
        }
        return;
      }
      if (disposed) {
        loaded.dispose();
        return;
      }
      view = loaded;
      loaded.fit();
      loaded.onData((data) => {
        if (!started) {
          /* Before the person runs it, only Enter means anything, and nothing is sent anywhere. */
          if (data === '\r') {
            run();
          }
          return;
        }
        for (const slice of outputSlices(data, terminalLimits.inputCharacters)) {
          session?.input(slice);
        }
      });
      for (const frame of early.splice(0)) {
        draw(frame);
      }
    };
    void mount();

    const observer = new ResizeObserver(() => {
      if (started && view !== undefined && host.clientWidth > 0) {
        session?.resize(view.fit());
      }
    });
    observer.observe(host);

    return () => {
      disposed = true;
      runRef.current = undefined;
      observer.disconnect();
      if (started && session !== undefined) {
        /* Closing the tab stops a CLI that was still running; the card hears that as a stop, never a success. */
        reportAgentSignInExit(agentId, undefined);
      }
      session?.close();
      session = undefined;
      view?.dispose();
      view = undefined;
    };
  }, [agentId, bridge, loadRenderer]);

  return (
    /* `ph-no-capture`: neither analytics autocapture nor session replay records a vendor's sign-in URL or code,
     * which the renderer's hidden screen-reader region holds as text. */
    <div role='region' aria-label={`Sign in to ${name}`} className='ph-no-capture flex size-full flex-col'>
      <div className='relative min-h-0 flex-1'>
        <div
          ref={hostRef}
          data-slot='agent-sign-in-terminal'
          className='absolute inset-0 overflow-hidden bg-background px-3 py-2'
        />
      </div>
      {state.phase === 'ready' ? (
        <div className='flex flex-wrap items-center gap-2 border-t bg-card p-3 text-sm'>
          <span className='min-w-0 flex-1 text-muted-foreground'>
            {`Press Enter to run ${name}'s own sign-in. It opens in your browser.`}
          </span>
          <Button size='sm' onClick={() => runRef.current?.()}>
            Run
          </Button>
        </div>
      ) : null}
      {state.phase === 'ended' || state.phase === 'refused' ? (
        <div role='status' className='flex flex-wrap items-center gap-2 border-t bg-card p-3 text-sm'>
          <span className='min-w-0 flex-1'>
            {state.phase === 'ended'
              ? state.exitCode === 0
                ? `Signed in. The chat that asked continues where ${name} stopped, as soon as it is open.`
                : `The sign-in ended${state.exitCode === null ? ' before it finished' : ` with exit code ${String(state.exitCode)}`}.`
              : state.message}
          </span>
          <Button size='sm' variant='outline' onClick={onClose}>
            Close
          </Button>
        </div>
      ) : null}
    </div>
  );
}
