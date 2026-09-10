import { KeyRound } from 'lucide-react';
import { externalAgentDisplayName } from '#lib/agent-host-placement.js';
import { CopyButton } from '#components/copy-button.js';
import type { AgentHostLogin } from '#services/agent-host-event-projection.js';

/**
 * What the *user* has to do to sign an external agent in (V11).
 *
 * Tau brokers nothing here, and that is the design, not a gap: the credential
 * planes stay separate (X6/VI4), so Tau never opens a vendor login, never runs
 * the command and never sees what either produces. It renders the facts the
 * agent handed back — a verification URL and its code, or a command line — and
 * the user completes the flow wherever they actually are, which is the only
 * answer that also works for a browser paired to a remote daemon.
 *
 * @param props - The login the agent is waiting on.
 * @returns The affordance, rendered inside the approval banner's slot.
 * @public
 */
export function ChatLoginAffordance({ login }: { readonly login: AgentHostLogin }): React.JSX.Element {
  const name = externalAgentDisplayName(login.agentId);
  const commands = login.methods.flatMap((method) => (method.terminalCommand ? [method] : []));
  return (
    <section
      aria-label={`Sign in to ${name}`}
      className='border-amber-500/40 bg-amber-500/10 mb-2 flex flex-col gap-2 rounded-md border p-3 text-sm'
    >
      <div className='flex min-w-0 items-center gap-2'>
        <KeyRound className='text-amber-600 size-4 shrink-0' />
        <p className='min-w-0 truncate font-medium'>{`${name} needs you to sign in`}</p>
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
      {commands.length > 0 ? (
        <div className='flex min-w-0 flex-col gap-1'>
          <p className='text-xs text-muted-foreground'>
            Run this in a terminal on the machine running the agent, then send your message again:
          </p>
          {commands.map((method) => (
            <div key={method.id} className='flex min-w-0 items-center gap-2'>
              <code className='min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs'>
                {method.terminalCommand}
              </code>
              <CopyButton size='xs' getText={() => method.terminalCommand ?? ''} />
            </div>
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
