import { lazy, Suspense } from 'react';
import { KeyRound, SquareTerminal } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { externalAgentDisplayName } from '#lib/agent-host-placement.js';
import type { AgentHostLogin } from '@taucad/chat-ui/services/agent-host-event-projection';
import type { AgentSignInFailure } from '#components/terminal/agent-sign-ins.js';

/* The code block carries the syntax highlighter, so it stays off the Home page's critical path until a card shows. */
const ChatLoginCommand = lazy(async () => {
  const module = await import('#components/chat/chat-login-command.js');
  return { default: module.ChatLoginCommand };
});

/**
 * What the *user* has to do to sign an external agent in (V11).
 *
 * Tau brokers nothing here, and that is the design, not a gap: the credential
 * planes stay separate (X6/VI4), so Tau never opens a vendor login page itself
 * and never sees what the flow produces. It renders the facts the agent handed
 * back — a verification URL and its code, or a command line — and the user
 * completes the flow wherever they actually are, which is the only answer that
 * also works for a browser paired to a remote daemon.
 *
 * Where the agent runs on this desktop, the card also offers the agent's own
 * sign-in in a Terminal tab (ACP agent policy rule 10): the tab fills in the
 * command and runs it only on the user's Enter, for any agent whose profile
 * declares one. When that sign-in exits 0 the banner tries the turn again by itself; when it fails, the card says how.
 *
 * @param props - The login the agent is waiting on, the action that opens its sign-in tab when this desktop runs the
 *   agent, and how that tab's last sign-in failed.
 * @returns The affordance, rendered inside the approval banner's slot.
 * @public
 */
export function ChatLoginAffordance({
  login,
  onSignInInTerminal,
  signInFailure,
}: {
  readonly login: AgentHostLogin;
  readonly onSignInInTerminal?: (() => void) | undefined;
  readonly signInFailure?: AgentSignInFailure | undefined;
}): React.JSX.Element {
  const name = externalAgentDisplayName(login.agentId);
  const commands = login.methods.flatMap((method) => (method.terminalCommand ? [method] : []));
  return (
    /* Named apart from the sign-in tab ("Sign in to …"), so the two never share an accessible name. */
    <section
      aria-label={`${name} needs you to sign in`}
      className='mb-2 flex flex-col gap-2 rounded-lg border bg-background p-2 text-xs/5'
    >
      <div className='flex min-w-0 items-center gap-2'>
        <KeyRound aria-hidden className='size-4 shrink-0 text-muted-foreground' />
        <p className='min-w-0 text-sm/5 font-medium wrap-break-word'>{`${name} needs you to sign in`}</p>
      </div>
      {login.url === undefined ? undefined : (
        <p className='min-w-0 break-words'>
          {'Open '}
          <a className='underline underline-offset-2' href={login.url} rel='noreferrer noopener' target='_blank'>
            {login.url}
          </a>
          {login.code === undefined ? ' to continue.' : ` and enter the code ${login.code}.`}
        </p>
      )}
      {commands.length > 0 && onSignInInTerminal !== undefined ? (
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          <Button size='xs' onClick={onSignInInTerminal}>
            <SquareTerminal aria-hidden />
            Sign in in Tau&apos;s Terminal
          </Button>
          <span className='text-xs text-muted-foreground'>
            Opens a tab with the command filled in; press Enter to run it. This chat continues once it succeeds.
          </span>
        </div>
      ) : undefined}
      {signInFailure === undefined ? undefined : (
        <p role='status' className='text-xs text-feature'>
          {signInFailure.exitCode === undefined
            ? 'The sign-in was stopped before it finished.'
            : `The sign-in ended with exit code ${String(signInFailure.exitCode)}.`}
        </p>
      )}
      {commands.length > 0 ? (
        <div className='flex min-w-0 flex-col gap-1'>
          <p className='text-xs text-muted-foreground'>
            {onSignInInTerminal === undefined
              ? 'Run this in a terminal on the machine running the agent, then send your message again:'
              : 'Or run this in a terminal of your own, then send your message again:'}
          </p>
          {commands.map((method) => (
            <Suspense
              key={method.id}
              fallback={
                <pre className='rounded-md border bg-muted py-1.5 pr-9 pl-2.5 font-mono text-xs wrap-anywhere whitespace-pre-wrap'>
                  {method.terminalCommand}
                </pre>
              }
            >
              <ChatLoginCommand command={method.terminalCommand ?? ''} />
            </Suspense>
          ))}
        </div>
      ) : undefined}
      {login.url === undefined && commands.length === 0 ? (
        <p className='min-w-0 break-words'>
          {login.methods.length === 0
            ? `Sign in to ${name} on the machine running it, then send your message again.`
            : `Sign in to ${name} with one of: ${login.methods.map((method) => method.name).join(' · ')}.`}
        </p>
      ) : undefined}
      <p className='text-xs text-muted-foreground'>{`Tau never handles ${name}'s credentials; it stays signed in wherever it runs.`}</p>
    </section>
  );
}
