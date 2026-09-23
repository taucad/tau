import { useEffect, useRef, useState } from 'react';
import type { AcpSessionData } from '@taucad/chat';
import { useChatComposer } from '#hooks/active-chat-provider.js';

/** One option an external agent's session offers, besides its model. */
export type AgentConfigOption = AcpSessionData['configOptions'][number];

/** The agent's own options, and how to read and change them. */
export type AgentConfig = {
  /** Every non-model option the session reported, in its order. Empty on Tau or before the first turn. */
  readonly options: readonly AgentConfigOption[];
  /** The value in force: a pending choice first, else what the session confirmed. */
  readonly valueOf: (option: AgentConfigOption) => string | boolean;
  readonly select: (id: string, value: string | boolean) => void;
};

/** The one option of a protocol category (`mode`, `thought_level`), when the agent offers it as a select. */
export const configOptionOf = (
  config: AgentConfig,
  category: string,
): Extract<AgentConfigOption, { readonly type: 'select' }> | undefined =>
  config.options.find(
    (option): option is Extract<AgentConfigOption, { readonly type: 'select' }> =>
      option.category === category && option.type === 'select',
  );

/** A select option's values, with any groups flattened. */
export const configValues = (
  option: Extract<AgentConfigOption, { readonly type: 'select' }>,
): ReadonlyArray<{ readonly value: string; readonly name: string; readonly description: string | undefined }> =>
  option.options
    .flatMap((entry) => ('options' in entry ? entry.options : [entry]))
    .map((value) => ({ value: value.value, name: value.name, description: value.description ?? undefined }));

/**
 * An external agent's configuration, reconciled with its session.
 *
 * A choice is written to the execution at once and sent with the next turn; it
 * stays pending until the session confirms it. Called once per composer, so
 * the settings sheet and the mode control read and write one pending set.
 *
 * @param sessionData - The latest session presentation for the chat.
 * @param status - The chat's status; a settled turn confirms what it carried.
 * @returns The options, their values and the setter.
 */
export const useAgentConfig = (sessionData: AcpSessionData | undefined, status: string): AgentConfig => {
  const {
    execution: { execution, setActiveExecution },
  } = useChatComposer();
  const confirmed = JSON.stringify(sessionData?.configOptions.map((option) => [option.id, option.currentValue]) ?? []);
  const [pending, setPending] = useState<{
    readonly confirmed: string;
    readonly values: Readonly<Record<string, string | boolean>>;
    readonly submitted: Readonly<Record<string, string | boolean>>;
  }>({ confirmed, values: {}, submitted: {} });
  const previousStatus = useRef(status);
  const previousSession = useRef<AcpSessionData | undefined>(undefined);
  useEffect(() => {
    const started = previousStatus.current === 'ready' && status !== 'ready';
    const settled = previousStatus.current !== 'ready' && status === 'ready';
    const sessionUpdated = previousSession.current !== sessionData;
    const sessionReplaced =
      previousSession.current?.sessionId !== undefined && previousSession.current.sessionId !== sessionData?.sessionId;
    previousStatus.current = status;
    previousSession.current = sessionData;
    if (started && !sessionReplaced) {
      setPending((current) => ({ ...current, submitted: current.values }));
      return;
    }
    if ((!settled && !sessionUpdated) || execution.kind !== 'acp') {
      return;
    }
    const retained = Object.fromEntries(
      Object.entries(pending.values).filter(
        ([id, value]) =>
          !sessionReplaced && (!settled || !Object.hasOwn(pending.submitted, id) || pending.submitted[id] !== value),
      ),
    );
    setPending({ confirmed, values: retained, submitted: settled || sessionReplaced ? {} : pending.submitted });
    if (sessionData?.agentId === execution.agentId) {
      const actual = Object.fromEntries(
        sessionData.configOptions.flatMap((option) =>
          option.category !== 'model' &&
          (typeof option.currentValue === 'string' || typeof option.currentValue === 'boolean')
            ? [[option.id, option.currentValue]]
            : [],
        ),
      );
      const { config: _config, ...selection } = execution;
      const config = { ...actual, ...retained };
      setActiveExecution({ ...selection, ...(Object.keys(config).length === 0 ? {} : { config }) });
    }
  }, [confirmed, execution, pending, sessionData, setActiveExecution, status]);
  const pendingValues = pending.confirmed === confirmed ? pending.values : {};
  /* A session of another agent (the chat just switched) offers nothing for this one. */
  const options =
    execution.kind === 'acp' && sessionData?.agentId === execution.agentId
      ? sessionData.configOptions.filter((option) => option.category !== 'model')
      : [];
  return {
    options,
    valueOf: (option) => pendingValues[option.id] ?? option.currentValue,
    select: (id, value) => {
      if (execution.kind !== 'acp') {
        return;
      }
      setPending((current) => ({
        ...current,
        confirmed,
        values: { ...(current.confirmed === confirmed ? current.values : {}), [id]: value },
      }));
      setActiveExecution({ ...execution, config: { ...execution.config, [id]: value } });
    },
  };
};
