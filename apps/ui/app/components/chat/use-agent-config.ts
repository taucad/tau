import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AcpSessionData } from '@taucad/chat';
import { isRecordedOnHost } from '@taucad/chat-ui/utils/chat-execution';
import { useChatComposer } from '#hooks/active-chat-provider.js';

/** One option an external agent's session offers, besides its model. */
export type AgentConfigOption = AcpSessionData['configOptions'][number];

/** The agent's own options, and how to read and change them. */
export type AgentConfig = {
  /** Every non-model session option, or discovered controls before the first turn. Empty on Tau. */
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
 * @param discoveredOptions - Verified agent controls and model reasoning from discovery, before a session exists.
 * @returns The options, their values and the setter.
 */
export const useAgentConfig = (
  sessionData: AcpSessionData | undefined,
  status: string,
  discoveredOptions: readonly AgentConfigOption[] = [],
): AgentConfig => {
  const {
    execution: { execution, setActiveExecution },
  } = useChatComposer();
  const ownerKey = JSON.stringify(
    execution.kind === 'acp'
      ? [execution.kind, execution.hostId, execution.agentId, execution.model]
      : [execution.kind],
  );
  const owner = useMemo(() => ({ key: ownerKey }), [ownerKey]);
  const activeOwner = useRef<typeof owner | undefined>(owner);
  useLayoutEffect(() => {
    activeOwner.current = owner;
    return () => {
      activeOwner.current = undefined;
    };
  }, [owner]);
  const liveSession =
    execution.kind === 'acp' &&
    sessionData?.agentId === execution.agentId &&
    isRecordedOnHost(sessionData.hostId, execution.hostId);
  const sessionModel = sessionData?.configOptions.find((option) => option.category === 'model')?.currentValue;
  const liveModel = liveSession && (execution.model === undefined || execution.model === sessionModel);
  const confirmedOptions = useMemo(
    () =>
      liveSession
        ? sessionData.configOptions.filter(
            (option) => option.category !== 'model' && (liveModel || option.category !== 'thought_level'),
          )
        : [],
    [liveModel, liveSession, sessionData],
  );
  const confirmed = JSON.stringify(confirmedOptions.map((option) => [option.id, option.currentValue]));
  const [pending, setPending] = useState<{
    readonly owner: typeof owner;
    readonly confirmed: string;
    readonly values: Readonly<Record<string, string | boolean>>;
    readonly submitted: Readonly<Record<string, string | boolean>>;
  }>({ owner, confirmed, values: {}, submitted: {} });
  if (pending.owner !== owner) {
    setPending({ owner, confirmed, values: {}, submitted: {} });
  }
  const inFlight = status === 'submitted' || status === 'streaming';
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
    setPending({ owner, confirmed, values: retained, submitted: settled || sessionReplaced ? {} : pending.submitted });
    /* Mid-turn records can predate the mode Tau sets for the turn; the turn's own settle writes what it confirmed. */
    if (liveSession && !inFlight) {
      const actual = Object.fromEntries(confirmedOptions.map((option) => [option.id, option.currentValue]));
      const { config: _config, ...selection } = execution;
      const selectedReasoning = liveModel
        ? {}
        : Object.fromEntries(
            discoveredOptions.flatMap((option): Array<[string, string | boolean]> => {
              const value = execution.config?.[option.id];
              return option.category === 'thought_level' && value !== undefined ? [[option.id, value]] : [];
            }),
          );
      const config = { ...selectedReasoning, ...actual, ...retained };
      setActiveExecution({ ...selection, ...(Object.keys(config).length === 0 ? {} : { config }) });
    }
  }, [
    confirmed,
    confirmedOptions,
    discoveredOptions,
    inFlight,
    execution,
    liveModel,
    liveSession,
    owner,
    pending,
    sessionData,
    setActiveExecution,
    status,
  ]);
  const pendingValues = pending.owner === owner && pending.confirmed === confirmed ? pending.values : {};
  const options = liveSession
    ? [
        ...confirmedOptions,
        ...(liveModel ? [] : discoveredOptions.filter((option) => option.category === 'thought_level')),
      ]
    : execution.kind === 'acp'
      ? discoveredOptions.filter((option) => option.category !== 'model')
      : [];
  return {
    options,
    /* A turn in flight shows what it asked for: the session record it opened with can precede the mode Tau sets
     * (Claude opens in `default`, then moves to `auto`), and settles only with the turn. */
    valueOf: (option) =>
      liveSession && (liveModel || option.category !== 'thought_level') && !inFlight
        ? (pendingValues[option.id] ?? option.currentValue)
        : (pendingValues[option.id] ??
          (execution.kind === 'acp' ? execution.config?.[option.id] : undefined) ??
          (inFlight ? discoveredOptions.find((discovered) => discovered.id === option.id)?.currentValue : undefined) ??
          option.currentValue),
    select: (id, value) => {
      if (execution.kind !== 'acp' || activeOwner.current !== owner) {
        return;
      }
      setPending((current) => ({
        ...current,
        owner,
        confirmed,
        values: { ...(current.owner === owner && current.confirmed === confirmed ? current.values : {}), [id]: value },
      }));
      setActiveExecution({ ...execution, config: { ...execution.config, [id]: value } });
    },
  };
};
