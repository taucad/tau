import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CadAgentExecution } from '@taucad/chat';
import { ActiveChatProvider, useChatComposer } from '#hooks/active-chat-provider.js';
import { ChatExecutionSelector } from '#components/chat/chat-execution-selector.js';
import { PaseoConnectionSettings } from '#components/settings/paseo-connection-settings.js';
import { Button } from '@taucad/ui/components/button';
import { getEnvironment } from '#environment.config.js';
import { useProjectManager } from '#hooks/use-project-manager.js';

const paseoChatId = 'chat_e2e_paseo_connection';
const paseoResourceId = 'e2e_paseo_connection_resource';

export const loader = async (): Promise<Response> => {
  const environment = await getEnvironment();
  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses Response for route control flow.
    throw new Response('Not found', { status: 404 });
  }
  return Response.json({ ok: true });
};

const AgentSelector = (): React.JSX.Element => (
  <ChatExecutionSelector>
    {({ label }) => (
      <Button type='button' variant='outline' aria-label={`Select agent: ${label}`}>
        {label}
        <ChevronDown aria-hidden='true' />
      </Button>
    )}
  </ChatExecutionSelector>
);

const PersistedExecutionEvidence = (): React.JSX.Element => {
  const projectManager = useProjectManager();
  const {
    execution: { execution },
  } = useChatComposer();
  const [persisted, setPersisted] = useState<CadAgentExecution>();

  useEffect(() => {
    let cancelled = false;
    let frame: number | undefined;
    const poll = async (): Promise<void> => {
      const chat = await projectManager.getChat(paseoChatId);
      const activeExecution = chat?.activeExecution;
      if (cancelled) {
        return;
      }
      const matches =
        activeExecution?.kind === execution.kind &&
        (execution.kind === 'tau'
          ? activeExecution.kind === 'tau' && activeExecution.model === execution.model
          : execution.kind === 'paseo' &&
            activeExecution.kind === 'paseo' &&
            activeExecution.connectionId === execution.connectionId &&
            activeExecution.agentId === execution.agentId);
      if (matches) {
        setPersisted(execution);
        return;
      }
      frame = requestAnimationFrame(() => {
        void poll();
      });
    };
    void poll();
    return () => {
      cancelled = true;
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
  }, [execution, projectManager]);

  return (
    <output
      hidden
      data-testid='paseo-persisted-execution'
      data-kind={persisted?.kind}
      data-connection-id={persisted?.kind === 'paseo' ? persisted.connectionId : undefined}
      data-agent-id={persisted?.kind === 'paseo' ? persisted.agentId : undefined}
    />
  );
};

/** Production Paseo components mounted without the account gate for browser qualification. */
export default function PaseoConnectionDebugRoute(): React.JSX.Element {
  const projectManager = useProjectManager();
  const started = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    const ensureChat = async (): Promise<void> => {
      try {
        const existing = await projectManager.getChat(paseoChatId);
        if (!existing) {
          await projectManager.createChat(paseoResourceId, {
            id: paseoChatId,
            name: 'Paseo connection qualification',
            messages: [],
          });
        }
        setReady(true);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      }
    };
    void ensureChat();
  }, [projectManager]);

  if (error) {
    return <main role='alert'>Paseo qualification setup failed: {error}</main>;
  }
  if (!ready) {
    return <main role='status'>Preparing Paseo qualification…</main>;
  }

  return (
    <main className='mx-auto grid max-w-4xl gap-8 p-8'>
      <section className='grid gap-3' aria-labelledby='paseo-agent-selector-title'>
        <h1 id='paseo-agent-selector-title' className='text-xl font-semibold'>
          Agent connection qualification
        </h1>
        <ActiveChatProvider chatId={paseoChatId}>
          <AgentSelector />
          <PersistedExecutionEvidence />
        </ActiveChatProvider>
      </section>
      <PaseoConnectionSettings />
    </main>
  );
}
